/**
 * HesedModidah — the measurement of hesed (loving-kindness as readiness).
 *
 * Hesed (חסד) is READINESS, not worthiness. A spark may be eloquent but not
 * ready. A spark may be incoherent but very ready. We score on whether the
 * pilgrim seems in contact with their own question.
 *
 * Three pass types:
 *   light  — Spark is honest but not yet ripe. Blessing-and-release;
 *            this becomes a Nechamah shape when formed into a Berakhah.
 *   deep   — Spark is in contact. The Pillars and Amata are called.
 *   defer  — Shabbat Hold. The spark is held; billing is not charged;
 *            return is promised.
 *
 * Each decision is recorded with score, threshold, history summary (if any),
 * and the model's reason. A pilgrim who feels misjudged can be re-met by a
 * human who reads the decision and the MahShomeim together.
 */

import { ContextProfile } from '../context/ContextProfiles';
import { chatJson, BifrostError } from '../utils/bifrostClient';
import type { MahShomeim, HesedDecision, PassType } from '../types';
import { Pool } from 'pg';

interface HesedJudgement {
  score: number;
  reason: string;
}

const HESED_SYSTEM_PROMPT = `You score a pilgrim's readiness to receive the kind of meeting their threshold offers.

Hesed is READINESS, not worthiness. Be generous. The pilgrim does not need to be polished, articulate, or correct. They need to be IN CONTACT with their own question.

Signs of contact (raise the score):
- They name what they are bringing, not what someone else thinks they should bring.
- They name a tension, uncertainty, or unresolved feeling. (People in contact know they don't have full answers.)
- The "avoided" field of the presence reading is small or absent — they are not dancing around the wound.
- The "meant" is close to the "said" — they say what they mean.
- They show awareness of what they are assuming or standing on.

Signs of low contact (lower the score):
- Performance: phrases that sound like business-school templates rather than a real question.
- Avoidance: the spark talks around the actual concern.
- Disconnection: "what do you think I should do" without naming what they want to do.
- Generic abstractions with no concrete specifics.
- Asking for analysis, validation, or a verdict rather than a meeting.

DO NOT score on:
- Eloquence, polish, fluency
- Whether the idea is good
- Whether the question is "smart"
- Whether you agree with the pilgrim

Return ONLY JSON: {"score": 0.0-1.0, "reason": "short explanation grounded in the spark and reading"}`;

/**
 * mod_et_hahesed — measure the hesed (readiness) of this moment.
 *
 * Throws BifrostError on unreachable gateway or invalid model response.
 * Azen does not fabricate scores.
 */
export async function mod_et_hahesed(
  nitzotz: {
    id: string;
    haOr: string;
    context: string;
    pilgrimId: string;
  },
  mahShomeim: MahShomeim,
  profile: ContextProfile,
  pool: Pool,
  options: { historySummary?: string | null } = {},
): Promise<HesedDecision> {
  const historySummary = options.historySummary ?? null;

  const userMessage = [
    `Threshold: ${profile.context}`,
    `Threshold's hesed bar (purely informational; do not match the score to it): ${profile.hesedThreshold}`,
    '',
    'Pilgrim\'s spark (their words):',
    `"${nitzotz.haOr}"`,
    '',
    'Presence reading of the spark:',
    `  said: ${mahShomeim.said}`,
    `  meant: ${mahShomeim.meant}`,
    `  implied: ${mahShomeim.implied}`,
    `  avoided: ${mahShomeim.avoided}`,
    `  assumed: ${mahShomeim.assumed}`,
    historySummary ? `\nPrior visits summary: ${historySummary}` : '\nNo prior visits.',
    '',
    'Score this pilgrim\'s readiness (hesed) for THIS threshold. Be generous and honest.',
  ].join('\n');

  let judgement: HesedJudgement;
  try {
    judgement = await chatJson<HesedJudgement>(
      [
        { role: 'system', content: HESED_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.2,
        maxTokens: 200,
        timeoutMs: 25_000,
      },
    );
  } catch (err) {
    if (err instanceof BifrostError) {
      throw new BifrostError(`HesedModidah: ${err.message}`, err.statusCode, err.bodySnippet);
    }
    throw err;
  }

  // Validate the score
  if (typeof judgement.score !== 'number' || judgement.score < 0 || judgement.score > 1) {
    throw new BifrostError(
      `HesedModidah: model returned invalid score: ${judgement.score}`,
    );
  }
  if (typeof judgement.reason !== 'string' || judgement.reason.length === 0) {
    throw new BifrostError('HesedModidah: model returned empty reason');
  }

  // Decide pass type. Shabbat defer is not yet enforced in Implantation phase;
  // when SabbathGate arrives, it may override with 'defer'.
  const passType: PassType = judgement.score >= profile.hesedThreshold ? 'deep' : 'light';

  const decision: HesedDecision = {
    currentScore: judgement.score,
    thresholdForContext: profile.hesedThreshold,
    passType,
    historySummary,
    reason: judgement.reason,
  };

  await pool.query(
    `INSERT INTO azen_hesed_decisions
       (spark_id, current_score, threshold_for_context, pass_type, history_summary, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      nitzotz.id,
      decision.currentScore,
      decision.thresholdForContext,
      decision.passType,
      decision.historySummary,
      decision.reason,
    ],
  );

  return decision;
}
