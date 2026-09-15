# tldrapi — Node.js / TypeScript SDK for TLDRapi

Official Node.js + TypeScript client for [TLDRapi](https://tldrapi.com) —
turn any content into a clean summary in one API call.

- **Free tier** — 100 credits per month, no card, no trial expiry
- **20+ input formats** — text, HTML, Markdown, PDF (with OCR), .docx,
  .doc, .odt, .rtf, .epub, JSON, YAML, CSV, transcripts
- **5 quality tiers** — pick latency vs. depth per call
- **Custom voice styles** — 20+ built-in voices; paid tiers can define
  their own with plain-English instructions
- **Multi-provider routing** — automatic failover across Anthropic,
  OpenAI, Groq, Gemini, and OpenRouter
- **Refunds you don't have to ask for** — every summary is judge-scored
  and mis-summaries are auto-refunded
- **First-class TypeScript** — typed results, typed errors, no third-party
  HTTP deps (uses Node 18+ built-in `fetch`)

```bash
npm install tldrapi
# or
pnpm add tldrapi
# or
yarn add tldrapi
```

Node.js 18+.

## Table of contents

- [Getting your free key](#getting-your-free-key)
- [Hello world](#hello-world)
- [Examples gallery](#examples-gallery)
  - [Summarize an article by URL](#summarize-an-article-by-url)
  - [Summarize a PDF (with OCR)](#summarize-a-pdf-with-ocr)
  - [Summarize a Word / RTF / EPUB file](#summarize-a-word--rtf--epub-file)
  - [Summarize a long document asynchronously](#summarize-a-long-document-asynchronously)
  - [Pin a session across many summaries](#pin-a-session-across-many-summaries)
  - [Batch summarize in parallel](#batch-summarize-in-parallel)
  - [Convert-only: extract text without summarizing](#convert-only-extract-text-without-summarizing)
  - [PDF → LaTeX](#pdf--latex)
  - [Custom voice: teach the model your tone](#custom-voice-teach-the-model-your-tone)
  - [Handle a rate-limit with backoff](#handle-a-rate-limit-with-backoff)
  - [Show live credit balance to your user](#show-live-credit-balance-to-your-user)
  - [Advanced quality controls — 3 axes, 30 named presets](#advanced-quality-controls)
- [Error handling](#error-handling)
- [Configuration + retries](#configuration--retries)
- [Rates + usage endpoints](#rates--usage-endpoints)
- [License](#license)

## Getting your free key

1. Sign in at [rapidapi.com](https://rapidapi.com)
2. Subscribe to the [TLDRapi Summarizer](https://rapidapi.com/thunderAPIs256/api/tldrapi-summarizer)
   listing — choose **BASIC (Free)**
3. Open the listing → **Console** → **Applications** → **Add App**
4. In the App → **Authorizations** tab → copy the Authorization Key

Pass it to the SDK constructor as `rapidapiKey`. Everything on the
free tier works exactly like the paid tiers — same endpoints, same
response shape, same SDK — just with a 100-credit monthly cap.

## Hello world

```typescript
import { TLDRapi } from 'tldrapi';

const client = new TLDRapi({ rapidapiKey: 'YOUR_RAPIDAPI_KEY' });

const result = await client.summarize('Some long article body here...');
console.log(result.summary);
```

Or plain JavaScript:

```javascript
const { TLDRapi } = require('tldrapi');
const client = new TLDRapi({ rapidapiKey: 'YOUR_RAPIDAPI_KEY' });
const result = await client.summarize('Long text...');
```

The result also carries `result.requestId` (share with support when
reporting issues), `result.sessionId` (see [session pinning](#pin-a-session-across-many-summaries)),
and `result.credits` (snapshot of what this call cost and what you
have left).

## Examples gallery

### Summarize an article by URL

TLDRapi accepts URLs directly — the server fetches, extracts main
content, strips nav/ads, and summarizes.

```typescript
const r = await client.summarize(
    'https://arxiv.org/abs/1706.03762',
    { tier: 'deep' },
);
console.log(r.summary);
```

Works with HTML pages, news sites, GitHub READMEs, blog posts, and
academic PDFs served over HTTP.

### Summarize a PDF (with OCR)

```typescript
import { readFileSync } from 'node:fs';

// PDF with selectable text — instant path
const pdf = readFileSync('report.pdf');
const text = await client.convertPdfToLatex(pdf, { filename: 'report.pdf' });

// Scanned PDF (no selectable text) — automatic OCR fallback
const scanned = readFileSync('scanned.pdf');
const ocr = await client.convertPdfToLatex(scanned, {
    filename: 'scanned.pdf',
    backend: 'modal',
});
```

`convertPdfToLatex` returns LaTeX suitable for downstream typesetting,
or a plain markdown-style text if you don't need LaTeX. Pipe it back
into `summarize()` if all you want is a summary.

### Summarize a Word / RTF / EPUB file

```typescript
import { readFileSync } from 'node:fs';

const docx = readFileSync('chapter.docx');
const doc = await client.convertDocxToText(docx, { filename: 'chapter.docx' });

const r = await client.summarize(doc.output, { tier: 'premium' });
console.log(r.summary);
```

Same pattern for `.doc`, `.odt`, `.rtf`, `.epub`, `.html`, `.md`,
`.json`, `.yaml`, `.csv`.

### Summarize a long document asynchronously

For inputs that may take longer than your HTTP client timeout, submit
async and poll:

```typescript
const requestId = await client.submitAsync(giantDocument, { tier: 'ultra' });

// blocks + polls in the background; 5-min cap by default
const result = await client.waitForResult(requestId, {
    timeoutMs: 300_000,
    pollIntervalMs: 5_000,
});
console.log(result.summary);
```

Or poll manually:

```typescript
const requestId = await client.submitAsync(giantDocument, { tier: 'ultra' });

while (true) {
    const r = await client.getResult(requestId);
    if (r !== null) { console.log(r.summary); break; }
    await new Promise((res) => setTimeout(res, 5_000));
}
```

Credits are deducted at submit time and refunded on failure, same as
sync.

### Pin a session across many summaries

Session pinning keeps the same underlying model — and, in the future,
the same in-memory context — for a batch of related documents:

```typescript
const r1 = await client.summarize('Doc 1');
const r2 = await client.summarize('Doc 2', { sessionId: r1.sessionId });
const r3 = await client.summarize('Doc 3', { sessionId: r1.sessionId });
```

Useful when you want consistent voice across a run — chapters of the same book, articles in a series, tickets in the same support thread.

### Batch summarize in parallel

```typescript
const summaries = await Promise.all(
    texts.map((t) => client.summarize(t, { tier: 'quick' })),
);
```

The client is fully concurrent-safe. Free-tier is rate-limited so
throttle to ~3 rps; paid tiers are much higher.

### Convert-only: extract text without summarizing

Sometimes you just want the text — pull the words out of a doc without
paying for a summary:

```typescript
const r = await client.convertHtmlToText('<h1>Hi</h1><p>Content...</p>');
console.log(r.output);
```

Available: `convertJsonToText`, `convertHtmlToText`, `convertMdToText`,
`convertDocToText`, `convertDocxToText`.

### PDF → LaTeX

Round-trip a PDF through TLDRapi's PDF pipeline and get LaTeX back —
handy when the downstream is a document generator:

```typescript
const pdf = readFileSync('paper.pdf');
let r = await client.convertPdfToLatex(pdf, { filename: 'paper.pdf' });

if (r.jobId) {
    // server chose async path — poll status until done
    while (r.status !== 'done') {
        await new Promise((res) => setTimeout(res, 5_000));
        r = await client.pdfStatus(r.jobId);
    }
}
console.log(r.output);  // LaTeX source
```

### Custom voice: teach the model your tone

Paid tiers can register a natural-language voice instruction and reuse
it as a per-call `voiceName` on future summaries:

```typescript
const sub = await client.customPromptSubmit({
    voiceName: 'brand-tone',
    instruction: [
        'Write in the second person, active voice.',
        'Prefer verbs over nouns. Keep sentences under 20 words.',
        "Avoid corporate jargon ('leverage', 'synergy').",
        'Aim for the reading level of a well-written newspaper.',
    ].join(' '),
});
// sub.id is your prompt id; sub.status transitions from 'pending' → 'approved'/'rejected'
```

Once approved:

```typescript
const r = await client.summarize(text, { voiceName: 'brand-tone' });
```

Approval is automatic — the server runs the instruction against a
judge that checks for policy compliance. Rejections come back with
`sub.rejectionReason`.

### Handle a rate-limit with backoff

```typescript
import { RateLimitError } from 'tldrapi';

for (let attempt = 0; attempt < 3; attempt++) {
    try {
        const r = await client.summarize(text, { tier: 'deep' });
        break;
    } catch (e) {
        if (!(e instanceof RateLimitError)) throw e;
        await new Promise((res) =>
            setTimeout(res, (e.retryAfterSeconds || 60) * 1000)
        );
    }
}
```

The SDK exposes the server's `Retry-After` header on
`RateLimitError.retryAfterSeconds`.

### Show live credit balance to your user

```typescript
const u = await client.usage();
console.log(`You have ${u.creditsRemaining} credits left (${u.plan})`);

const r = await client.summarize(text);
console.log(`That call cost ${r.credits.charged} credits.`);
console.log(`Remaining: ${r.credits.remaining}`);
```

Every summarize response carries a `credits` snapshot so you don't
need a separate `usage()` round-trip on every call.

### Advanced quality controls

Every summarize call has three orthogonal knobs. You can send zero of
them (defaults are fine), or a named preset, or set 1-3 optional axes,
or combine — axes override the preset and the server returns
`X-Quality-Warning`.

**30 named presets** arranged as a 1D spectrum across the underlying 3D
quality space (LLM x retention x strategy). The 5 bolded rows are the
main anchors; each also accepts a short alias equal to its LLM tier
name (`quick` / `standard` / `deep` / `premium` / `ultra`).

| #  | Preset                | What it delivers                                                                                       |
|---:|-----------------------|--------------------------------------------------------------------------------------------------------|
|  1 | `minimal-quick`       | Cheapest and fastest. Headline-length blurb from a small chunk. Title-level takeaway.                  |
|  2 | **`brief-quick`**     | 3-sentence recap with the fastest LLM. Previews and low-latency feed cards.                            |
|  3 | `minimal-standard`    | Headline blurb with the mid-tier LLM's fluency; still very cheap.                                      |
|  4 | `balanced-quick`      | 3-5 sentences from the fast LLM; slightly deeper than `brief-quick`.                                   |
|  5 | `brief-standard`      | 3-sentence recap with smoother phrasing than `brief-quick`.                                            |
|  6 | **`balanced-standard`** | Balanced coverage without run-ons. The general default for most articles.                            |
|  7 | `thorough-quick`      | Paragraph-length from the fast LLM; retains the top 2-3 supporting facts.                              |
|  8 | `minimal-deep`        | Headline output with the deeper LLM's coherence; frugal way to buy fluency without length.             |
|  9 | `brief-deep`          | 3-sentence recap with deeper-model reasoning.                                                          |
| 10 | **`thorough-deep`**   | Preserves specific dates, names, secondary facts. Research papers, meeting transcripts, long articles. |
| 11 | `detailed-quick`      | Longer paragraph from the fast LLM; more supporting facts, still light on nuance.                      |
| 12 | `thorough-standard`   | Retains dates and names on Standard-class content; great for meeting-transcript recaps.                |
| 13 | `complete-quick`      | Maximum retention the Quick LLM can produce; nearing Standard breadth but Quick tone.                  |
| 14 | `balanced-deep`       | 4-6 sentences with deep-model narrative flow.                                                          |
| 15 | `detailed-standard`   | Full-paragraph, entity-preserving; approaches Deep on retention.                                       |
| 16 | `complete-standard`   | Maximum Standard retention; substantial output length.                                                 |
| 17 | `detailed-deep`       | Heavy retention with deep-model reasoning; picks up minor arguments.                                   |
| 18 | `complete-deep`       | Maximum Deep retention; edging into Premium coverage.                                                  |
| 19 | `minimal-premium`     | Very short output with premium-model tone; premium quality at bargain length.                          |
| 20 | `brief-premium`       | 3-sentence recap with high-fidelity entity handling.                                                   |
| 21 | **`detailed-premium`** | Entity preservation, edge cases, atmospheric detail. Substantial documents and long-form reports.     |
| 22 | `balanced-premium`    | Moderate-length premium coverage; smoother than Deep, more concise than `detailed-premium`.            |
| 23 | `thorough-premium`    | Heavy retention with premium reasoning.                                                                |
| 24 | `minimal-ultra`       | Single-shot on the full document, minimum output length. Ultra fidelity, tiny output.                  |
| 25 | `brief-ultra`         | Full-context single-shot, 3-sentence output. Ideal for research-grade preview blurbs.                  |
| 26 | **`complete-ultra`**  | Single-shot on the full document, maximum retention, no chunking artifacts. Book-length manuscripts, long-form technical documentation. |
| 27 | `complete-premium`    | Maximum Premium retention; almost every noteworthy fact.                                               |
| 28 | `balanced-ultra`      | Full-context single-shot, balanced-length output.                                                      |
| 29 | `thorough-ultra`      | Full-context, retains most secondary facts.                                                            |
| 30 | `detailed-ultra`      | Full-context, near-maximum retention; the top rung of the spectrum.                                    |


**Three optional axis overrides.** Any subset:

- `optionalQuality` — LLM tier: `quick | standard | deep | premium | ultra`
- `optionalExtractiveLvl` — retention level: `minimal | brief | balanced | thorough | detailed | complete`
- `optionalStrategy` — inference strategy: `contextual-compression | premium-single-shot | hierarchical-merge`

```typescript
// named preset
await client.summarize(text, { tier: 'thorough-quick' });

// preset + one axis override — axes win, warning header returned
await client.summarize(text, {
    tier: 'premium',
    optionalExtractiveLvl: 'brief',
});

// all three axes, no preset
await client.summarize(text, {
    optionalQuality: 'ultra',
    optionalExtractiveLvl: 'complete',
    optionalStrategy: 'premium-single-shot',
});

// opt into permissive downgrade on paid-tier
await client.summarize(text, { tier: 'premium', allowDowngrade: true });
```

## Paid-tier quality guarantees

Paid tiers WAIT for a specific canonical model rather than silently
mixing peer models. Opt into permissive fallback with
`allowDowngrade: true` — the worker walks DOWN the ladder (premium →
deep → standard → quick) and returns whichever tier's primary is
available. Response carries `X-Quality-Actual` and `X-Original-Tier`
when a downgrade happened, and the credit-cost delta is automatically
refunded.

## Error handling

Every SDK exception inherits from `TLDRapiError`. Catch broadly for a
safety net or narrowly to branch on failure mode:

```typescript
import {
    TLDRapi, TLDRapiError,
    InsufficientCreditsError, RateLimitError,
    LanguageNotSupportedError, AuthenticationError,
    ServerError, TimeoutError,
} from 'tldrapi';

try {
    const r = await client.summarize(text, { tier: 'deep' });
} catch (e) {
    if (e instanceof InsufficientCreditsError) {
        const topUpUrl = (e.responseBody.options as any)?.top_up?.url;
        // …prompt user to top up…
    } else if (e instanceof RateLimitError) {
        await new Promise((r) => setTimeout(r, (e.retryAfterSeconds || 60) * 1000));
    } else if (e instanceof LanguageNotSupportedError) {
        // English-only at launch; cross-lingual coming Month 2-3
    } else if (e instanceof AuthenticationError) {
        // Bad key
    } else if (e instanceof TimeoutError) {
        // long inputs on deep+ can legitimately need >60s
    } else if (e instanceof TLDRapiError) {
        console.error(`TLDRapi error ${e.statusCode} (req ${e.requestId}): ${e.message}`);
    } else {
        throw e;
    }
}
```

Every error carries `.statusCode`, `.requestId` (X-Request-ID —
attach when reporting bugs), and `.responseBody` (parsed JSON error
body).

## Configuration + retries

```typescript
const client = new TLDRapi({
    rapidapiKey: 'YOUR_KEY',
    rapidapiHost: 'tldrapi-summarizer.p.rapidapi.com',  // staging override
    baseUrl: undefined,                          // default = https://{rapidapiHost}
    timeoutMs: 60_000,                           // per-request
    retries: 3,                                  // 5xx + network only
    // fetchImpl: undici.fetch,                  // pass node-fetch/undici for Node <18
});
```

Automatic retries on 5xx and transient network failures with
exponential backoff + jitter (3 attempts default). 4xx and 429 are
**not** retried — the SDK exposes `RateLimitError.retryAfterSeconds`
so you can honor the server's window.

## Rates + usage endpoints

```typescript
const rates = await client.rates();
const usage = await client.usage();
const history = await client.ratesHistory();
const range = await client.usageRange('2026-09-01', '2026-09-15');
```

## License

Released under the MIT License — see [LICENSE](LICENSE).

Copyright (c) 2026 Ehren Biglari / Unity Cubed.
