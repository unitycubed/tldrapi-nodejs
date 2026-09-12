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

/**
 * Optional per-call generation config for `client.summarize(...)`.
 * Omitted fields fall through to server tier defaults. Shape mirrors
 * openapi.yaml SummarizeRequest.config.
 */
export interface SummarizeConfig {
    modelAlias?: string;
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    maxInputTokens?: number;
}

export interface SummarizeOptions {
    tier?: QualityTier;
    sessionId?: string;
    modelAlias?: string;
    /**
     * Per-call generation overrides (temperature, top_p, max_output_tokens,
     * max_input_tokens, model_alias). Omitted fields fall through to
     * server tier defaults. Matches openapi.yaml SummarizeRequest.config.
     */
    config?: SummarizeConfig;
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
    /** Matches openapi.yaml RatesResponse.credit_costs_updated_at. */
    creditCostsUpdatedAt?: string;
    /**
     * Deprecated alias for `creditCostsUpdatedAt`. Kept for pre-1.0
     * callers; prefer `creditCostsUpdatedAt`.
     */
    updatedAt?: string;
    /** Matches openapi.yaml RatesResponse.history_url. */
    historyUrl: string;
    raw: Record<string, unknown>;
}

/**
 * Plan-limit sub-object of UsageStats — populated when the server
 * reports them; missing/undefined otherwise. Shape mirrors openapi.yaml
 * UsageResponse.limits.
 */
export interface UsageLimits {
    perMinute?: number;
    daily?: number;
    credits?: number;
    concurrent?: number;
}

/**
 * Return of `client.usage()`.
 *
 * Fields align with `docs/external/openapi.yaml` UsageResponse. Pre-1.0
 * releases exposed `period/calls/creditsCharged/creditsRemaining` which
 * never matched the server; those keys are gone. Callers who need
 * something not hoisted can read `.raw`.
 */
export interface UsageStats {
    usageCount: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTimeMs: number;
    endpointsUsed: Record<string, unknown>;
    errorRate: number;
    plan: string;
    limits: UsageLimits;
    raw: Record<string, unknown>;
}

/** Common result shape for text-body /convert endpoints. */
export interface ConvertResult {
    output: string;
    outputFormat: string;
    inputFormat: string;
    inputBytes: number;
    outputChars: number;
    elapsedMs: number;
    requestId: string;
    warnings: unknown[];
    raw: Record<string, unknown>;
}

/**
 * Result of `client.convertPdfToLatex(...)`. If the gateway chose the
 * async path (HTTP 202), `jobId` / `pollUrl` / `status` are set and
 * `output` is empty — poll `pdfStatus(jobId)` until done.
 */
export interface PdfConvertResult {
    // sync fields (or filled when async job completes)
    output: string;
    outputFormat: string;
    inputFormat: string;
    inputBytes: number;
    pages: number;
    elapsedMs: number;
    backend: string;
    requestId: string;
    warnings: unknown[];
    // async fields
    jobId: string;
    status: string;              // queued | running | done | failed
    pollUrl: string;
    estimatedSeconds: number;
    raw: Record<string, unknown>;
}

export interface RatesHistoryChange {
    changedAt: string;
    tier: string;
    creditsBefore: number;
    creditsAfter: number;
    reason: string;
    operator: string;
}

export interface RatesHistory {
    history: RatesHistoryChange[];
    rangeDays: number;
    totalChanges: number;
    raw: Record<string, unknown>;
}

export interface UsageRangeDay {
    date: string;
    creditsUsed: number;
    callCount: number;
}

export interface UsageRange {
    from: string;
    to: string;
    creditsUsed: number;
    daily: UsageRangeDay[];
    raw: Record<string, unknown>;
}

export interface CustomPromptResult {
    id: string;
    voiceName: string;
    status: string;
    approved: boolean;
    voiceReference?: string;
    rejectionReason?: string;
    updatedInPlace: boolean;
    supersededIds: string[];
    raw: Record<string, unknown>;
}

export interface CustomPromptSummary {
    id: string;
    voiceName: string;
    status: string;
    voiceReference?: string;
    approvedAlias?: string;
    rejectionReason?: string;
    submittedAt: string;
    reviewedAt: string;
}

export interface CustomPromptList {
    customerId: string;
    customPrompts: CustomPromptSummary[];
    raw: Record<string, unknown>;
}

export interface CustomPromptDetail {
    id: string;
    customerId: string;
    voiceName: string;
    instruction: string;
    status: string;
    voiceReference?: string;
    approvedAlias?: string;
    rejectionReason?: string;
    judgeVerdictJson: string;
    submittedAt: string;
    reviewedAt: string;
    raw: Record<string, unknown>;
}

/** File input to a multipart /convert/* upload — path, Buffer, Blob, or Uint8Array. */
export type FileInput = string | Uint8Array | Buffer | Blob | ArrayBuffer;

export interface ConvertFileOptions {
    filename?: string;
    allowOverage?: boolean;
    extraHeaders?: Record<string, string>;
    timeoutMs?: number;
}

export interface ConvertTextOptions {
    allowOverage?: boolean;
    extraHeaders?: Record<string, string>;
    timeoutMs?: number;
}

export interface ConvertPdfOptions extends ConvertFileOptions {
    /** X-PDF-Backend header override — one of "auto"|"text"|"modal". */
    backend?: 'auto' | 'text' | 'modal';
}

export interface CustomPromptSubmitOptions {
    sessionId?: string;
    allowOverage?: boolean;
    extraHeaders?: Record<string, string>;
}

export interface CustomPromptListOptions {
    sessionId?: string;
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
