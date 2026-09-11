> ### ⚠️ Service notice
>
> **The RapidAPI listing that backs this SDK is temporarily unavailable while we work through a launch-day issue. Please check back in a few days.**

# tldrapi — Node.js / TypeScript SDK for TLDRapi

Official Node.js + TypeScript client for the [TLDRapi summarization API](https://tldrapi.com). Summarize text at five quality tiers, 20+ built-in voice styles, custom voices for paid tiers. Typed results, typed errors, retries, zero third-party HTTP dependencies (uses the Node 18+ built-in `fetch`).

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

## Quality tiers

| Tier      | Credits/call | Max input tokens | Best for                          |
|-----------|-------------:|-----------------:|-----------------------------------|
| `quick`   |            1 |            4,000 | Short texts, low-latency previews |
| `standard`|            5 |           16,000 | Default — modest documents        |
| `deep`    |           30 |           32,000 | Longer content, deeper reasoning  |
| `premium` |          110 |           64,000 | Substantial documents, high fidelity |
| `ultra`   |          400 |          100,000 | Long-form / research-grade        |

Credit costs are dynamic — check current with `client.rates()`.

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

## Configuration

| Option        | Default                            | Notes                                       |
|---------------|------------------------------------|---------------------------------------------|
| `rapidapiKey` | (required)                         | Your `X-RapidAPI-Key` from RapidAPI dashboard |
| `rapidapiHost`| `tldrapi.p.rapidapi.com`            | Override for staging listings only          |
| `baseUrl`     | `https://unitycubed.dev/TLDRapi`    | Change to point at a staging / mirror       |
| `timeoutMs`   | 60_000                             | Per-request; deep tier can take 30s         |
| `retries`     | 3                                  | Retries on 5xx + network errors only        |
| `fetchImpl`   | `globalThis.fetch`                 | Pass `node-fetch` or `undici` for Node <18  |

## Support

- Issues: <https://github.com/unitycubedapps/tldrapi-node/issues>
- Docs:   <https://unitycubed.dev/tldrapi/docs>
- Legal:  <https://unitycubed.dev/tldrapi/legal>

## License

MIT.
