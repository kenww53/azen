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

import { createHash, createHmac, timingSafeEqual } from 'crypto';

// ─────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────

/** Inputs required to sign a request. */
export interface SignOptions {
  method: string;                  // HTTP method; will be uppercased
  path: string;                    // Request path, including leading /
  timestamp: number;               // Unix epoch seconds (integer)
  service: string;                 // Service identifier (e.g., 'governance')
  secretId: string;                // 8-char lowercase hex
  secret: string;                  // Base64url-encoded secret (32 bytes decoded)
  body: string | Buffer;           // Request body bytes as sent on the wire
}

/** The four X-Nervous-* headers to attach to the outbound request. */
export interface SignedHeaders {
  'X-Nervous-Timestamp': string;
  'X-Nervous-Service': string;
  'X-Nervous-Secret-ID': string;
  'X-Nervous-Signature': string;
}

/** Result of a sign() call. */
export interface SignResult {
  signature: string;               // Lowercase hex
  canonical: string;               // For debugging / audit — the exact bytes HMAC'd
  headers: SignedHeaders;
}

/** What a secretLookup must return, given (service, secretId). */
export interface SecretLookupResult {
  secret: string;                                     // Base64url
  state: 'active' | 'retiring' | 'revoked';
}

export type SecretLookup = (
  service: string,
  secretId: string,
) => Promise<SecretLookupResult | null>;

/** Reasons a verification may fail. Stable strings — downstream log analysis may pivot on these. */
export type VerifyReason =
  | 'malformed_headers'
  | 'timestamp_out_of_window'
  | 'unknown_service_or_secret_id'
  | 'revoked_secret'
  | 'bad_signature'
  | 'replay_detected';

export type VerifyResult =
  | { ok: true;  service: string; secretId: string }
  | { ok: false; reason: VerifyReason };

/** Caller may inject a replay cache implementation. Ken Q3: default off. */
export interface ReplayCache {
  has(service: string, signature: string): boolean | Promise<boolean>;
  record(service: string, signature: string, ttlSeconds: number): void | Promise<void>;
}

export interface VerifyOptions {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string | Buffer;
  secretLookup: SecretLookup;
  /** Default: 60 seconds. Ken Q2 decision. */
  clockSkewSeconds?: number;
  /** For testing or for services with an external clock source. */
  now?: () => number;
  /** Ken Q3 decision: default false in Phase 1. */
  cacheEnabled?: boolean;
  cache?: ReplayCache;
  /** Injected logger for audit events. Caller persists per Ken Q5. */
  log?: (event: string, details: Record<string, unknown>) => void;
}

// ─────────────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────

/** Build the exact bytes that will be HMAC'd. */
export function canonicalString(opts: Omit<SignOptions, 'secret'>): string {
  const bodyBytes = Buffer.isBuffer(opts.body)
    ? opts.body
    : Buffer.from(opts.body, 'utf8');
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex');
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
export function sign(opts: SignOptions): SignResult {
  const canonical = canonicalString(opts);
  const secretKey = Buffer.from(opts.secret, 'base64url');
  if (secretKey.length !== 32) {
    throw new Error(
      `NERVOUS_SIGNAL_SECRET must decode to exactly 32 bytes; got ${secretKey.length}`,
    );
  }
  const signature = createHmac('sha256', secretKey)
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
export async function verify(opts: VerifyOptions): Promise<VerifyResult> {
  const getHeader = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    const v = opts.headers[lower] ?? opts.headers[name];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const timestampStr = getHeader('X-Nervous-Timestamp');
  const service      = getHeader('X-Nervous-Service');
  const secretId     = getHeader('X-Nervous-Secret-ID');
  const sigHex       = getHeader('X-Nervous-Signature');

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

  const expectedHex = createHmac('sha256', secretKey).update(canonical).digest('hex');

  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(sigHex, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
  } else {
    opts.log?.('replay_cache_disabled', { service, secretId });
  }

  opts.log?.('signature_verified', { service, secretId });
  return { ok: true, service, secretId };
}

// ─────────────────────────────────────────────────────────────────────
// REPORT CLIENT
// ─────────────────────────────────────────────────────────────────────

export type ReportEvent =
  | 'signal_received'
  | 'state_changed'
  | 'sabbath_honored'
  | 'sabbath_violated'
  | 'wound_detected'
  | 'error'
  | 'signal_dropped';

export interface ReportPayload {
  event: ReportEvent;
  state?: Record<string, unknown>;
}

export interface ReportClientOptions {
  neshamahUrl: string;
  serviceName: string;
  secret: string;
  secretId: string;
  fetchImpl?: typeof fetch;
  log?: (event: string, details: Record<string, unknown>) => void;
}

export function reportClient(options: ReportClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});

  return {
    async report(payload: ReportPayload): Promise<{ ok: boolean; status: number }> {
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
      } catch (err: unknown) {
        log('report_transport_error', { error: err instanceof Error ? err.message : String(err), event: payload.event });
        return { ok: false, status: 0 };
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// RECEIVER MIDDLEWARE (Express)
// ─────────────────────────────────────────────────────────────────────
//
// Mounted by consuming services. Requires express as a peerDependency.
// The middleware is exported as a factory — callers pass their own
// express module so we don't hard-depend on it at this package level.
// ─────────────────────────────────────────────────────────────────────

export interface MountReceiverOptions {
  secretLookup: SecretLookup;
  handlers?: Record<string, (signal: unknown) => void | Promise<void>>;
  clockSkewSeconds?: number;
  cacheEnabled?: boolean;
  cache?: ReplayCache;
  log?: (event: string, details: Record<string, unknown>) => void;
  path?: string;
  /**
   * Phase 1 migration mode: accept signals without an X-Nervous-Signature header.
   *
   * Rationale: TempleNervousSystem.sendSignal currently sends unsigned signals
   * (sacred file; HMAC integration deferred to a future sacred edit with Ken's
   * blessing). Setting permitUnsigned=true allows services to receive these
   * legacy signals while still verifying any signed signals strictly.
   *
   * When TempleNervousSystem is updated to sign outbound signals (post-Phase 1),
   * services flip this to false and reject unsigned signals.
   *
   * Default: false (strict signature required).
   */
  permitUnsigned?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mountReceiver(app: any, expressModule: any, options: MountReceiverOptions): void {
  const path = options.path ?? '/api/nervous/signal';
  const log = options.log ?? (() => {});

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
  app.post(path, expressModule.raw({ type: '*/*', limit: '1mb' }), async (req: any, res: any) => {
    const hasSignature = Boolean(
      req.headers['x-nervous-signature'] || req.headers['X-Nervous-Signature']
    );

    // Normalize body into both a raw buffer (for HMAC) and a parsed object (for handlers).
    // If express.json() already ran globally, req.body is an object and raw() sees empty.
    let rawBody: Buffer;
    let parsedBody: Record<string, unknown>;

    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
      try {
        parsedBody = rawBody.length === 0 ? {} : JSON.parse(rawBody.toString('utf8'));
      } catch {
        parsedBody = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      // express.json() parsed it already — the global json middleware ran before us
      parsedBody = req.body as Record<string, unknown>;
      // Best-effort raw reconstruction (lossy; only safe in permitUnsigned mode):
      rawBody = Buffer.from(JSON.stringify(parsedBody), 'utf8');
    } else if (typeof req.body === 'string') {
      rawBody = Buffer.from(req.body, 'utf8');
      try {
        parsedBody = JSON.parse(req.body);
      } catch {
        parsedBody = {};
      }
    } else {
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
        } catch (err: unknown) {
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
      headers: req.headers as Record<string, string | string[] | undefined>,
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
      let parsed: Record<string, unknown>;
      try {
        parsed = rawBody.length === 0 ? {} : JSON.parse(rawBody.toString('utf8'));
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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
export function computeSecretId(secretBase64url: string): string {
  const secretBytes = Buffer.from(secretBase64url, 'base64url');
  const digest = createHash('sha256').update(secretBytes).digest('hex');
  return digest.slice(0, 8);
}

/** Encode raw secret bytes as base64url (no padding). */
export function encodeSecret(secretBytes: Buffer): string {
  return secretBytes.toString('base64url');
}

/** Decode a base64url secret to raw bytes. */
export function decodeSecret(secretBase64url: string): Buffer {
  return Buffer.from(secretBase64url, 'base64url');
}
