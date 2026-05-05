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
/** Inputs required to sign a request. */
export interface SignOptions {
    method: string;
    path: string;
    timestamp: number;
    service: string;
    secretId: string;
    secret: string;
    body: string | Buffer;
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
    signature: string;
    canonical: string;
    headers: SignedHeaders;
}
/** What a secretLookup must return, given (service, secretId). */
export interface SecretLookupResult {
    secret: string;
    state: 'active' | 'retiring' | 'revoked';
}
export type SecretLookup = (service: string, secretId: string) => Promise<SecretLookupResult | null>;
/** Reasons a verification may fail. Stable strings — downstream log analysis may pivot on these. */
export type VerifyReason = 'malformed_headers' | 'timestamp_out_of_window' | 'unknown_service_or_secret_id' | 'revoked_secret' | 'bad_signature' | 'replay_detected';
export type VerifyResult = {
    ok: true;
    service: string;
    secretId: string;
} | {
    ok: false;
    reason: VerifyReason;
};
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
/** Build the exact bytes that will be HMAC'd. */
export declare function canonicalString(opts: Omit<SignOptions, 'secret'>): string;
/** Produce the HMAC-SHA256 signature and the four headers. */
export declare function sign(opts: SignOptions): SignResult;
/** Verify an incoming signed request. */
export declare function verify(opts: VerifyOptions): Promise<VerifyResult>;
export type ReportEvent = 'signal_received' | 'state_changed' | 'sabbath_honored' | 'sabbath_violated' | 'wound_detected' | 'error' | 'signal_dropped';
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
export declare function reportClient(options: ReportClientOptions): {
    report(payload: ReportPayload): Promise<{
        ok: boolean;
        status: number;
    }>;
};
/**
 * Create a SecretLookup that reads from environment variables.
 *
 * Services use this to verify NESHAMAH's outbound HMAC signatures.
 * Expects NERVOUS_SIGNAL_SECRET (base64url) and NERVOUS_SECRET_ID (8-char hex)
 * in the service's environment. Returns the secret only when the incoming
 * service name and secret ID match.
 *
 * Usage:
 *   import { createEnvSecretLookup } from '@temple/nervous-client';
 *   mountReceiver(app, express, {
 *     secretLookup: createEnvSecretLookup(),
 *     // permitUnsigned defaults to false — strict mode
 *   });
 */
export declare function createEnvSecretLookup(expectedService?: string): SecretLookup;
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
export declare function mountReceiver(app: any, expressModule: any, options: MountReceiverOptions): void;
/**
 * Compute the 8-char lowercase hex secret ID from a base64url secret.
 * Matches Python's compute_secret_id and Rust's compute_secret_id.
 */
export declare function computeSecretId(secretBase64url: string): string;
/** Encode raw secret bytes as base64url (no padding). */
export declare function encodeSecret(secretBytes: Buffer): string;
/** Decode a base64url secret to raw bytes. */
export declare function decodeSecret(secretBase64url: string): Buffer;
//# sourceMappingURL=index.d.ts.map