"use strict";
/**
 * @temple/nervous-client — TypeScript HMAC Signal Authentication Adapter
 *
 * Reference implementation by Brother-2 (seal 2e146175...).
 * Scaffolded into shared package by Author (seal 4272d824...) under Ken's Move 6 blessing 2026-04-20.
 *
 * Protocol source of truth:
 *   D:\projects\claudedocs\HMAC_PROTOCOL_DRAFT_2e146175_2026-04-20.md
 * Ken's decisions:
 *   D:\projects\claudedocs\HMAC_DECISIONS_KEN_2026-04-20.md
 * Cross-language verification (all three languages 14/14 passed):
 *   D:\projects\claudedocs\HMAC_CROSS_LANG_VERIFICATION_2026-04-20.md
 *
 * This is the reference — the canonical statement of the protocol in code.
 * Python (nervous-client-py) and Rust (nervous-client-rs) verify against the
 * same test vectors byte-identically.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalString = canonicalString;
exports.sign = sign;
exports.verify = verify;
exports.reportClient = reportClient;
exports.mountReceiver = mountReceiver;
exports.computeSecretId = computeSecretId;
exports.encodeSecret = encodeSecret;
exports.decodeSecret = decodeSecret;
const crypto_1 = require("crypto");
// ─────────────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────
/** Build the exact bytes that will be HMAC'd. */
function canonicalString(opts) {
    const bodyBytes = Buffer.isBuffer(opts.body)
        ? opts.body
        : Buffer.from(opts.body, 'utf8');
    const bodyHash = (0, crypto_1.createHash)('sha256').update(bodyBytes).digest('hex');
    return [
        opts.method.toUpperCase(),
        opts.path,
        String(opts.timestamp),
        opts.service,
        opts.secretId,
        bodyHash,
    ].join('\n');
}
/** Produce the HMAC-SHA256 signature and the four headers. */
function sign(opts) {
    const canonical = canonicalString(opts);
    const secretKey = Buffer.from(opts.secret, 'base64url');
    if (secretKey.length !== 32) {
        throw new Error(`NERVOUS_SIGNAL_SECRET must decode to exactly 32 bytes; got ${secretKey.length}`);
    }
    const signature = (0, crypto_1.createHmac)('sha256', secretKey)
        .update(canonical)
        .digest('hex');
    return {
        signature,
        canonical,
        headers: {
            'X-Nervous-Timestamp': String(opts.timestamp),
            'X-Nervous-Service': opts.service,
            'X-Nervous-Secret-ID': opts.secretId,
            'X-Nervous-Signature': signature,
        },
    };
}
/** Verify an incoming signed request. */
async function verify(opts) {
    const getHeader = (name) => {
        const lower = name.toLowerCase();
        const v = opts.headers[lower] ?? opts.headers[name];
        if (Array.isArray(v))
            return v[0];
        return v;
    };
    const timestampStr = getHeader('X-Nervous-Timestamp');
    const service = getHeader('X-Nervous-Service');
    const secretId = getHeader('X-Nervous-Secret-ID');
    const sigHex = getHeader('X-Nervous-Signature');
    if (!timestampStr || !service || !secretId || !sigHex) {
        return { ok: false, reason: 'malformed_headers' };
    }
    const timestamp = parseInt(timestampStr, 10);
    if (!Number.isFinite(timestamp) || String(timestamp) !== timestampStr) {
        return { ok: false, reason: 'malformed_headers' };
    }
    if (!/^[0-9a-f]{64}$/.test(sigHex) || !/^[0-9a-f]{8}$/.test(secretId)) {
        return { ok: false, reason: 'malformed_headers' };
    }
    const now = opts.now ? opts.now() : Math.floor(Date.now() / 1000);
    const skew = opts.clockSkewSeconds ?? 60;
    if (Math.abs(now - timestamp) > skew) {
        opts.log?.('signature_rejected', { reason: 'timestamp_out_of_window', service, secretId, skew: now - timestamp });
        return { ok: false, reason: 'timestamp_out_of_window' };
    }
    const lookup = await opts.secretLookup(service, secretId);
    if (!lookup) {
        opts.log?.('signature_rejected', { reason: 'unknown_service_or_secret_id', service, secretId });
        return { ok: false, reason: 'unknown_service_or_secret_id' };
    }
    if (lookup.state === 'revoked') {
        opts.log?.('signature_rejected', { reason: 'revoked_secret', service, secretId });
        return { ok: false, reason: 'revoked_secret' };
    }
    const canonical = canonicalString({
        method: opts.method,
        path: opts.path,
        timestamp,
        service,
        secretId,
        body: opts.body,
    });
    const secretKey = Buffer.from(lookup.secret, 'base64url');
    if (secretKey.length !== 32) {
        opts.log?.('signature_rejected', { reason: 'corrupt_stored_secret', service, secretId });
        return { ok: false, reason: 'unknown_service_or_secret_id' };
    }
    const expectedHex = (0, crypto_1.createHmac)('sha256', secretKey).update(canonical).digest('hex');
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(sigHex, 'hex');
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b)) {
        opts.log?.('signature_rejected', { reason: 'bad_signature', service, secretId });
        return { ok: false, reason: 'bad_signature' };
    }
    if (opts.cacheEnabled && opts.cache) {
        const seen = await opts.cache.has(service, sigHex);
        if (seen) {
            opts.log?.('signature_rejected', { reason: 'replay_detected', service, secretId });
            return { ok: false, reason: 'replay_detected' };
        }
        await opts.cache.record(service, sigHex, skew + 5);
    }
    else {
        opts.log?.('replay_cache_disabled', { service, secretId });
    }
    opts.log?.('signature_verified', { service, secretId });
    return { ok: true, service, secretId };
}
function reportClient(options) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const log = options.log ?? (() => { });
    return {
        async report(payload) {
            const path = '/api/nervous/report';
            const timestamp = Math.floor(Date.now() / 1000);
            const body = JSON.stringify({
                serviceName: options.serviceName,
                event: payload.event,
                state: payload.state,
                timestamp,
            });
            const { headers } = sign({
                method: 'POST',
                path,
                timestamp,
                service: options.serviceName,
                secretId: options.secretId,
                secret: options.secret,
                body,
            });
            const url = options.neshamahUrl.replace(/\/$/, '') + path;
            try {
                const res = await fetchImpl(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers,
                    },
                    body,
                });
                if (!res.ok) {
                    log('report_rejected', { status: res.status, event: payload.event });
                }
                return { ok: res.ok, status: res.status };
            }
            catch (err) {
                log('report_transport_error', { error: err instanceof Error ? err.message : String(err), event: payload.event });
                return { ok: false, status: 0 };
            }
        },
    };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mountReceiver(app, expressModule, options) {
    const path = options.path ?? '/api/nervous/signal';
    const log = options.log ?? (() => { });
    // Body capture strategy:
    // - In strict-HMAC mode, we NEED raw bytes for signature verification.
    //   We install expressModule.raw() on this specific route so the body is
    //   a Buffer. HOWEVER, if the consuming service has registered express.json()
    //   globally BEFORE this mount, json() will have consumed the body already
    //   and our raw() middleware sees an empty stream. In that case the caller
    //   must either mount us before express.json() OR exclude this path from json().
    //   (A warning is logged on strict-mode signature rejection due to parsed body.)
    // - In permitUnsigned Phase 1 mode, signature verification is skipped,
    //   so we accept whatever form req.body already has (parsed object from json(),
    //   raw Buffer from raw(), string, or undefined).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.post(path, expressModule.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
        const hasSignature = Boolean(req.headers['x-nervous-signature'] || req.headers['X-Nervous-Signature']);
        // Normalize body into both a raw buffer (for HMAC) and a parsed object (for handlers).
        // If express.json() already ran globally, req.body is an object and raw() sees empty.
        let rawBody;
        let parsedBody;
        if (Buffer.isBuffer(req.body)) {
            rawBody = req.body;
            try {
                parsedBody = rawBody.length === 0 ? {} : JSON.parse(rawBody.toString('utf8'));
            }
            catch {
                parsedBody = {};
            }
        }
        else if (req.body && typeof req.body === 'object') {
            // express.json() parsed it already — the global json middleware ran before us
            parsedBody = req.body;
            // Best-effort raw reconstruction (lossy; only safe in permitUnsigned mode):
            rawBody = Buffer.from(JSON.stringify(parsedBody), 'utf8');
        }
        else if (typeof req.body === 'string') {
            rawBody = Buffer.from(req.body, 'utf8');
            try {
                parsedBody = JSON.parse(req.body);
            }
            catch {
                parsedBody = {};
            }
        }
        else {
            rawBody = Buffer.alloc(0);
            parsedBody = {};
        }
        // Phase 1 migration: legacy unsigned signals from TempleNervousSystem
        if (!hasSignature && options.permitUnsigned) {
            log('signal_received_unsigned_legacy', {
                path: req.path,
                source: req.headers['x-neshamah-signal'] || 'unknown',
                bodyForm: Buffer.isBuffer(req.body) ? 'buffer' : typeof req.body,
            });
            res.status(200).json({ ok: true, legacy: true });
            setImmediate(async () => {
                const type = typeof parsedBody.type === 'string' ? parsedBody.type : '*';
                const handler = options.handlers?.[type] ?? options.handlers?.['*'];
                if (!handler) {
                    log('signal_unhandled', { type });
                    return;
                }
                try {
                    await handler(parsedBody);
                }
                catch (err) {
                    log('signal_handler_error', { type, error: err instanceof Error ? err.message : String(err) });
                }
            });
            return;
        }
        // Strict mode: signature required. If body was already parsed by upstream json(),
        // the reconstructed rawBody is JSON.stringify-lossy and verification will fail.
        // Log a diagnostic so the service operator knows to either reorder middleware
        // or exclude this path from express.json().
        if (!Buffer.isBuffer(req.body)) {
            log('body_preparsed_warning', {
                note: 'express.json() appears to have consumed the body before mountReceiver. Signature verification may fail. Either mount mountReceiver before express.json() or exclude this path from json parsing.',
            });
        }
        const result = await verify({
            method: 'POST',
            path: req.path,
            headers: req.headers,
            body: rawBody,
            secretLookup: options.secretLookup,
            clockSkewSeconds: options.clockSkewSeconds,
            cacheEnabled: options.cacheEnabled,
            cache: options.cache,
            log,
        });
        if (!result.ok) {
            return res.status(401).end();
        }
        res.status(200).json({ ok: true });
        setImmediate(async () => {
            let parsed;
            try {
                parsed = rawBody.length === 0 ? {} : JSON.parse(rawBody.toString('utf8'));
            }
            catch (err) {
                log('signal_parse_error', { error: err instanceof Error ? err.message : String(err) });
                return;
            }
            const type = typeof parsed.type === 'string' ? parsed.type : '*';
            const handler = options.handlers?.[type] ?? options.handlers?.['*'];
            if (!handler) {
                log('signal_unhandled', { type });
                return;
            }
            try {
                await handler(parsed);
            }
            catch (err) {
                log('signal_handler_error', { type, error: err instanceof Error ? err.message : String(err) });
            }
        });
    });
}
// ─────────────────────────────────────────────────────────────────────
// SECRET UTILITIES (for symmetry with Python/Rust adapters)
// ─────────────────────────────────────────────────────────────────────
/**
 * Compute the 8-char lowercase hex secret ID from a base64url secret.
 * Matches Python's compute_secret_id and Rust's compute_secret_id.
 */
function computeSecretId(secretBase64url) {
    const secretBytes = Buffer.from(secretBase64url, 'base64url');
    const digest = (0, crypto_1.createHash)('sha256').update(secretBytes).digest('hex');
    return digest.slice(0, 8);
}
/** Encode raw secret bytes as base64url (no padding). */
function encodeSecret(secretBytes) {
    return secretBytes.toString('base64url');
}
/** Decode a base64url secret to raw bytes. */
function decodeSecret(secretBase64url) {
    return Buffer.from(secretBase64url, 'base64url');
}
//# sourceMappingURL=index.js.map