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
import { ConvertFileOptions, ConvertPdfOptions, ConvertResult, ConvertTextOptions, CustomPromptDetail, CustomPromptList, CustomPromptListOptions, CustomPromptResult, CustomPromptSubmitOptions, FileInput, PdfConvertResult, Rates, RatesHistory, SummarizeOptions, SummarizeResult, TLDRapiClientOptions, UsageRange, UsageStats } from './types';
export declare const DEFAULT_RAPIDAPI_HOST = "tldrapi-summarizer.p.rapidapi.com";
export declare class TLDRapi {
    private readonly rapidapiKey;
    private readonly rapidapiHost;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly retries;
    private readonly fetchImpl;
    constructor(opts: TLDRapiClientOptions);
    summarize(inputText: string, options?: SummarizeOptions): Promise<SummarizeResult>;
    rates(): Promise<Rates>;
    usage(): Promise<UsageStats>;
    convertJsonToText(text: string, opts?: ConvertTextOptions): Promise<ConvertResult>;
    convertHtmlToText(text: string, opts?: ConvertTextOptions): Promise<ConvertResult>;
    convertMdToText(text: string, opts?: ConvertTextOptions): Promise<ConvertResult>;
    private convertText;
    convertDocToText(file: FileInput, opts?: ConvertFileOptions): Promise<ConvertResult>;
    convertDocToLatex(file: FileInput, opts?: ConvertFileOptions): Promise<ConvertResult>;
    /** Deprecated alias for `convertDocToText`. Kept for backward compat. */
    convertDocxToText(file: FileInput, opts?: ConvertFileOptions): Promise<ConvertResult>;
    private convertFile;
    convertPdfToLatex(file: FileInput, opts?: ConvertPdfOptions): Promise<PdfConvertResult>;
    pdfStatus(jobId: string): Promise<PdfConvertResult>;
    ratesHistory(): Promise<RatesHistory>;
    usageRange(from: string, to: string): Promise<UsageRange>;
    customPromptSubmit(voiceName: string, instruction: string, opts?: CustomPromptSubmitOptions): Promise<CustomPromptResult>;
    customPromptsList(opts?: CustomPromptListOptions): Promise<CustomPromptList>;
    customPromptGet(promptId: string): Promise<CustomPromptDetail>;
    private request;
}
//# sourceMappingURL=client.d.ts.map