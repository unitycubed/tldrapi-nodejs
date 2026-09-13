"use strict";
/**
 * tldrapi — Node.js/TypeScript SDK for the TLDRapi summarization API.
 * Summarize any content, in one API call.
 *
 *     import { TLDRapi } from 'tldrapi';
 *     const client = new TLDRapi({ apiKey: 'tldr_...' });
 *     const r = await client.summarize('Long text...', { tier: 'standard' });
 *     console.log(r.summary);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutError = exports.TLDRapiError = exports.ServerError = exports.RateLimitError = exports.QualitySelectionRequiresPaidPlanError = exports.NetworkError = exports.LanguageNotSupportedError = exports.InvalidRequestError = exports.InsufficientCreditsError = exports.AuthenticationError = exports.VALID_TIERS = exports.TLDRapi = void 0;
var client_1 = require("./client");
Object.defineProperty(exports, "TLDRapi", { enumerable: true, get: function () { return client_1.TLDRapi; } });
var types_1 = require("./types");
Object.defineProperty(exports, "VALID_TIERS", { enumerable: true, get: function () { return types_1.VALID_TIERS; } });
var errors_1 = require("./errors");
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return errors_1.AuthenticationError; } });
Object.defineProperty(exports, "InsufficientCreditsError", { enumerable: true, get: function () { return errors_1.InsufficientCreditsError; } });
Object.defineProperty(exports, "InvalidRequestError", { enumerable: true, get: function () { return errors_1.InvalidRequestError; } });
Object.defineProperty(exports, "LanguageNotSupportedError", { enumerable: true, get: function () { return errors_1.LanguageNotSupportedError; } });
Object.defineProperty(exports, "NetworkError", { enumerable: true, get: function () { return errors_1.NetworkError; } });
Object.defineProperty(exports, "QualitySelectionRequiresPaidPlanError", { enumerable: true, get: function () { return errors_1.QualitySelectionRequiresPaidPlanError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_1.RateLimitError; } });
Object.defineProperty(exports, "ServerError", { enumerable: true, get: function () { return errors_1.ServerError; } });
Object.defineProperty(exports, "TLDRapiError", { enumerable: true, get: function () { return errors_1.TLDRapiError; } });
Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function () { return errors_1.TimeoutError; } });
//# sourceMappingURL=index.js.map