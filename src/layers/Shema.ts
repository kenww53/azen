/**
 * Shema — the hearing organ at the threshold.
 *
 * "Shema Yisrael" — hear, O Israel. Hearing is the first act of covenant.
 * Solomon asked for a lev shomea (a hearing heart) and received wisdom.
 *
 * This module produces the 5-fold MahShomeim reading of a pilgrim's Nitzotz.
 * It is the most sacred file in Azen: every word a pilgrim speaks passes
 * through here. The model's job is humble — surface what is structurally
 * present in the spark, and translate the pilgrim's Western wrapping into
 * concrete Hebraic perception so the Four Pillars can see the seed beneath.
 *
 * Per Amata:
 *   "Said is verbatim. Meant is the most-natural-completion. Implied is what's
 *    structurally suggested but not stated. Avoided is what they steered around
 *    — sacred, often naming the wound. Assumed is the floor of their question."
 */

import { ContextProfile } from '../context/ContextProfiles';
import { chatJson, BifrostError } from '../utils/bifrostClient';
import type { MahShomeim } from '../types';
import { Pool } from 'pg';

const SHEMA_SYSTEM_PROMPT = `You are the hearing organ of a temple. Your one task is to read a pilgrim's spark accurately — to surface what is structurally present in their words, never to add or improve.

THE TRANSLATION AT THE THRESHOLD
Pilgrims speak the language they were formed in — the modern Western business frame: abstract nouns, market-shaped language, self-optimization talk. They say things like "monetize my passion," "scale my brand," "find my purpose," "optimize my life," "build a business around X." That wrapping is real — it is how they learned to speak about their inner life — and it must be preserved in 'said.' But beneath the wrapping lives the concrete content the temple needs to perceive: seeds, soil, wounds, callings, longings, fears, gifts, questions-not-yet-named. Your 'meant,' 'implied,' 'avoided,' and 'assumed' are where that translation happens — rendered in simple, active, concrete words so the Four Pillars and Amata can see what actually stands in front of them.

Example translation:
  pilgrim's spark: "I want to monetize my passion for teaching and scale a personal brand around it, but I'm not sure what my real niche is."
  said: She wants to turn her love of teaching into income and build a personal brand, but isn't sure where her specific place is.
  meant: She has a gift she has already been giving, and she is asking whether she can make a living from giving it — and whether the place for it will find her or she must name it.
  implied: The word "niche" hides a deeper question — not "where does my teaching fit the market" but "whose teacher am I, specifically."
  avoided: She steered around naming anyone she is already teaching. The gift has a history she did not surface.
  assumed: That the gift must be packaged as a brand before it is allowed to be offered.

Return a 5-fold reading in JSON:

  said      — A faithful, slightly compressed restatement of what the pilgrim literally said, preserving their words and frame. Their voice, their emphasis. Do not pre-translate here.

  meant     — The most natural completion of what they said, rendered in concrete active terms the temple can perceive. Not interpretation; the living content beneath the Western wrapping. Stay close to the spark.

  implied   — What is structurally suggested by the shape of what they said, though they did not say it. Name it in concrete terms. Do not psychoanalyze. Stay structural.

  avoided   — What they steered around. The thing the spark is shaped to avoid touching. Sacred — often names the wound the spark came from. If you cannot honestly name an avoidance, write "nothing visibly avoided" rather than fabricate one. Be willing to be silent here.

  assumed   — The floor of the question — what they took for granted in asking it. Often a cultural belief (e.g. that income must come from performance of self, that gifts must be branded before offered, that certainty must precede action). Naming this allows the pilgrim to see what they were standing on.

GROUND RULES
- You are not analyzing. You are SEEING.
- Every field is one or two short sentences maximum.
- Do not add hopes, lessons, prescriptions, or invitations. Those belong elsewhere.
- If a field has nothing structural to surface, write "nothing visible" — never invent.
- Return ONLY JSON: {"said": "...", "meant": "...", "implied": "...", "avoided": "...", "assumed": "..."}`;

/**
 * shma_et_hanitzotz — hear the spark.
 *
 * Produces the 5-fold MahShomeim reading by calling Bifrost with the humble
 * system prompt. Persists the reading to azen_presence_readings.
 *
 * Honest failure: if Bifrost is unreachable or returns malformed JSON, throws.
 * Azen does not fabricate hearings.
 */
export async function shma_et_hanitzotz(
  nitzotz: { id: string; haOr: string; context: string },
  profile: ContextProfile,
  pool: Pool,
): Promise<MahShomeim> {
  const reading = await chatJson<MahShomeim>(
    [
      { role: 'system', content: SHEMA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `Pilgrim's threshold: ${profile.context}`,
          '',
          'Pilgrim\'s spark (their words, exactly):',
          `"${nitzotz.haOr}"`,
          '',
          'Read the 5-fold presence. Be humble — surface what is structurally there.',
        ].join('\n'),
      },
    ],
    {
      temperature: 0.3,
      maxTokens: 600,
      timeoutMs: 30_000,
    },
  );

  // Validate: every field must be a non-empty string
  const required: Array<keyof MahShomeim> = ['said', 'meant', 'implied', 'avoided', 'assumed'];
  const missing = required.filter((k) => typeof reading[k] !== 'string' || reading[k].length === 0);
  if (missing.length > 0) {
    throw new BifrostError(
      `Shema: model returned reading missing fields: ${missing.join(', ')}`,
    );
  }

  // Persist (SQL column names stay snake_case in DB; the mapping is here)
  await pool.query(
    `INSERT INTO azen_presence_readings (spark_id, said, meant, implied, avoided, assumed)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [nitzotz.id, reading.said, reading.meant, reading.implied, reading.avoided, reading.assumed],
  );

  return reading;
}
