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
export declare class TLDRapiError extends Error {
    readonly statusCode: number;
    readonly requestId: string;
    readonly responseBody: Record<string, unknown>;
    constructor(message: string, opts?: TLDRapiErrorOpts);
}
export declare class AuthenticationError extends TLDRapiError {
}
export declare class InsufficientCreditsError extends TLDRapiError {
}
export declare class LanguageNotSupportedError extends TLDRapiError {
}
export declare class QualitySelectionRequiresPaidPlanError extends TLDRapiError {
}
export declare class InvalidRequestError extends TLDRapiError {
}
export declare class ServerError extends TLDRapiError {
}
export declare class NetworkError extends TLDRapiError {
}
export declare class TimeoutError extends TLDRapiError {
}
export declare class RateLimitError extends TLDRapiError {
    readonly retryAfterSeconds: number;
    constructor(message: string, retryAfterSeconds: number, opts?: TLDRapiErrorOpts);
}
export declare function errorFromResponse(status: number, body: unknown, requestId?: string, retryAfterSeconds?: number): TLDRapiError;
//# sourceMappingURL=errors.d.ts.map