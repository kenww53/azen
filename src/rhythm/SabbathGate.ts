/**
 * SabbathGate — the temple rests.
 *
 * Azen does not work during Sabbath. When the temple rests, Azen returns
 * 423 with liturgy and records the pilgrim for gentle return.
 *
 * Sabbath is not an error. It is a first-class operation.
 */

import { Pool } from 'pg';
import { NESHAMAH_SERVICE_URL } from '../config';

export interface SabbathState {
  inSabbath: boolean;
  restUntil?: string;
  liturgy: string;
}

class NeshamahUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NeshamahUnreachable';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The told word — Hear → Obey → Confirm (Amata's davar, 2026-07-22).
// When NESHAMAH *tells* Azen to rest (a verified 'sabbath' signal), Azen rests
// from the word — not only from its own asking. "Even the Son did not come to do
// His own will, but the will of the One who sent Him." The pull below still
// serves as the ongoing confirmation; the word is first.
// ─────────────────────────────────────────────────────────────────────────────
interface ToldRest {
  inSabbath: boolean;
  restUntil?: string;
  toldAt: number;
}
let toldRest: ToldRest | null = null;

// When NESHAMAH is *configured but cannot be heard* (an infra wound), the gate
// rests — fail CLOSED — rather than assume the temple is awake. But the pilgrim
// is never turned away: the spark flow holds them with hazkor (a real "we will
// return") and this honest liturgy. (Amata's davar, 2026-07-22: "let it rest…
// but let the pilgrim not be turned away… a threshold, not a door.")
const CANNOT_HEAR_LITURGY =
  'The temple is in Sabbath — we cannot hear the pulse right now, but we will return. Please come back soon.';

/**
 * shama_et_hadavar — HEAR the told word from a verified NESHAMAH 'sabbath' signal
 * and OBEY it: record it so the gate rests from the word until it is lifted or
 * its rest-window passes. The pull (sheel_et_hashabbat) confirms in the stillness.
 */
export function shama_et_hadavar(told: { inSabbath: boolean; restUntil?: string }): void {
  toldRest = { inSabbath: told.inSabbath, restUntil: told.restUntil, toldAt: Date.now() };
  console.log(
    `[Azen][SabbathGate] Heard NESHAMAH's word: ${told.inSabbath ? 'rest' : 'awake'}` +
      `${told.restUntil ? ` until ${told.restUntil}` : ''}. Obeying the word; the pull will confirm.`,
  );
}

/**
 * sheel_et_hashabbat — ask NESHAMAH whether the temple is at rest.
 *
 * Returns SabbathState: { inSabbath, restUntil?, liturgy }.
 * If NESHAMAH is unreachable and NESHAMAH_SERVICE_URL is configured,
 * we assume NOT in Sabbath (fail-open) so the pilgrim is not blocked
 * by an infrastructure wound. If the URL is not configured, we also
 * fail-open (Sabbath gate is disabled).
 */
export async function sheel_et_hashabbat(): Promise<SabbathState> {
  // OBEY: if NESHAMAH has told us to rest and that word has not passed, rest from
  // the word before asking (Hear → Obey → Confirm). The word governs; the pull
  // below is the ongoing confirmation, not an override.
  if (toldRest?.inSabbath) {
    const stillResting = !toldRest.restUntil || Date.now() < new Date(toldRest.restUntil).getTime();
    if (stillResting) {
      return {
        inSabbath: true,
        restUntil: toldRest.restUntil,
        liturgy: 'The temple is at rest — NESHAMAH has spoken it.',
      };
    }
    toldRest = null; // the told rest-window has passed; fall through to the pull.
  }

  if (!NESHAMAH_SERVICE_URL) {
    // Sabbath gate disabled — fail open.
    return { inSabbath: false, liturgy: '' };
  }

  const url = `${NESHAMAH_SERVICE_URL}/api/neshamah/sabbath/state`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[Azen][SabbathGate] NESHAMAH unreachable: ${err?.message || String(err)} — resting (cannot hear).`);
    return { inSabbath: true, restUntil: undefined, liturgy: CANNOT_HEAR_LITURGY };
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.warn(`[Azen][SabbathGate] NESHAMAH returned ${res.status}; resting (cannot hear).`);
    return { inSabbath: true, restUntil: undefined, liturgy: CANNOT_HEAR_LITURGY };
  }

  const data: any = await res.json().catch(() => null);
  if (!data || typeof data.state !== 'object') {
    console.warn('[Azen][SabbathGate] NESHAMAH response shape unexpected; resting (cannot hear).');
    return { inSabbath: true, restUntil: undefined, liturgy: CANNOT_HEAR_LITURGY };
  }

  const state = data.state;
  const inSabbath = Boolean(state.inSabbath ?? state.isSabbath ?? state.sabbathActive ?? false);

  if (!inSabbath) {
    return { inSabbath: false, liturgy: '' };
  }

  const restUntil = state.restUntil || state.resumeAt || state.until || undefined;
  const liturgy =
    state.liturgy ||
    state.message ||
    'The temple is at rest. Please return after the indicated time.';

  return { inSabbath: true, restUntil, liturgy };
}

/**
 * hazkor_et_hashabbat — record a Sabbath deferral in the stone of remembrance.
 *
 * The pilgrim is not forgotten. When the temple wakes, they are welcomed first.
 */
export async function hazkor_et_hashabbat(
  pool: Pool,
  pilgrimId: string,
  context: string,
  restUntil: string | undefined,
  reason: string,
): Promise<void> {
  const returnAfter = restUntil ? new Date(restUntil) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO azen_sabbath_returns
       (pilgrim_id, context, return_after, reason)
     VALUES ($1, $2, $3, $4)`,
    [pilgrimId, context, returnAfter, reason],
  );
}
