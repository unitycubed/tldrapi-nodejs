/**
 * Unit tests for the TLDRapi Node.js SDK.
 *
 * Mocks the fetch impl passed into the client — no real network,
 * no ordering dependency on Jest globals.
 */

import {
    AuthenticationError,
    InsufficientCreditsError,
    InvalidRequestError,
    LanguageNotSupportedError,
    QualitySelectionRequiresPaidPlanError,
    RateLimitError,
    ServerError,
    TLDRapi,
    TLDRapiError,
    TimeoutError,
} from '../src';

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

interface FetchMock extends jest.Mock {
    (input: unknown, init?: unknown): Promise<Response>;
}

function makeFetchMock(...responses: (Response | Error)[]): FetchMock {
    const fn = jest.fn() as FetchMock;
    for (const r of responses) {
        if (r instanceof Error) fn.mockImplementationOnce(async () => { throw r; });
        else fn.mockImplementationOnce(async () => r);
    }
    return fn;
}

const KEY = 'tldr_test_key_abc';
const BASE = 'https://api.example.test/TLDRapi';

function newClient(fetchImpl: FetchMock, retries: number = 0): TLDRapi {
    return new TLDRapi({ rapidapiKey: KEY, baseUrl: BASE, retries, fetchImpl });
}

describe('TLDRapi SDK', () => {
    describe('summarize happy path', () => {
        it('parses result fields', async () => {
            const fetchImpl = makeFetchMock(
                makeResponse(
                    200,
                    { session_id: 'sess_abc', summary: 'A short summary.',
                      usage: { input_tokens: 42, output_tokens: 12, total_cost: 0.001, model_used: 'home:llama-3.1-8b' } },
                    { 'x-request-id': 'req-xyz', 'x-credits-charged': '1', 'x-credits-remaining': '99', 'x-credits-tier': 'quick' },
                ),
            );
            const c = newClient(fetchImpl);
            const r = await c.summarize('long text goes here');
            expect(r.summary).toBe('A short summary.');
            expect(r.sessionId).toBe('sess_abc');
            expect(r.usage.inputTokens).toBe(42);
            expect(r.usage.outputTokens).toBe(12);
            expect(r.usage.modelUsed).toBe('home:llama-3.1-8b');
            expect(r.requestId).toBe('req-xyz');
            expect(r.credits.charged).toBe('1');
            expect(r.credits.remaining).toBe('99');
            expect(r.credits.tier).toBe('quick');
        });

        it('sends tier + session_id + allow_overage', async () => {
            const fetchImpl = makeFetchMock(makeResponse(200, { summary: 'ok', usage: {} }));
            const c = newClient(fetchImpl);
            await c.summarize('text', { tier: 'deep', sessionId: 'sess_prior', allowOverage: true });
            const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(`${BASE}/summarize`);
            const headers = init.headers as Record<string, string>;
            expect(headers['X-Quality']).toBe('deep');
            expect(headers['X-Allow-Overage']).toBe('true');
            expect(headers['X-RapidAPI-Key']).toBe(KEY);
            const body = JSON.parse(init.body as string);
            expect(body.input_text).toBe('text');
            expect(body.session_id).toBe('sess_prior');
        });
    });

    describe('typed errors', () => {
        it('401 → AuthenticationError', async () => {
            const c = newClient(makeFetchMock(makeResponse(401, { error: 'unauth' })));
            await expect(c.summarize('t')).rejects.toBeInstanceOf(AuthenticationError);
        });

        it('402 → InsufficientCreditsError with body', async () => {
            const body = { error: 'insufficient_credits', credits_required: 5,
                options: { top_up: { url: 'https://x/topup' } } };
            const c = newClient(makeFetchMock(makeResponse(402, body)));
            let caught: TLDRapiError | undefined;
            try { await c.summarize('t'); } catch (e) { caught = e as TLDRapiError; }
            expect(caught).toBeInstanceOf(InsufficientCreditsError);
            expect(caught!.responseBody.credits_required).toBe(5);
        });

        it('429 → RateLimitError with retryAfterSeconds from header', async () => {
            const c = newClient(makeFetchMock(makeResponse(429, { error: 'rate_limit_exceeded' }, { 'retry-after': '42' })));
            let caught: RateLimitError | undefined;
            try { await c.summarize('t'); } catch (e) { caught = e as RateLimitError; }
            expect(caught).toBeInstanceOf(RateLimitError);
            expect(caught!.retryAfterSeconds).toBe(42);
        });

        it('400 language_not_supported → LanguageNotSupportedError', async () => {
            const body = { error: 'Language not yet supported', error_code: 'LANGUAGE_NOT_SUPPORTED',
                detected_language: 'spa' };
            const c = newClient(makeFetchMock(makeResponse(400, body)));
            let caught: TLDRapiError | undefined;
            try { await c.summarize('t'); } catch (e) { caught = e as TLDRapiError; }
            expect(caught).toBeInstanceOf(LanguageNotSupportedError);
            expect(caught!.responseBody.detected_language).toBe('spa');
        });

        it('400 quality_selection_requires_paid_plan → QualitySelectionRequiresPaidPlanError', async () => {
            const c = newClient(makeFetchMock(makeResponse(400, { error: 'quality_selection_requires_paid_plan' })));
            await expect(c.summarize('t', { tier: 'deep' })).rejects.toBeInstanceOf(QualitySelectionRequiresPaidPlanError);
        });

        it('400 generic → InvalidRequestError', async () => {
            const c = newClient(makeFetchMock(makeResponse(400, { error: 'bad' })));
            await expect(c.summarize('t')).rejects.toBeInstanceOf(InvalidRequestError);
        });

        it('5xx retried, then errors as ServerError', async () => {
            const fetchImpl = makeFetchMock(
                makeResponse(503, { error: 'down' }),
                makeResponse(502, { error: 'bad gw' }),
                makeResponse(500, { error: 'internal' }),
            );
            const c = newClient(fetchImpl, 2);
            await expect(c.summarize('t')).rejects.toBeInstanceOf(ServerError);
            expect(fetchImpl).toHaveBeenCalledTimes(3);
        });

        it('5xx then 200 succeeds after retry', async () => {
            const fetchImpl = makeFetchMock(
                makeResponse(502, { error: 'bad gateway' }),
                makeResponse(200, { summary: 'recovered', usage: {} }),
            );
            const c = newClient(fetchImpl, 2);
            const r = await c.summarize('t');
            expect(r.summary).toBe('recovered');
            expect(fetchImpl).toHaveBeenCalledTimes(2);
        });

        it('4xx not retried', async () => {
            const fetchImpl = makeFetchMock(makeResponse(400, { error: 'bad' }));
            const c = newClient(fetchImpl, 5);
            await expect(c.summarize('t')).rejects.toBeInstanceOf(InvalidRequestError);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });
    });

    describe('input validation', () => {
        it('empty rapidapiKey rejected', () => {
            expect(() => new TLDRapi({ rapidapiKey: '' })).toThrow();
        });
        it('empty inputText rejected', async () => {
            const c = newClient(makeFetchMock());
            await expect(c.summarize('')).rejects.toThrow();
        });
        it('invalid tier rejected', async () => {
            const c = newClient(makeFetchMock());
            await expect(c.summarize('t', { tier: 'ultramega' as never })).rejects.toThrow();
        });
    });

    describe('rates + usage', () => {
        it('rates parsed', async () => {
            const fetchImpl = makeFetchMock(makeResponse(200,
                { quick: 1, standard: 6, deep: 32, premium: 120, ultra: 420, updated_at: '2026-08-31T00:00:00Z' }));
            const c = newClient(fetchImpl);
            const r = await c.rates();
            expect(r.standard).toBe(6);
            expect(r.updatedAt).toBe('2026-08-31T00:00:00Z');
        });
        it('usage parsed', async () => {
            const fetchImpl = makeFetchMock(makeResponse(200,
                { period: '2026-08', calls: 42, credits_charged: 210, credits_remaining: 89 }));
            const c = newClient(fetchImpl);
            const u = await c.usage();
            expect(u.calls).toBe(42);
            expect(u.creditsRemaining).toBe(89);
        });
    });

    describe('timeout + network', () => {
        it('AbortError → TimeoutError', async () => {
            const abortErr = new Error('The user aborted a request.');
            abortErr.name = 'AbortError';
            const fetchImpl = makeFetchMock(abortErr);
            const c = newClient(fetchImpl);
            await expect(c.summarize('t')).rejects.toBeInstanceOf(TimeoutError);
        });
    });
});
