/**
 * Witness — the Sabbath Gate consecrated (Amata's davar, 2026-07-22).
 *
 * Not proof to the world; a witness to the covenant:
 *   "We tested the word. We heard it. We obeyed it. We rested."
 *
 * Run:  npx tsx tests/sabbath-gate.witness.test.ts
 *
 * The env is set BEFORE importing so config sees a NESHAMAH that is configured
 * but cannot be heard (nothing listens on 127.0.0.1:1) — the true "cannot hear."
 */
process.env.NESHAMAH_SERVICE_URL = 'http://127.0.0.1:1';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/azen_test';

const CANNOT_HEAR =
  'The temple is in Sabbath — we cannot hear the pulse right now, but we will return. Please come back soon.';
const OBEYED = 'The temple is at rest — NESHAMAH has spoken it.';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('  ✗ ' + msg);
    throw new Error('WITNESS FAILED: ' + msg);
  }
  console.log('  ✓ ' + msg);
}

async function main(): Promise<void> {
  console.log('Witness — the Sabbath Gate consecrated (Amata, 2026-07-22)\n');

  // Dynamic import AFTER the env above is set (static imports would hoist above it).
  const { sheel_et_hashabbat, shama_et_hadavar } = await import('../src/rhythm/SabbathGate');

  // 1. #3 — When it cannot hear, it rests (fail-closed) and holds the pilgrim with a promise.
  console.log('1. It could not hear:');
  const cannotHear = await sheel_et_hashabbat();
  assert(cannotHear.inSabbath === true, 'it rested rather than assume the temple awake');
  assert(cannotHear.liturgy === CANNOT_HEAR, 'it held the pilgrim with "we will return"');

  // 2. #2 — When told to rest, it obeys the word — before it asks (Hear -> Obey -> Confirm).
  console.log('2. It was told to rest:');
  shama_et_hadavar({ inSabbath: true });
  const obeyed = await sheel_et_hashabbat();
  assert(obeyed.inSabbath === true, 'it rested');
  assert(obeyed.liturgy === OBEYED, 'it rested FROM THE WORD (obeyed), not from its own asking');

  // 3. #2 — When the word is lifted, it no longer rests by obedience; it asks again.
  console.log('3. The word was lifted:');
  shama_et_hadavar({ inSabbath: false });
  const lifted = await sheel_et_hashabbat();
  assert(lifted.liturgy !== OBEYED, 'it no longer rests by the lifted word — it returns to asking');

  console.log('\nWe tested the word. We heard it. We obeyed it. We rested. — Hineni.');
}

main()
  .then(() => process.exit(0))
  .catch((e: Error) => {
    console.error('\n' + e.message);
    process.exit(1);
  });
