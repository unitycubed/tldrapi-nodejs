/**
 * tldrapi — Node.js/TypeScript SDK for the TLDRapi summarization API.
 * Summarize any content, in one API call.
 *
 *     import { TLDRapi } from 'tldrapi';
 *     const client = new TLDRapi({ apiKey: 'tldr_...' });
 *     const r = await client.summarize('Long text...', { tier: 'standard' });
 *     console.log(r.summary);
 */

export { TLDRapi } from './client';
export {
    QualityTier,
    Rates,
    SummarizeOptions,
    SummarizeResult,
    TLDRapiClientOptions,
    Usage,
    UsageStats,
    VALID_TIERS,
    Credits,
} from './types';
export {
    AuthenticationError,
    InsufficientCreditsError,
    InvalidRequestError,
    LanguageNotSupportedError,
    NetworkError,
    QualitySelectionRequiresPaidPlanError,
    RateLimitError,
    ServerError,
    TLDRapiError,
    TimeoutError,
} from './errors';
