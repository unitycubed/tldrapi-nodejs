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
export { ConvertFileOptions, ConvertPdfOptions, ConvertResult, ConvertTextOptions, Credits, CustomPromptDetail, CustomPromptList, CustomPromptListOptions, CustomPromptResult, CustomPromptSubmitOptions, CustomPromptSummary, FileInput, PdfConvertResult, QualityTier, Rates, RatesHistory, RatesHistoryChange, SummarizeConfig, SummarizeOptions, SummarizeResult, TLDRapiClientOptions, Usage, UsageLimits, UsageRange, UsageRangeDay, UsageStats, VALID_TIERS, } from './types';
export { AuthenticationError, InsufficientCreditsError, InvalidRequestError, LanguageNotSupportedError, NetworkError, QualitySelectionRequiresPaidPlanError, RateLimitError, ServerError, TLDRapiError, TimeoutError, } from './errors';
//# sourceMappingURL=index.d.ts.map