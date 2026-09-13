"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TLDRapi = exports.DEFAULT_RAPIDAPI_HOST = void 0;
const errors_1 = require("./errors");
const types_1 = require("./types");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// RapidAPI is the only auth path at launch. Customers subscribe to
// the TLDRapi listing on RapidAPI, get an X-RapidAPI-Key, and this SDK
// sends every request through the RapidAPI proxy. Direct-signup
// (bypass RapidAPI) is post-launch — when it ships we'll add a
// second constructor path.
exports.DEFAULT_RAPIDAPI_HOST = 'tldrapi-summarizer.p.rapidapi.com';
const DEFAULT_BASE_URL = `https://${exports.DEFAULT_RAPIDAPI_HOST}`;
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 3;
const RETRY_BASE_MS = 500;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function backoffMs(attempt) {
    return RETRY_BASE_MS * 2 ** attempt + Math.random() * 200;
}
function validateTier(tier) {
    if (tier === undefined || tier === null)
        return undefined;
    const t = String(tier).toLowerCase().trim();
    if (!types_1.VALID_TIERS.includes(t)) {
        throw new Error(`invalid tier ${JSON.stringify(tier)}; must be one of ${types_1.VALID_TIERS.join(',')}`);
    }
    return t;
}
function buildHeaders(rapidapiKey, rapidapiHost, tier, extra) {
    const h = {
        'Content-Type': 'application/json',
        'User-Agent': 'tldrapi-node/0.1.0',
        // RapidAPI expects Key + Host together — Key authenticates the
        // customer, Host disambiguates which listing (RapidAPI proxies
        // many APIs from the same p.rapidapi.com prefix).
        'X-RapidAPI-Key': rapidapiKey,
        'X-RapidAPI-Host': rapidapiHost,
    };
    if (tier)
        h['X-Quality'] = tier;
    if (extra)
        for (const [k, v] of Object.entries(extra))
            h[k] = v;
    return h;
}
async function parseBody(resp) {
    const ctype = resp.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
        try {
            return await resp.json();
        }
        catch {
            return await resp.text();
        }
    }
    return await resp.text();
}
function extractCredits(headers) {
    const out = {};
    const map = {
        'x-credits-charged': 'charged',
        'x-credits-remaining': 'remaining',
        'x-credits-tier': 'tier',
    };
    headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (k in map)
            out[map[k]] = value;
    });
    return out;
}
function buildSummarizeResult(body, headers) {
    const usageBody = (body.usage ?? {});
    const usage = {
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
function classifyStatus(status) {
    if (status >= 200 && status < 300)
        return 'ok';
    if (status >= 500)
        return 'retry';
    return 'raise';
}
function raiseForResponse(status, body, headers) {
    const requestId = headers.get('x-request-id') ?? '';
    const ra = headers.get('retry-after');
    const retryAfterSeconds = ra ? parseInt(ra, 10) || 0 : 0;
    throw (0, errors_1.errorFromResponse)(status, body, requestId, retryAfterSeconds);
}
class TLDRapi {
    constructor(opts) {
        if (!opts?.rapidapiKey) {
            throw new Error('rapidapiKey is required (subscribe on RapidAPI to obtain one)');
        }
        this.rapidapiKey = opts.rapidapiKey;
        this.rapidapiHost = opts.rapidapiHost ?? exports.DEFAULT_RAPIDAPI_HOST;
        // baseUrl defaults to https://<rapidapiHost>. Pass baseUrl
        // explicitly for staging / mock-server testing.
        this.baseUrl = (opts.baseUrl ?? `https://${this.rapidapiHost}`).replace(/\/$/, '');
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.retries = Math.max(0, Math.floor(opts.retries ?? DEFAULT_RETRIES));
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('no fetch available; run on Node 18+ or pass `fetchImpl` (e.g. from `node-fetch` or `undici`).');
        }
    }
    async summarize(inputText, options = {}) {
        if (!inputText || typeof inputText !== 'string') {
            throw new Error('inputText must be a non-empty string');
        }
        const tier = validateTier(options.tier);
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, tier, options.extraHeaders);
        if (options.allowOverage)
            headers['X-Allow-Overage'] = 'true';
        const body = { input_text: inputText };
        if (options.sessionId)
            body.session_id = options.sessionId;
        if (options.modelAlias)
            body.model_alias = options.modelAlias;
        if (options.config) {
            // Serialize SummarizeConfig, dropping undefined fields and
            // camelCase→snake_case for the wire (matches openapi.yaml).
            const cfg = {};
            const c = options.config;
            if (c.modelAlias !== undefined)
                cfg.model_alias = c.modelAlias;
            if (c.temperature !== undefined)
                cfg.temperature = c.temperature;
            if (c.topP !== undefined)
                cfg.top_p = c.topP;
            if (c.maxOutputTokens !== undefined)
                cfg.max_output_tokens = c.maxOutputTokens;
            if (c.maxInputTokens !== undefined)
                cfg.max_input_tokens = c.maxInputTokens;
            if (Object.keys(cfg).length > 0)
                body.config = cfg;
        }
        const resp = await this.request('POST', '/summarize', {
            body: JSON.stringify(body),
            headers,
            timeoutMs: options.timeoutMs,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        if (!parsed || typeof parsed !== 'object') {
            throw new errors_1.ServerError(`unexpected non-JSON summarize response: ${String(parsed).slice(0, 200)}`, {
                statusCode: resp.status,
                requestId: resp.headers.get('x-request-id') ?? '',
            });
        }
        return buildSummarizeResult(parsed, resp.headers);
    }
    async rates() {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', '/rates', { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        const rec = (parsed && typeof parsed === 'object') ? parsed : {};
        // Spec (openapi.yaml RatesResponse): tier ints live under
        // `credits_per_call.{tier}`, timestamp is `credit_costs_updated_at`,
        // and `history_url` is a top-level field. Pre-1.0 SDK read the
        // wrong nesting and always returned the fallback ints.
        const cpc = (rec.credits_per_call && typeof rec.credits_per_call === 'object')
            ? rec.credits_per_call : {};
        const updated = typeof rec.credit_costs_updated_at === 'string'
            ? rec.credit_costs_updated_at : undefined;
        return {
            quick: Number(cpc.quick ?? 1) || 1,
            standard: Number(cpc.standard ?? 5) || 5,
            deep: Number(cpc.deep ?? 30) || 30,
            premium: Number(cpc.premium ?? 110) || 110,
            ultra: Number(cpc.ultra ?? 400) || 400,
            creditCostsUpdatedAt: updated,
            updatedAt: updated, // deprecated alias
            historyUrl: typeof rec.history_url === 'string' ? rec.history_url : '',
            raw: rec,
        };
    }
    async usage() {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', '/usage', { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        const rec = (parsed && typeof parsed === 'object') ? parsed : {};
        // Spec (openapi.yaml UsageResponse). Pre-1.0 SDK read
        // period/calls/credits_charged/credits_remaining — none of which
        // the server has ever emitted — so every field returned zero.
        const limitsRec = (rec.limits && typeof rec.limits === 'object')
            ? rec.limits : {};
        const limits = {
            perMinute: typeof limitsRec.per_minute === 'number' ? limitsRec.per_minute : undefined,
            daily: typeof limitsRec.daily === 'number' ? limitsRec.daily : undefined,
            credits: typeof limitsRec.credits === 'number' ? limitsRec.credits : undefined,
            concurrent: typeof limitsRec.concurrent === 'number' ? limitsRec.concurrent : undefined,
        };
        return {
            usageCount: Number(rec.usage_count ?? 0) || 0,
            successfulRequests: Number(rec.successful_requests ?? 0) || 0,
            failedRequests: Number(rec.failed_requests ?? 0) || 0,
            averageResponseTimeMs: Number(rec.average_response_time_ms ?? 0) || 0,
            endpointsUsed: (rec.endpoints_used && typeof rec.endpoints_used === 'object')
                ? rec.endpoints_used : {},
            errorRate: Number(rec.error_rate ?? 0) || 0,
            plan: String(rec.plan ?? ''),
            limits,
            raw: rec,
        };
    }
    // --- text-body /convert endpoints ---
    async convertJsonToText(text, opts = {}) {
        return this.convertText('/convert/json-to-text', text, opts);
    }
    async convertHtmlToText(text, opts = {}) {
        return this.convertText('/convert/html-to-text', text, opts);
    }
    async convertMdToText(text, opts = {}) {
        return this.convertText('/convert/md-to-text', text, opts);
    }
    async convertText(routePath, text, opts) {
        if (!text || typeof text !== 'string')
            throw new Error('text must be a non-empty string');
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined, opts.extraHeaders);
        if (opts.allowOverage)
            headers['X-Allow-Overage'] = 'true';
        const resp = await this.request('POST', routePath, {
            body: JSON.stringify({ text }),
            headers,
            timeoutMs: opts.timeoutMs,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildConvertResult((parsed && typeof parsed === 'object') ? parsed : {}, resp.headers);
    }
    // --- file-upload /convert endpoints ---
    async convertDocToText(file, opts = {}) {
        return this.convertFile('/convert/doc-to-text', file, opts);
    }
    async convertDocToLatex(file, opts = {}) {
        return this.convertFile('/convert/doc-to-latex', file, opts);
    }
    /** Deprecated alias for `convertDocToText`. Kept for backward compat. */
    async convertDocxToText(file, opts = {}) {
        return this.convertFile('/convert/docx-to-text', file, opts);
    }
    async convertFile(routePath, file, opts) {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined, opts.extraHeaders);
        if (opts.allowOverage)
            headers['X-Allow-Overage'] = 'true';
        // FormData must set Content-Type with the boundary itself.
        delete headers['Content-Type'];
        const form = await buildMultipart(file, opts.filename);
        const resp = await this.request('POST', routePath, {
            multipart: form,
            headers,
            timeoutMs: opts.timeoutMs,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildConvertResult((parsed && typeof parsed === 'object') ? parsed : {}, resp.headers);
    }
    async convertPdfToLatex(file, opts = {}) {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined, opts.extraHeaders);
        if (opts.allowOverage)
            headers['X-Allow-Overage'] = 'true';
        if (opts.backend) {
            if (!['auto', 'text', 'modal'].includes(opts.backend)) {
                throw new Error('backend must be one of: auto, text, modal');
            }
            headers['X-PDF-Backend'] = opts.backend;
        }
        delete headers['Content-Type'];
        const form = await buildMultipart(file, opts.filename ?? 'upload.pdf');
        const resp = await this.request('POST', '/convert/pdf-to-latex', {
            multipart: form,
            headers,
            timeoutMs: opts.timeoutMs,
        });
        const parsed = await parseBody(resp);
        const rec = (parsed && typeof parsed === 'object') ? parsed : {};
        if (resp.status === 202)
            return buildPdfAsync(rec, resp.headers);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildPdfSync(rec, resp.headers);
    }
    async pdfStatus(jobId) {
        if (!jobId)
            throw new Error('jobId required');
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', `/convert/pdf-to-latex/status/${encodeURIComponent(jobId)}`, { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        const rec = (parsed && typeof parsed === 'object') ? parsed : {};
        const status = String(rec.status ?? '');
        if (status === 'queued' || status === 'running')
            return buildPdfAsync(rec, resp.headers);
        return buildPdfSync(rec, resp.headers);
    }
    // --- rates history + usage range ---
    async ratesHistory() {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', '/rates/history', { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildRatesHistory((parsed && typeof parsed === 'object') ? parsed : {});
    }
    async usageRange(from, to) {
        if (!from || !to)
            throw new Error('from and to required (YYYY-MM-DD)');
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const resp = await this.request('GET', `/usage/range${qs}`, { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildUsageRange((parsed && typeof parsed === 'object') ? parsed : {});
    }
    // --- custom prompts (Business/Enterprise) ---
    async customPromptSubmit(voiceName, instruction, opts = {}) {
        if (!voiceName || !instruction)
            throw new Error('voiceName and instruction required');
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined, opts.extraHeaders);
        if (opts.allowOverage)
            headers['X-Allow-Overage'] = 'true';
        const body = { voice_name: voiceName, instruction };
        if (opts.sessionId)
            body.session_id = opts.sessionId;
        const resp = await this.request('POST', '/custom-prompts/submit', {
            body: JSON.stringify(body),
            headers,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildCustomPromptResult((parsed && typeof parsed === 'object') ? parsed : {});
    }
    async customPromptsList(opts = {}) {
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const body = {};
        if (opts.sessionId)
            body.session_id = opts.sessionId;
        const resp = await this.request('POST', '/custom-prompts/list', {
            body: JSON.stringify(body),
            headers,
        });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildCustomPromptList((parsed && typeof parsed === 'object') ? parsed : {});
    }
    async customPromptGet(promptId) {
        if (!promptId)
            throw new Error('promptId required');
        const headers = buildHeaders(this.rapidapiKey, this.rapidapiHost, undefined);
        const resp = await this.request('GET', `/custom-prompts/${encodeURIComponent(promptId)}`, { headers });
        const parsed = await parseBody(resp);
        if (resp.status >= 400)
            raiseForResponse(resp.status, parsed, resp.headers);
        return buildCustomPromptDetail((parsed && typeof parsed === 'object') ? parsed : {});
    }
    async request(method, path, init = {}) {
        const url = `${this.baseUrl}${path}`;
        const timeoutMs = init.timeoutMs ?? this.timeoutMs;
        let lastError;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const body = (init.multipart ?? init.body);
                const resp = await this.fetchImpl(url, {
                    method,
                    body,
                    headers: init.headers,
                    signal: controller.signal,
                });
                clearTimeout(timer);
                const action = classifyStatus(resp.status);
                if (action === 'retry' && attempt < this.retries) {
                    // Body must be consumed or discarded before retry
                    try {
                        await resp.text();
                    }
                    catch { /* ignore */ }
                    await sleep(backoffMs(attempt));
                    continue;
                }
                return resp;
            }
            catch (err) {
                clearTimeout(timer);
                const isAbort = err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
                lastError = isAbort
                    ? new errors_1.TimeoutError(`request timed out after ${timeoutMs}ms`)
                    : new errors_1.NetworkError(err instanceof Error ? err.message : String(err));
                if (attempt < this.retries) {
                    await sleep(backoffMs(attempt));
                    continue;
                }
                throw lastError;
            }
        }
        // Unreachable
        throw lastError ?? new errors_1.NetworkError('unknown transport failure');
    }
}
exports.TLDRapi = TLDRapi;
// ─── response builders ────────────────────────────────────────────────
function buildConvertResult(rec, headers) {
    return {
        output: String(rec.output ?? ''),
        outputFormat: String(rec.output_format ?? ''),
        inputFormat: String(rec.input_format ?? ''),
        inputBytes: Number(rec.input_bytes ?? 0) || 0,
        outputChars: Number(rec.output_chars ?? 0) || 0,
        elapsedMs: Number(rec.elapsed_ms ?? 0) || 0,
        requestId: String(rec.request_id ?? headers.get('x-request-id') ?? ''),
        warnings: Array.isArray(rec.warnings) ? rec.warnings : [],
        raw: rec,
    };
}
function buildPdfSync(rec, headers) {
    return {
        output: String(rec.output ?? ''),
        outputFormat: String(rec.output_format ?? ''),
        inputFormat: String(rec.input_format ?? 'pdf'),
        inputBytes: Number(rec.input_bytes ?? 0) || 0,
        pages: Number(rec.pages ?? 0) || 0,
        elapsedMs: Number(rec.elapsed_ms ?? 0) || 0,
        backend: String(rec.backend ?? ''),
        requestId: String(rec.request_id ?? headers.get('x-request-id') ?? ''),
        warnings: Array.isArray(rec.warnings) ? rec.warnings : [],
        jobId: String(rec.job_id ?? ''),
        status: String(rec.status ?? 'done'),
        pollUrl: String(rec.poll_url ?? ''),
        estimatedSeconds: Number(rec.estimated_seconds ?? 0) || 0,
        raw: rec,
    };
}
function buildPdfAsync(rec, headers) {
    return {
        output: '',
        outputFormat: '',
        inputFormat: 'pdf',
        inputBytes: Number(rec.input_bytes ?? 0) || 0,
        pages: Number(rec.pages ?? 0) || 0,
        elapsedMs: 0,
        backend: String(rec.backend ?? ''),
        requestId: String(rec.request_id ?? headers.get('x-request-id') ?? ''),
        warnings: Array.isArray(rec.warnings) ? rec.warnings : [],
        jobId: String(rec.job_id ?? ''),
        status: String(rec.status ?? 'queued'),
        pollUrl: String(rec.poll_url ?? ''),
        estimatedSeconds: Number(rec.estimated_seconds ?? 0) || 0,
        raw: rec,
    };
}
function buildRatesHistory(rec) {
    const raw = Array.isArray(rec.history) ? rec.history : [];
    const history = raw.map((h) => {
        const r = (h && typeof h === 'object') ? h : {};
        return {
            changedAt: String(r.changed_at ?? ''),
            tier: String(r.tier ?? ''),
            creditsBefore: Number(r.credits_before ?? 0) || 0,
            creditsAfter: Number(r.credits_after ?? 0) || 0,
            reason: String(r.reason ?? ''),
            operator: String(r.operator ?? ''),
        };
    });
    return {
        history,
        rangeDays: Number(rec.range_days ?? 30) || 30,
        totalChanges: Number(rec.total_changes ?? history.length) || history.length,
        raw: rec,
    };
}
function buildUsageRange(rec) {
    const raw = Array.isArray(rec.daily) ? rec.daily : [];
    const daily = raw.map((d) => {
        const r = (d && typeof d === 'object') ? d : {};
        return {
            date: String(r.date ?? ''),
            creditsUsed: Number(r.credits_used ?? 0) || 0,
            callCount: Number(r.call_count ?? 0) || 0,
        };
    });
    return {
        from: String(rec.from ?? ''),
        to: String(rec.to ?? ''),
        creditsUsed: Number(rec.credits_used ?? 0) || 0,
        daily,
        raw: rec,
    };
}
function buildCustomPromptResult(rec) {
    const status = String(rec.status ?? '');
    return {
        id: String(rec.id ?? ''),
        voiceName: String(rec.voice_name ?? ''),
        status,
        approved: status === 'approved' || rec.approved === true,
        voiceReference: typeof rec.voice_reference === 'string' ? rec.voice_reference : undefined,
        rejectionReason: typeof rec.rejection_reason === 'string' ? rec.rejection_reason : undefined,
        updatedInPlace: rec.updated_in_place === true,
        supersededIds: Array.isArray(rec.superseded_ids) ? rec.superseded_ids : [],
        raw: rec,
    };
}
function buildCustomPromptSummary(r) {
    return {
        id: String(r.id ?? ''),
        voiceName: String(r.voice_name ?? ''),
        status: String(r.status ?? ''),
        voiceReference: typeof r.voice_reference === 'string' ? r.voice_reference : undefined,
        approvedAlias: typeof r.approved_alias === 'string' ? r.approved_alias : undefined,
        rejectionReason: typeof r.rejection_reason === 'string' ? r.rejection_reason : undefined,
        submittedAt: String(r.submitted_at ?? ''),
        reviewedAt: String(r.reviewed_at ?? ''),
    };
}
function buildCustomPromptList(rec) {
    const raw = Array.isArray(rec.custom_prompts) ? rec.custom_prompts : [];
    return {
        customerId: String(rec.customer_id ?? ''),
        customPrompts: raw.map((p) => buildCustomPromptSummary((p && typeof p === 'object') ? p : {})),
        raw: rec,
    };
}
function buildCustomPromptDetail(rec) {
    return {
        id: String(rec.id ?? ''),
        customerId: String(rec.customer_id ?? ''),
        voiceName: String(rec.voice_name ?? ''),
        instruction: String(rec.instruction ?? ''),
        status: String(rec.status ?? ''),
        voiceReference: typeof rec.voice_reference === 'string' ? rec.voice_reference : undefined,
        approvedAlias: typeof rec.approved_alias === 'string' ? rec.approved_alias : undefined,
        rejectionReason: typeof rec.rejection_reason === 'string' ? rec.rejection_reason : undefined,
        judgeVerdictJson: String(rec.judge_verdict_json ?? ''),
        submittedAt: String(rec.submitted_at ?? ''),
        reviewedAt: String(rec.reviewed_at ?? ''),
        raw: rec,
    };
}
// ─── multipart upload ─────────────────────────────────────────────────
async function buildMultipart(file, filename) {
    // Uses the platform FormData/Blob (Node 18+ has them globally). Files
    // can be a filesystem path (string), a Buffer/Uint8Array, an
    // ArrayBuffer, or a Blob. The multipart boundary is set by fetch itself
    // — callers must NOT pre-set Content-Type on headers.
    const form = new FormData();
    let blob;
    let name = filename ?? 'upload';
    if (typeof file === 'string') {
        // filesystem path
        const buf = await fs.promises.readFile(file);
        blob = new Blob([buf]);
        if (!filename)
            name = path.basename(file);
    }
    else if (file instanceof Blob) {
        blob = file;
    }
    else if (file instanceof ArrayBuffer) {
        blob = new Blob([file]);
    }
    else if (file instanceof Uint8Array) {
        // Buffer is a Uint8Array subclass, so this branch catches both.
        // Cast the buffer view to a plain ArrayBuffer for Blob's typing;
        // at runtime Blob copies the bytes, so the underlying buffer type
        // doesn't matter.
        const view = file;
        blob = new Blob([view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)]);
    }
    else {
        throw new Error('unsupported file input: expected string path, Buffer, Uint8Array, ArrayBuffer, or Blob');
    }
    form.append('file', blob, name);
    return form;
}
//# sourceMappingURL=client.js.map