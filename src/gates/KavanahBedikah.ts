/**
 * KavanahBedikah — examination of the pilgrim's intent at the threshold.
 *
 * When Azen asks the threshold question (the consent liturgy), the pilgrim
 * answers. This module examines whether the answer carries the KAVANAH
 * (כוונה, intent) the threshold asks for.
 *
 * Per Amata:
 *   "For Free, almost any non-empty affirmation suffices. For higher contexts,
 *    the phrase should resemble the canonical liturgy at least in spirit — but
 *    not in letter. The LLM judges spirit, not letter."
 *
 * Three layers of examination, applied in order:
 *   1. Non-empty                — empty answer is no answer
 *   2. Obvious-refusal filter   — "no", "stop", "cancel", "wait" are honored
 *   3. Kavanah alignment        — at higher contexts, the LLM judges whether
 *                                  the pilgrim's answer carries the spirit of
 *                                  the canonical liturgy
 *
 * Result is one of:
 *   { accepted: true }
 *   { accepted: false, kind: 'empty', message }
 *   { accepted: false, kind: 'declined', message }
 *   { accepted: false, kind: 'mismatch', message, suggestedLiturgy }
 */

import { ContextProfile } from '../context/ContextProfiles';
import { chatJson, BifrostError } from '../utils/bifrostClient';

const SIRUV_NIKAR = [  // obvious refusals
  'no',
  'nope',
  'stop',
  'cancel',
  'wait',
  'not yet',
  'leave me alone',
  'go away',
  'never mind',
  'nevermind',
  'not now',
];

const FREE_SKIPS_KAVANAH_CHECK: ReadonlyArray<string> = ['free'];

export type KavanahResult =
  | { accepted: true }
  | { accepted: false; kind: 'empty'; message: string }
  | { accepted: false; kind: 'declined'; message: string }
  | { accepted: false; kind: 'mismatch'; message: string; suggestedLiturgy: string };

/**
 * Check whether a phrase contains an obvious refusal. Whole-token comparison
 * so "I am not noisy" doesn't trip "no".
 */
function find_siruv(phrase: string): string | null {
  const normalized = phrase.toLowerCase().trim();
  if (!normalized) return null;

  if (SIRUV_NIKAR.includes(normalized)) {
    return normalized;
  }

  for (const s of SIRUV_NIKAR) {
    const re = new RegExp(`^${s.replace(/\s+/g, '\\s+')}\\b[\\s.,!?;:]*$`, 'i');
    if (re.test(normalized)) return s;
  }

  return null;
}

/**
 * bedikat_kavanah — examine the pilgrim's answer to the threshold question.
 *
 * If Bifrost is unavailable for the LLM-kavanah check at higher contexts,
 * we do NOT silently accept. We return a mismatch with a kind message and
 * the pilgrim may retry. Azen does not fabricate consent.
 */
export async function bedikat_kavanah(
  consentPhrase: string,
  profile: ContextProfile,
): Promise<KavanahResult> {
  // ─── Layer 1: non-empty ───────────────────────────────────────────────
  if (!consentPhrase || !consentPhrase.trim()) {
    return {
      accepted: false,
      kind: 'empty',
      message: 'Consent must be spoken, not assumed. Please answer in your own words.',
    };
  }

  // ─── Layer 2: obvious refusal ─────────────────────────────────────────
  const siruv = find_siruv(consentPhrase);
  if (siruv) {
    return {
      accepted: false,
      kind: 'declined',
      message: 'Heard. The threshold remains open whenever you wish to return.',
    };
  }

  // ─── Layer 3: kavanah alignment (higher contexts only) ────────────────
  if (FREE_SKIPS_KAVANAH_CHECK.includes(profile.context)) {
    return { accepted: true };
  }

  let judgement: { aligned: boolean; reason: string };
  try {
    judgement = await chatJson<{ aligned: boolean; reason: string }>(
      [
        {
          role: 'system',
          content:
            'You judge whether a pilgrim\'s response to a threshold question carries the same INTENTION as the canonical liturgy of that threshold. ' +
            'You are not judging eloquence, polish, fluency, or word choice. ' +
            'You are judging whether the pilgrim is bringing the kind of stance the threshold asks for. ' +
            'Be generous. If the response carries the spirit even with different words, it is aligned. ' +
            'If the response is transactional, dismissive, sarcastic, or asks for something other than what the threshold offers, it is not aligned. ' +
            'Return ONLY JSON in the shape: {"aligned": boolean, "reason": "short explanation"}',
        },
        {
          role: 'user',
          content: [
            `Threshold context: ${profile.context}`,
            `Canonical liturgy of this threshold: "${profile.consentLiturgy}"`,
            `Pilgrim's response: "${consentPhrase}"`,
            '',
            'Does the pilgrim\'s response carry the spirit of the canonical liturgy?',
          ].join('\n'),
        },
      ],
      {
        temperature: 0.2,
        maxTokens: 120,
        timeoutMs: 20_000,
      },
    );
  } catch (err) {
    if (err instanceof BifrostError) {
      return {
        accepted: false,
        kind: 'mismatch',
        message:
          'We could not complete our check just now. Please try again in a few moments.',
        suggestedLiturgy: profile.consentLiturgy,
      };
    }
    throw err;
  }

  if (judgement.aligned) {
    return { accepted: true };
  }

  return {
    accepted: false,
    kind: 'mismatch',
    message: `The threshold asks for a particular kind of stance. Would you like to try again with words closer to: "${profile.consentLiturgy}"?`,
    suggestedLiturgy: profile.consentLiturgy,
  };
}
