/** Public result + option types for the TLDRapi SDK. */

export type QualityTier = 'quick' | 'standard' | 'deep' | 'premium' | 'ultra';

export const VALID_TIERS: readonly QualityTier[] = ['quick', 'standard', 'deep', 'premium', 'ultra'] as const;

export interface Usage {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    modelUsed: string;
}

export interface Credits {
    charged?: string;
    remaining?: string;
    tier?: string;
}

export interface SummarizeResult {
    /** The summarized text. */
    summary: string;
    /** Server-issued session id. Pass to a future call via `sessionId` to keep the session pinned. */
    sessionId: string;
    /** Per-call usage — token counts + model that produced the summary. */
    usage: Usage;
    /** X-Request-ID header; attach when reporting an issue. */
    requestId: string;
    /** X-Credits-* header snapshot. */
    credits: Credits;
    /** Full parsed JSON body — anything the SDK hasn't hoisted onto typed fields. */
    raw: Record<string, unknown>;
}

export interface SummarizeOptions {
    tier?: QualityTier;
    sessionId?: string;
    modelAlias?: string;
    allowOverage?: boolean;
    extraHeaders?: Record<string, string>;
    /** Per-call timeout override in ms. Overrides `TLDRapi` constructor `timeoutMs`. */
    timeoutMs?: number;
}

export interface Rates {
    quick: number;
    standard: number;
    deep: number;
    premium: number;
    ultra: number;
    updatedAt?: string;
    raw: Record<string, unknown>;
}

export interface UsageStats {
    period: string;
    calls: number;
    creditsCharged: number;
    creditsRemaining: number;
    raw: Record<string, unknown>;
}

export interface TLDRapiClientOptions {
    /**
     * Your `X-RapidAPI-Key` from the RapidAPI dashboard. Subscribe to
     * the TLDRapi listing on RapidAPI to obtain one.
     */
    rapidapiKey: string;
    /**
     * The RapidAPI listing host, e.g. `tldrapi-summarizer.p.rapidapi.com`.
     * Defaults to the marketplace listing; override when calling a
     * staging listing.
     */
    rapidapiHost?: string;
    /**
     * Override the API base URL entirely — useful for mock-server tests.
     * Defaults to `https://<rapidapiHost>`.
     */
    baseUrl?: string;
    /** Per-request timeout, ms. Default 60000 (60s). Deep tier can take ~30s. */
    timeoutMs?: number;
    /** Number of retries on 5xx or network error. Default 3. 4xx and 429 never retry. */
    retries?: number;
    /**
     * Optional custom fetch implementation. Defaults to global fetch.
     * Pass a `node-fetch` or `undici`-style implementation if you need
     * to run on very old Node (<18).
     */
    fetchImpl?: typeof fetch;
}
