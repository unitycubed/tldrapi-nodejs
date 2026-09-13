"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.TimeoutError = exports.NetworkError = exports.ServerError = exports.InvalidRequestError = exports.QualitySelectionRequiresPaidPlanError = exports.LanguageNotSupportedError = exports.InsufficientCreditsError = exports.AuthenticationError = exports.TLDRapiError = void 0;
exports.errorFromResponse = errorFromResponse;
class TLDRapiError extends Error {
    constructor(message, opts = {}) {
        super(message);
        this.name = new.target.name;
        this.statusCode = opts.statusCode ?? 0;
        this.requestId = opts.requestId ?? '';
        this.responseBody = opts.responseBody ?? {};
        // Ensure `instanceof` works across the whole hierarchy in ES5 targets
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.TLDRapiError = TLDRapiError;
class AuthenticationError extends TLDRapiError {
}
exports.AuthenticationError = AuthenticationError;
class InsufficientCreditsError extends TLDRapiError {
}
exports.InsufficientCreditsError = InsufficientCreditsError;
class LanguageNotSupportedError extends TLDRapiError {
}
exports.LanguageNotSupportedError = LanguageNotSupportedError;
class QualitySelectionRequiresPaidPlanError extends TLDRapiError {
}
exports.QualitySelectionRequiresPaidPlanError = QualitySelectionRequiresPaidPlanError;
class InvalidRequestError extends TLDRapiError {
}
exports.InvalidRequestError = InvalidRequestError;
class ServerError extends TLDRapiError {
}
exports.ServerError = ServerError;
class NetworkError extends TLDRapiError {
}
exports.NetworkError = NetworkError;
class TimeoutError extends TLDRapiError {
}
exports.TimeoutError = TimeoutError;
class RateLimitError extends TLDRapiError {
    constructor(message, retryAfterSeconds, opts = {}) {
        super(message, opts);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.RateLimitError = RateLimitError;
function extractMessage(body, status) {
    if (body && typeof body === 'object') {
        const rec = body;
        for (const k of ['message', 'detail', 'error', 'reason']) {
            const v = rec[k];
            if (typeof v === 'string' && v.length > 0)
                return v;
        }
    }
    if (typeof body === 'string' && body.length > 0)
        return body.slice(0, 400);
    return `HTTP ${status}`;
}
function errorFromResponse(status, body, requestId = '', retryAfterSeconds = 0) {
    const rec = (body && typeof body === 'object') ? body : {};
    const errCode = String(rec.error_code ?? rec.error ?? '').toLowerCase();
    const msg = extractMessage(body, status);
    const opts = { statusCode: status, requestId, responseBody: rec };
    if (status === 401 || status === 403)
        return new AuthenticationError(msg, opts);
    if (status === 402)
        return new InsufficientCreditsError(msg, opts);
    if (status === 429)
        return new RateLimitError(msg, retryAfterSeconds, opts);
    if (status === 400) {
        if (errCode === 'language_not_supported' || errCode.includes('language')) {
            return new LanguageNotSupportedError(msg, opts);
        }
        if (errCode === 'quality_selection_requires_paid_plan') {
            return new QualitySelectionRequiresPaidPlanError(msg, opts);
        }
        return new InvalidRequestError(msg, opts);
    }
    if (status >= 500 && status < 600)
        return new ServerError(msg, opts);
    return new TLDRapiError(msg, opts);
}
//# sourceMappingURL=errors.js.map