> ### ⚠️ Service notice
>
> **The RapidAPI listing that backs this SDK is temporarily unavailable while we work through a launch-day issue. Please check back in a few days.**

# tldrapi — Node.js / TypeScript SDK for TLDRapi

Official Node.js + TypeScript client for the [TLDRapi summarization API](https://tldrapi.com). Summarize text at five quality levels, 20+ built-in voice styles, custom voices for paid tiers. Typed results, typed errors, retries, zero third-party HTTP dependencies (uses the Node 18+ built-in `fetch`).

**TLDRapi is distributed through the RapidAPI marketplace at launch.** Subscribe to the TLDRapi listing on RapidAPI to get your `X-RapidAPI-Key`, then pass it to the client as `rapidapiKey`.

## Install

```bash
npm install tldrapi
# or
pnpm add tldrapi
# or
yarn add tldrapi
```

Node.js 18+.

## Get your app's RapidAPI key

1. Sign in at [rapidapi.com](https://rapidapi.com)
2. Subscribe to the [TLDRapi Summarizer](https://rapidapi.com/thunderAPIs256/api/tldrapi-summarizer) listing (start with **BASIC** — free)
3. Go to **Console** (top nav) → **Applications** → **Add App** (or open an existing one)
4. In the App → **Authorizations** tab → click the copy icon next to your Authorization Key

That's the app's `X-RapidAPI-Key`. Pass it to the SDK constructor.

*Legacy path (deprecated): upper-right (?) → Legacy Developer Dashboard → Add New App → Authorization tab. The new Console path above is simpler.*

The Authorization Key field is the same value in both places — RapidAPI just labels it differently depending on which interface you use:

**New Console:**

![RapidAPI Console — Authorization Method labeled "RAPIDAPI"](https://raw.githubusercontent.com/unitycubed/tldrapi-docs/main/img/rapidapi-key-label-console.png)

**Legacy Developer Dashboard:**

![RapidAPI Legacy Developer Dashboard — Authorization Method labeled "API key"](https://raw.githubusercontent.com/unitycubed/tldrapi-docs/main/img/rapidapi-key-label-legacy.png)



## Quickstart

```typescript
import { TLDRapi } from 'tldrapi';

const client = new TLDRapi({ rapidapiKey: 'YOUR_RAPIDAPI_KEY' });

const result = await client.summarize(
    'Some long text here...',
    { tier: 'standard' },     // 'quick' | 'standard' | 'deep' | 'premium' | 'ultra'
);

console.log(result.summary);
console.log(`used ${result.usage.outputTokens} output tokens on ${result.usage.modelUsed}`);
console.log(`request id (for support): ${result.requestId}`);
```

Or plain JavaScript:

```javascript
const { TLDRapi } = require('tldrapi');
const client = new TLDRapi({ rapidapiKey: 'YOUR_RAPIDAPI_KEY' });
const result = await client.summarize('Long text...');
```

## Handling errors

Every failure extends `TLDRapiError`. Catch the base for a safety net, or catch specific subclasses to branch on failure mode.

```typescript
import {
    TLDRapi, TLDRapiError,
    InsufficientCreditsError, RateLimitError,
    LanguageNotSupportedError,
} from 'tldrapi';

try {
    const result = await client.summarize(text, { tier: 'deep' });
} catch (e) {
    if (e instanceof InsufficientCreditsError) {
        const topupUrl = (e.responseBody.options as any)?.top_up?.url;
        // show user the topup options
    } else if (e instanceof RateLimitError) {
        await new Promise(r => setTimeout(r, (e.retryAfterSeconds || 60) * 1000));
        // retry
    } else if (e instanceof LanguageNotSupportedError) {
        // English only at launch
    } else if (e instanceof TLDRapiError) {
        console.error(`TLDRapi error ${e.statusCode} (req ${e.requestId}): ${e.message}`);
    } else {
        throw e;
    }
}
```

## Quality levels

| Level     | Max chunk tokens | Best for                          |
|-----------|-----------------:|-----------------------------------|
| `quick`   |            4,000 | Short texts, low-latency previews |
| `standard`|           16,000 | Default — modest documents        |
| `deep`    |           32,000 | Longer content, deeper reasoning  |
| `premium` |           64,000 | Substantial documents, high fidelity |
| `ultra`   |          100,000 | Long-form / research-grade        |

**Credit pricing (v2.1)** — credits scale with input size:

```
cost = 1 (extractive_fee)
     + Σ over chunks of (base × ceil(chunk_tokens / 1000))
```

Base costs and chunk sizing are dynamic. Fetch the current schedule at
`GET /rates` (or via `client.rates()` — returns
`base_costs_per_1k_input_tokens`, `retention_ratios`,
`chunk_caps_tokens`, `extractive_fee_credits`). There is no
per-request input-size limit besides the 10 MB request-body cap at
the edge — long documents are split into chunks internally.

## Session pinning

To keep the same model / session state across calls:

```typescript
const r1 = await client.summarize('First document');
const r2 = await client.summarize('Second document', { sessionId: r1.sessionId });
```

## Overage

Pay 2× rate instead of getting a 402 when your balance runs low:

```typescript
const result = await client.summarize(text, { allowOverage: true });
```

## Advanced quality controls (v-session129+)

Every summarize call is parameterized by three orthogonal knobs. Send
zero of them (default `standard` preset) — or send `tier` for a named
preset — or set 1-3 optional axis fields. Both work together: axes
override the preset and the response returns `X-Quality-Warning`.

**30 named presets.** `tier` can be any of `{minimal|brief|balanced|
thorough|detailed|complete}-{quick|standard|deep|premium|ultra}` (e.g.
`thorough-standard`, `complete-quick`). Five short names — `quick /
standard / deep / premium / ultra` — are the SCORECARD-validated
highlighted presets; the other 25 are extrapolated from the same grid.

**Three optional axis overrides.** Any subset:

- `optionalQuality` — LLM tier: `quick | standard | deep | premium | ultra`
- `optionalExtractiveLvl` — retention: `minimal | brief | balanced | thorough | detailed | complete`
- `optionalStrategy` — `contextual-compression | premium-single-shot | hierarchical-merge`

```typescript
// Named preset (extrapolated tuple)
await client.summarize(text, { tier: 'thorough-quick' });

// One axis override (drops down from premium's default extractive)
await client.summarize(text, {
  tier: 'premium',
  optionalExtractiveLvl: 'brief'
});

// All three axes
await client.summarize(text, {
  optionalQuality: 'ultra',
  optionalExtractiveLvl: 'complete',
  optionalStrategy: 'premium-single-shot'
});
```

### Paid-tier quality guarantees

By default paid-tier calls WAIT for the exact model your quality level
maps to (strict mode). Opt into permissive fallback with
`allowDowngrade: true`:

```typescript
const r = await client.summarize(text, {
  tier: 'premium',
  allowDowngrade: true,
});
// Response may set X-Quality-Actual naming the tier that actually served.
```

### Async submit + poll (long-running jobs)

For calls that may exceed your HTTP client timeout:

```typescript
const requestId = await client.submitAsync(text, { tier: 'ultra' });
const result = await client.waitForResult(requestId, {
  timeoutMs: 300000,       // 5-min client-side cap; null = no cap
  pollIntervalMs: 5000,
});
```

Or manual polling:

```typescript
const result = await client.getResult(requestId);
if (result === null) {
  // still queued — poll again after ~5s
}
```

Credits are deducted at submit time and refunded on failure like sync.
Composes freely with `allowDowngrade` + optional axes.

## Configuration

| Option        | Default                            | Notes                                       |
|---------------|------------------------------------|---------------------------------------------|
| `rapidapiKey` | (required)                         | Your `X-RapidAPI-Key` from RapidAPI dashboard |
| `rapidapiHost`| `tldrapi-summarizer.p.rapidapi.com`            | Override for staging listings only          |
| `baseUrl`     | `https://tldrapi-summarizer.p.rapidapi.com`    | Change to point at a staging / mirror       |
| `timeoutMs`   | 60_000                             | Per-request; deep tier can take 30s         |
| `retries`     | 3                                  | Retries on 5xx + network errors only        |
| `fetchImpl`   | `globalThis.fetch`                 | Pass `node-fetch` or `undici` for Node <18  |

## Support

- Issues: <https://github.com/unitycubedapps/tldrapi-node/issues>
- Docs:   <https://unitycubed.dev/tldrapi/docs>
- Legal:  <https://unitycubed.dev/tldrapi/legal>

## License

Released under the MIT License — see [LICENSE](LICENSE).

Copyright (c) 2026 Ehren Biglari / Unity Cubed.
