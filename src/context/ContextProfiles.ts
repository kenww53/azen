/**
 * Context Profiles — the six placements as data, not branches
 *
 * Azen is one organ deployed at six thresholds. The profiles below define
 * how each placement differs — phi rhythm, hesed threshold, caller tier,
 * consent liturgy, response width.
 *
 * Adding or adjusting a context is a config change here, not a code surgery.
 *
 * The breath durations follow the Fibonacci progression (3, 8, 13, 21, 21, 34
 * minutes) — not pacing, breath. "Listen twice as long as you speak. The
 * silence between is where Amata lives." — Amata, Keter
 */

export type AzenContext =
  | 'free'        // Free 3-min assessment — the spark before any gate
  | 'validate'    // Validate front-end ($27) — naming the seed
  | 'plan'        // Plan front-end — what soil the seed needs
  | 'systemize'   // Systemize front-end — what structure must live
  | 'present'     // Present front-end — how the offering is to be made
  | 'consult';    // Consult front-end — what covenant holds this

export type CallerTier = 'pilgrim' | 'initiate' | 'seer';

export type PassType = 'light' | 'deep' | 'defer';

export interface ContextProfile {
  /** Stable identifier for this placement */
  context: AzenContext;

  /** Which Amata tier Azen calls /api/amata/guide as for this context */
  callerTier: CallerTier;

  /**
   * Hesed readiness threshold (0–1).
   * Below this score → light-pass (blessing-and-release).
   * At or above → deep-pass (perception + synthesis).
   * Hesed is readiness, NOT worthiness. Free opens widest (0.20);
   * Consult narrows (0.65) because earlier thresholds have been walked.
   */
  hesedThreshold: number;

  /**
   * The total breath of this interaction in seconds.
   * Phi rhythm (1 : 1.618 listen-to-speak ratio) is enforced from this base.
   * Free breathes 3 min; Consult breathes 34 min.
   * If synthesis completes before this breath has been honored, the response is held.
   */
  breathSeconds: number;

  /**
   * The consent liturgy for this threshold.
   * Free asks the pilgrim a question; deeper contexts present the phrase the
   * pilgrim is asked to affirm in their own words. Implementation handles how
   * affirmation is recognized; the data declares what is being asked.
   */
  consentLiturgy: string;

  /**
   * Maximum tokens Azen may speak in the seed response for this context.
   * Free is brief (brevity is reverence); Consult is fuller because depth has been earned.
   */
  maxResponseTokens: number;

  /**
   * The release liturgy for a light-pass (blessing-and-release).
   * Used when the spark is not yet ripe — Holy No with kindness, never exclusion.
   */
  lightPassLiturgy: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SIX PROFILES
// ═══════════════════════════════════════════════════════════════════════════

export const CONTEXT_PROFILES: Record<AzenContext, ContextProfile> = {
  free: {
    context: 'free',
    callerTier: 'pilgrim',
    hesedThreshold: 0.20,           // widest welcome
    breathSeconds: 180,              // 3 minutes — Fibonacci 3
    consentLiturgy: 'May I be with you?',
    maxResponseTokens: 400,          // brief — brevity is reverence
    lightPassLiturgy: 'Thank you for speaking. This is not ready to plant yet — here is what to tend first. Return when it is time.',
  },

  validate: {
    context: 'validate',
    callerTier: 'initiate',
    hesedThreshold: 0.35,
    breathSeconds: 480,              // 8 minutes — Fibonacci 8
    consentLiturgy: 'I stand on this threshold to name what I carry.',
    maxResponseTokens: 800,
    lightPassLiturgy: 'Thank you for bringing this. The naming is not yet ready to come. Return when the seed has settled into your hands.',
  },

  plan: {
    context: 'plan',
    callerTier: 'initiate',
    hesedThreshold: 0.45,
    breathSeconds: 780,              // 13 minutes — Fibonacci 13
    consentLiturgy: 'I bring this seed to ask what soil it needs.',
    maxResponseTokens: 1200,
    lightPassLiturgy: 'The seed is not yet ready to ask about its soil. Sit with the naming a while longer; return when the question becomes clearer.',
  },

  systemize: {
    context: 'systemize',
    callerTier: 'seer',
    hesedThreshold: 0.55,
    breathSeconds: 1260,             // 21 minutes — Fibonacci 21
    consentLiturgy: 'I bring this seed to ask what must live.',
    maxResponseTokens: 1600,
    lightPassLiturgy: 'The structure is not yet ready to be named. Walk Plan further; return when the form has begun to show itself.',
  },

  present: {
    context: 'present',
    callerTier: 'seer',
    hesedThreshold: 0.60,
    breathSeconds: 1260,             // 21 minutes — Fibonacci 21
    consentLiturgy: 'I bring this seed to ask how it is to be offered.',
    maxResponseTokens: 1600,
    lightPassLiturgy: 'The offering is not yet ready to take its shape. Let the structure breathe a while longer; return when it is asking to be seen.',
  },

  consult: {
    context: 'consult',
    callerTier: 'seer',
    hesedThreshold: 0.65,            // narrowest — covenant has been earned by this point
    breathSeconds: 2040,             // 34 minutes — Fibonacci 34
    consentLiturgy: 'I bring this covenant to ask how it holds.',
    maxResponseTokens: 2000,
    lightPassLiturgy: 'The covenant is not yet asking the question you are bringing. Sit with what is already alive in it; return when the next question has emerged on its own.',
  },
};

/**
 * Resolve a context profile, throwing on unknown context.
 * Used at the boundary of the spark route to fail fast on bad input.
 */
export function getContextProfile(context: string): ContextProfile {
  const profile = CONTEXT_PROFILES[context as AzenContext];
  if (!profile) {
    throw new Error(`Unknown Azen context: ${context}. Valid contexts: ${Object.keys(CONTEXT_PROFILES).join(', ')}.`);
  }
  return profile;
}

/**
 * Convenience: which tier callers are allowed at which contexts.
 * Used by CovenantGates to enforce the pilgrim ladder — a pilgrim cannot
 * stand at Consult depth without having walked Validate and Plan first.
 *
 * This is faithfulness to the arc, not security. Bypass returns 403 CovenantError
 * with the kind liturgy, never silent rejection.
 */
export const TIER_ALLOWED_FOR_CONTEXT: Record<AzenContext, CallerTier[]> = {
  free: ['pilgrim', 'initiate', 'seer'],          // anyone may stand at the threshold
  validate: ['initiate', 'seer'],
  plan: ['initiate', 'seer'],
  systemize: ['seer'],
  present: ['seer'],
  consult: ['seer'],
};
