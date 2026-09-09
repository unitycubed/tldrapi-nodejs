/**
 * Typed exceptions for the TLDRapi SDK.
 *
 * Callers who want a blanket safety net can `catch (e) if (e instanceof
 * TLDRapiError)`. Callers who want to branch on failure mode can catch
 * the specific subclass — no string-matching error messages.
 *
 * `responseBody` holds the parsed JSON error body when the server sent
 * one; useful for surfacing e.g. `top_up` URL on InsufficientCredits.
 */

export interface TLDRapiErrorOpts {
    statusCode?: number;
    requestId?: string;
    responseBody?: Record<string, unknown>;
}

export class TLDRapiError extends Error {
    readonly statusCode: number;
    readonly requestId: string;
    readonly responseBody: Record<string, unknown>;

    constructor(message: string, opts: TLDRapiErrorOpts = {}) {
        super(message);
        this.name = new.target.name;
        this.statusCode = opts.statusCode ?? 0;
        this.requestId = opts.requestId ?? '';
        this.responseBody = opts.responseBody ?? {};
        // Ensure `instanceof` works across the whole hierarchy in ES5 targets
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class AuthenticationError extends TLDRapiError {}
export class InsufficientCreditsError extends TLDRapiError {}
export class LanguageNotSupportedError extends TLDRapiError {}
export class QualitySelectionRequiresPaidPlanError extends TLDRapiError {}
export class InvalidRequestError extends TLDRapiError {}
export class ServerError extends TLDRapiError {}
export class NetworkError extends TLDRapiError {}
export class TimeoutError extends TLDRapiError {}

export class RateLimitError extends TLDRapiError {
    readonly retryAfterSeconds: number;
    constructor(message: string, retryAfterSeconds: number, opts: TLDRapiErrorOpts = {}) {
        super(message, opts);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

function extractMessage(body: unknown, status: number): string {
    if (body && typeof body === 'object') {
        const rec = body as Record<string, unknown>;
        for (const k of ['message', 'detail', 'error', 'reason']) {
            const v = rec[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
    }
    if (typeof body === 'string' && body.length > 0) return body.slice(0, 400);
    return `HTTP ${status}`;
}

export function errorFromResponse(
    status: number,
    body: unknown,
    requestId: string = '',
    retryAfterSeconds: number = 0,
): TLDRapiError {
    const rec = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
    const errCode = String(rec.error_code ?? rec.error ?? '').toLowerCase();
    const msg = extractMessage(body, status);
    const opts: TLDRapiErrorOpts = { statusCode: status, requestId, responseBody: rec };

    if (status === 401 || status === 403) return new AuthenticationError(msg, opts);
    if (status === 402) return new InsufficientCreditsError(msg, opts);
    if (status === 429) return new RateLimitError(msg, retryAfterSeconds, opts);
    if (status === 400) {
        if (errCode === 'language_not_supported' || errCode.includes('language')) {
            return new LanguageNotSupportedError(msg, opts);
        }
        if (errCode === 'quality_selection_requires_paid_plan') {
            return new QualitySelectionRequiresPaidPlanError(msg, opts);
        }
        return new InvalidRequestError(msg, opts);
    }
    if (status >= 500 && status < 600) return new ServerError(msg, opts);
    return new TLDRapiError(msg, opts);
}
