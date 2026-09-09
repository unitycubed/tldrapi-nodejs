/**
 * TLDRapi HTTP client for Node 18+.
 *
 * Design:
 *  - Uses the platform's built-in `fetch` (Node 18+). No third-party
 *    HTTP dependency in the shipped package.
 *  - Retries 5xx and network errors with exponential backoff + jitter,
 *    default 3 attempts. 4xx and 429 are NEVER retried (429 auto-retry
 *    would burn credits + worsen the throttle; caller should respect
 *    the Retry-After exposed on RateLimitError).
 *  - Per-request timeout via AbortController.
 *  - Typed exceptions map 1:1 to server response shapes; see errors.ts.
 */

import {
    NetworkError,
    RateLimitError,
    ServerError,
    TimeoutError,
    TLDRapiError,
    errorFromResponse,
} from './errors';

import {
    Credits,
    QualityTier,
    Rates,
    SummarizeOptions,
    SummarizeResult,
    TLDRapiClientOptions,
    Usage,
    UsageStats,
    VALID_TIERS,
} from './types';

// RapidAPI is the only auth path at launch. Customers subscribe to
// the TLDRapi listing on RapidAPI, get an X-RapidAPI-Key, and this SDK
// sends every request through the RapidAPI proxy. Direct-signup
// (bypass RapidAPI) is post-launch — when it ships we'll add a
// second constructor path.
export const DEFAULT_RAPIDAPI_HOST = 'tldrapi-summarization.p.rapidapi.com';
const DEFAULT_BASE_URL = `https://${DEFAULT_RAPIDAPI_HOST}`;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 3;
const RETRY_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
    return RETRY_BASE_MS * 2 ** attempt + Math.random() * 200;
}

function validateTier(tier?: string): QualityTier | undefined {
    if (tier === undefined || tier === null) return undefined;
    const t = String(tier).toLowerCase().trim() as QualityTier;
    if (!VALID_TIERS.includes(t)) {
        throw new Error(`invalid tier ${JSON.stringify(tier)}; must be one of ${VALID_TIERS.join(',')}`);
    }
    return t;
}

function buildHeaders(
    rapidapiKey: string,
    rapidapiHost: string,
    tier: QualityTier | undefined,
    extra?: Record<string, string>,
): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'tldrapi-node/0.1.0',
        // RapidAPI expects Key + Host together — Key authenticates the
        // customer, Host disambiguates which listing (RapidAPI proxies
        // many APIs from the same p.rapidapi.com prefix).
        'X-RapidAPI-Key': rapidapiKey,
        'X-RapidAPI-Host': rapidapiHost,
    };
    if (tier) h['X-Quality'] = tier;
    if (extra) for (const [k, v] of Object.entries(extra)) h[k] = v;
    return h;
}

async function parseBody(resp: Response): Promise<unknown> {
    const ctype = resp.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
        try {
            return await resp.json();
        } catch {
            return await resp.text();
        }
    }
    return await resp.text();
}

function extractCredits(headers: Headers): Credits {
    const out: Credits = {};
    const map: Record<string, keyof Credits> = {
        'x-credits-charged': 'charged',
        'x-credits-remaining': 'remaining',
        'x-credits-tier': 'tier',
    };
    headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (k in map) out[map[k]] = value;
    });
    return out;
}

function buildSummarizeResult(body: Record<string, unknown>, headers: Headers): SummarizeResult {
    const usageBody = (body.usage ?? {}) as Record<string, unknown>;
    const usage: Usage = {
        inputTokens: Number(usageBody.input_tokens ?? 0) || 0,
        outputTokens: Number(usageBody.output_tokens ?? 0) || 0,
        totalCost: Number(usageBody.total_cost ?? 0) || 0,
        modelUsed: String(usageBody.model_used ?? ''),
    };
    return {
        summary: String(body.summary ?? ''),
        sessionId: String(body.session_id ?? ''),
        usage,
        requestId: headers.get('x-request-id') ?? '',
        credits: extractCredits(headers),
        raw: body,
    };
}

function classifyStatus(status: number): 'ok' | 'retry' | 'raise' {
    if (status >= 200 && status < 300) return 'ok';
    if (status >= 500) return 'retry';
    return 'raise';
}

function raiseForResponse(status: number, body: unknown, headers: Headers): never {
    const requestId = headers.get('x-request-id') ?? '';
    const ra = headers.get('retry-after');
    const retryAfterSeconds = ra ? parseInt(ra, 10) || 0 : 0;
    throw errorFromResponse(status, body, requestId, retryAfterSeconds);
}

export class TLDRapi {
    private readonly rapidapiKey: string;
    private readonly rapidapiHost: string;
    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly retries: number;
    private readonly fetchImpl: typeof fetch;

    constructor(opts: TLDRapiClientOptions) {
        if (!opts?.rapidapiKey) {
            throw new Error('rapidapiKey is required (subscribe on RapidAPI to obtain one)');
        }
        this.rapidapiKey = opts.rapidapiKey;
        this.rapidapiHost = opts.rapidapiHost ?? DEFAULT_RAPIDAPI_HOST;
        // baseUrl defaults to https://<rapidapiHost>. Pass baseUrl
        // explicitly for staging / mock-server testing.
        this.baseUrl = (opts.baseUrl ?? `https://${this.rapidapiHost}`).replace(/\/$/, '');
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.retries = Math.max(0, Math.floor(opts.retries ?? DEFAULT_RETRIES));
        this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
        if (typeof this.fetchImpl !== 'function') {
            throw new Error(
                'no fetch available; run on Node 18+ or pass `fetchImpl` (e.g. from `node-fetch` or `undici`).',
            );
        }
    }

    async summarize(inputText: string, options: SummarizeOptions = {}): Promise<SummarizeResult> {
        if (!inputText || typeof inputText !== 'string') {
            throw new Error('inputText must be a non-empty string');
        }
        const tier = validateTier(options.tier);
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, tier, options.extraHeaders);
        if (options.allowOverage) headers['X-Allow-Overage'] = 'true';

        const body: Record<string, unknown> = { input_text: inputText };
        if (options.sessionId) body.session_id = options.sessionId;
        if (options.modelAlias) body.model_alias = options.modelAlias;

        const resp = await this.request('POST', '/summarize', {
            body: JSON.stringify(body),
            headers,
            timeoutMs: options.timeoutMs,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400) raiseForResponse(resp.status, parsed, resp.headers);
        if (!parsed || typeof parsed !== 'object') {
            throw new ServerError(`unexpected non-JSON summarize response: ${String(parsed).slice(0, 200)}`, {
                statusCode: resp.status,
                requestId: resp.headers.get('x-request-id') ?? '',
            });
        }
        return buildSummarizeResult(parsed as Record<string, unknown>, resp.headers);
    }

    async rates(): Promise<Rates> {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', '/rates', { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400) raiseForResponse(resp.status, parsed, resp.headers);
        const rec = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : {};
        return {
            quick: Number(rec.quick ?? 1) || 1,
            standard: Number(rec.standard ?? 5) || 5,
            deep: Number(rec.deep ?? 30) || 30,
            premium: Number(rec.premium ?? 110) || 110,
            ultra: Number(rec.ultra ?? 400) || 400,
            updatedAt: typeof rec.updated_at === 'string' ? rec.updated_at : undefined,
            raw: rec,
        };
    }

    async usage(): Promise<UsageStats> {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', '/usage', { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400) raiseForResponse(resp.status, parsed, resp.headers);
        const rec = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : {};
        return {
            period: String(rec.period ?? ''),
            calls: Number(rec.calls ?? 0) || 0,
            creditsCharged: Number(rec.credits_charged ?? 0) || 0,
            creditsRemaining: Number(rec.credits_remaining ?? 0) || 0,
            raw: rec,
        };
    }

    private async request(
        method: string,
        path: string,
        init: { body?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
    ): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const timeoutMs = init.timeoutMs ?? this.timeoutMs;
        let lastError: TLDRapiError | undefined;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await this.fetchImpl(url, {
                    method,
                    body: init.body,
                    headers: init.headers,
                    signal: controller.signal,
                });
                clearTimeout(timer);
                const action = classifyStatus(resp.status);
                if (action === 'retry' && attempt < this.retries) {
                    // Body must be consumed or discarded before retry
                    try { await resp.text(); } catch { /* ignore */ }
                    await sleep(backoffMs(attempt));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                const isAbort = err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
                lastError = isAbort
                    ? new TimeoutError(`request timed out after ${timeoutMs}ms`)
                    : new NetworkError(err instanceof Error ? err.message : String(err));
                if (attempt < this.retries) {
                    await sleep(backoffMs(attempt));
                    continue;
                }
                throw lastError;
            }
        }
        // Unreachable
        throw lastError ?? new NetworkError('unknown transport failure');
    }
}
