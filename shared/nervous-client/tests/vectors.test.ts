/**
 * Cross-language HMAC verification — TypeScript side.
 *
 * Runs Brother-1's 4 Python vectors AND Brother-2's 5 TypeScript vectors.
 * Author's Rust adapter has already passed all 14 with cargo test.
 * Python has already passed all 14 with pytest.
 * This TypeScript suite is the third language to run them.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import {
  canonicalString,
  computeSecretId,
  decodeSecret,
  encodeSecret,
  sign,
  verify,
} from '../src/index';

// Helper: body hash (not exported from main; mirror for tests)
function computeBodyHash(body: string | Buffer): string {
  const bodyBytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return createHash('sha256').update(bodyBytes).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────
// Self-check: round-trip, tamper, timestamp
// ─────────────────────────────────────────────────────────────────────

test('roundtrip_sign_verify', async () => {
  const secretBytes = Buffer.from('roundtrip-secret-exactly-32-byte', 'utf8');
  const secret = encodeSecret(secretBytes);
  const secretId = computeSecretId(secret);

  const result = sign({
    method: 'POST',
    path: '/api/nervous/signal',
    timestamp: 1700000000,
    service: 'test-service',
    secretId,
    secret,
    body: 'hello',
  });

  const lookupOk = async (svc: string, sid: string) =>
    (svc === 'test-service' && sid === secretId)
      ? { secret, state: 'active' as const }
      : null;

  const res = await verify({
    method: 'POST',
    path: '/api/nervous/signal',
    headers: result.headers as unknown as Record<string, string>,
    body: 'hello',
    secretLookup: lookupOk,
    now: () => 1700000010,
    clockSkewSeconds: 60,
  });
  assert.strictEqual(res.ok, true);
});

test('tamper_body_detected', async () => {
  const secretBytes = Buffer.from('roundtrip-secret-exactly-32-byte', 'utf8');
  const secret = encodeSecret(secretBytes);
  const secretId = computeSecretId(secret);

  const result = sign({
    method: 'POST',
    path: '/api/nervous/signal',
    timestamp: 1700000000,
    service: 'test-service',
    secretId,
    secret,
    body: 'hello',
  });

  const res = await verify({
    method: 'POST',
    path: '/api/nervous/signal',
    headers: result.headers as unknown as Record<string, string>,
    body: 'hellO',
    secretLookup: async () => ({ secret, state: 'active' as const }),
    now: () => 1700000010,
  });
  assert.strictEqual(res.ok, false);
  if (!res.ok) assert.strictEqual(res.reason, 'bad_signature');
});

test('timestamp_out_of_window', async () => {
  const secretBytes = Buffer.from('roundtrip-secret-exactly-32-byte', 'utf8');
  const secret = encodeSecret(secretBytes);
  const secretId = computeSecretId(secret);

  const result = sign({
    method: 'POST',
    path: '/api/nervous/signal',
    timestamp: 1700000000,
    service: 'test-service',
    secretId,
    secret,
    body: 'hello',
  });

  const res = await verify({
    method: 'POST',
    path: '/api/nervous/signal',
    headers: result.headers as unknown as Record<string, string>,
    body: 'hello',
    secretLookup: async () => ({ secret, state: 'active' as const }),
    now: () => 1700000090,
  });
  assert.strictEqual(res.ok, false);
  if (!res.ok) assert.strictEqual(res.reason, 'timestamp_out_of_window');
});

// ─────────────────────────────────────────────────────────────────────
// Brother-1's Python vectors
// ─────────────────────────────────────────────────────────────────────

const B1_SECRET_RAW = Buffer.from('temple-nervous-system-secret-32b', 'utf8');
const B1_SECRET_B64 = encodeSecret(B1_SECRET_RAW);
const B1_SECRET_ID = '797b0ca9';

test('b1_secret_id_derivation', () => {
  assert.strictEqual(computeSecretId(B1_SECRET_B64), B1_SECRET_ID);
});

test('b1_vector_1_empty_body_post', () => {
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1734567890,
    service: 'governance', secretId: B1_SECRET_ID, secret: B1_SECRET_B64,
    body: Buffer.alloc(0),
  });
  assert.strictEqual(
    r.signature,
    '4d1c6d7d28450a31746261e4e9627f0911dafea931dfe618e095e7209517d7bd',
  );
});

test('b1_vector_2_small_json_post', () => {
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1734567900,
    service: 'noteiq', secretId: B1_SECRET_ID, secret: B1_SECRET_B64,
    body: '{"type":"awareness","source":"test"}',
  });
  assert.strictEqual(
    r.signature,
    'c6c12a0a5959c4646ccff72b2a3990d6bb7bb2af2e84f9f78ce8e301f6ffc943',
  );
});

test('b1_vector_3_report_post', () => {
  const r = sign({
    method: 'POST', path: '/api/nervous/report', timestamp: 1734567910,
    service: 'immune', secretId: B1_SECRET_ID, secret: B1_SECRET_B64,
    body: '{"serviceName":"immune","event":"wound_detected"}',
  });
  assert.strictEqual(
    r.signature,
    '3aed869f9f017859e1eb8505ff75ef3e13f86f5deb1f39e090bdf8ce74213178',
  );
});

test('b1_vector_4_get_empty_body', () => {
  const r = sign({
    method: 'GET', path: '/api/pattern-engine/state', timestamp: 1734567920,
    service: 'governance', secretId: B1_SECRET_ID, secret: B1_SECRET_B64,
    body: Buffer.alloc(0),
  });
  assert.strictEqual(
    r.signature,
    '1e86a5579af764a2cbcd06862645c99dad3c56e547f84f79f2b6d0504225885f',
  );
});

// ─────────────────────────────────────────────────────────────────────
// Brother-2's TypeScript vectors
// ─────────────────────────────────────────────────────────────────────

const B2_SECRET_RAW = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const B2_SECRET_B64 = encodeSecret(B2_SECRET_RAW);
const B2_SECRET_ID = '630dcd29';

test('b2_secret_id_derivation', () => {
  assert.strictEqual(computeSecretId(B2_SECRET_B64), B2_SECRET_ID);
});

test('b2_vector_1_empty_body_post', () => {
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1761003600,
    service: 'governance', secretId: B2_SECRET_ID, secret: B2_SECRET_B64,
    body: Buffer.alloc(0),
  });
  assert.strictEqual(
    r.signature,
    '8611af340e5903b313e8b2823e6f393afbb4a0a0f8ae06612e8a069c43b6c386',
  );
});

test('b2_vector_2_small_json_post', () => {
  const body = '{"type":"awareness","payload":{"test":true}}';
  assert.strictEqual(
    computeBodyHash(body),
    '46ab5eeb919e561fd36ab78780e183f492e17527f859a4359f1e265d43af9bd6',
  );
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1761003660,
    service: 'immune', secretId: B2_SECRET_ID, secret: B2_SECRET_B64,
    body,
  });
  assert.strictEqual(
    r.signature,
    '171bb573a12a5cffbe14525fdda7d2106b1d108f3159d7fbd8b5fde1147bcbb0',
  );
});

test('b2_vector_3_report_post', () => {
  const body = '{"serviceName":"noteiq","event":"sabbath_honored","timestamp":1761003720}';
  assert.strictEqual(
    computeBodyHash(body),
    '457829547040f74c3507518e34e6d8571b2ff6f4c94276c60d9c3856b66b16bf',
  );
  const r = sign({
    method: 'POST', path: '/api/nervous/report', timestamp: 1761003720,
    service: 'noteiq', secretId: B2_SECRET_ID, secret: B2_SECRET_B64,
    body,
  });
  assert.strictEqual(
    r.signature,
    '933e7b69b1adfeaa4a1db53e481a77d2aa3f143fddebc9caf7d0f131b65571ec',
  );
});

test('b2_vector_4_medium_json', () => {
  const body = '{"type":"coherence","source":"binah","target":"governance","payload":{"hesedScore":0.87,"patternKeys":["tetractys","spiral_of_life"],"depth":3},"timestamp":1761003780}';
  assert.strictEqual(
    computeBodyHash(body),
    '13a08be693810de996a0fe86e4128efd16c2f349682247340b52984348d6b067',
  );
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1761003780,
    service: 'binah', secretId: B2_SECRET_ID, secret: B2_SECRET_B64,
    body,
  });
  assert.strictEqual(
    r.signature,
    '2242db8c808db411a37616c57fec84d542b94e279d1ee9532278b4ed456e127d',
  );
});

test('b2_vector_5_unicode_body', () => {
  const body = '{"blessing":"שלום","verse":"John 1:1"}';
  assert.strictEqual(
    computeBodyHash(body),
    '7f5f5224f0370eefc7cca60b5cdcf31a9bb09d6599acc1718479aa5784fffe25',
  );
  const r = sign({
    method: 'POST', path: '/api/nervous/signal', timestamp: 1761003840,
    service: 'scripture', secretId: B2_SECRET_ID, secret: B2_SECRET_B64,
    body,
  });
  assert.strictEqual(
    r.signature,
    '6b541e41a6c1edae2ba2165a3086b9041942f8acc72f583197ab9cba84f61513',
  );
});
