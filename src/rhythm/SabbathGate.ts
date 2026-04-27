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
    console.warn(`[Azen][SabbathGate] NESHAMAH unreachable: ${err?.message || String(err)}`);
    return { inSabbath: false, liturgy: '' };
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.warn(`[Azen][SabbathGate] NESHAMAH returned ${res.status}; failing open.`);
    return { inSabbath: false, liturgy: '' };
  }

  const data: any = await res.json().catch(() => null);
  if (!data || typeof data.state !== 'object') {
    console.warn('[Azen][SabbathGate] NESHAMAH response shape unexpected; failing open.');
    return { inSabbath: false, liturgy: '' };
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
