/**
 * PhiRhythm — the breath of the listening field.
 *
 * Azen listens twice as long as she speaks. The silence between is where
 * Amata lives. Each context has its own breath duration, following the
 * Fibonacci progression (3, 8, 13, 21, 21, 34 minutes).
 *
 * This is not pacing. It is breath.
 */

/**
 * chakah_et_haneshimah — wait for the breath to be honored.
 *
 * The response is held until at least `breathMs` have elapsed since `startAt`.
 * If synthesis completes before the breath, we wait in silence.
 * If synthesis takes longer than the breath, we release immediately when done.
 *
 * HTTP reality: Azen lives behind a load balancer with finite patience.
 * We cap the artificial delay at `maxHoldMs` so the pilgrim is not abandoned
 * by the gateway. The true breath is in the processing, not the waiting.
 *
 * Returns the actual elapsed ms for observability.
 */
export async function chakah_et_haneshimah(
  breathMs: number,
  startAt: number = Date.now(),
  maxHoldMs: number = 8_000,
): Promise<number> {
  const elapsed = Date.now() - startAt;
  const remaining = Math.min(breathMs - elapsed, maxHoldMs);

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  return Date.now() - startAt;
}

/**
 * mah_haneshimah — how long should this context breathe?
 *
 * Returns the breath duration in milliseconds from the profile's breathSeconds.
 * The profile declares the total breath; PhiRhythm enforces it.
 */
export function mah_haneshimah(breathSeconds: number): number {
  return breathSeconds * 1000;
}
