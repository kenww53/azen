/**
 * Spark route — the single threshold for all six placements.
 *
 * The liturgical flow at this route (Implantation phase; Quickening and
 * First Breath extend the right side of the flow):
 *
 *   Validate request → covenant gate → bedikat_kavanah (consent)
 *   → zakhor_nitzotz_ba_zikkaron (persist + record visit)
 *   → shma_et_hanitzotz (5-fold hearing)
 *   → mod_et_hahesed (readiness measurement)
 *   → branch on pass type (light / deep / defer)
 *
 * At validate+ contexts, Azen returns Hebraic substrate to the downstream
 * offering service; at free context, Azen is the final edge and translates
 * at the pilgrim-facing boundary.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  getContextProfile,
  TIER_ALLOWED_FOR_CONTEXT,
  AzenContext,
  CallerTier,
} from '../context/ContextProfiles';
import type { SparkRequest, CovenantErrorResponse, LightPassResponse } from '../types';
import { bedikat_kavanah } from '../gates/KavanahBedikah';
import { shma_et_hanitzotz } from '../layers/Shema';
import { mod_et_hahesed } from '../gates/HesedModidah';
import { amudim_ya_idu } from '../layers/AmudimEdut';
import { amata_daber } from '../synthesis/AmataSynthesis';
import { qara_et_hazera } from '../synthesis/Qeriah';
import { berakh_ve_shalach } from '../synthesis/SeedReturn';
import { targem_la_oleh_regel } from '../synthesis/Targem';
import { zakar_et_haoleh } from '../lineage/IdentityRecall';
import { CHRONICLES_URL } from '../config';
import { BifrostError } from '../utils/bifrostClient';
import { sheel_et_hashabbat, hazkor_et_hashabbat } from '../rhythm/SabbathGate';
import { chakah_et_haneshimah, mah_haneshimah } from '../rhythm/PhiRhythm';

const VALID_CONTEXTS: AzenContext[] = ['free', 'validate', 'plan', 'systemize', 'present', 'consult'];
const VALID_TIERS: CallerTier[] = ['pilgrim', 'initiate', 'seer'];

interface ValidationError {
  field: string;
  message: string;
}

function validateSparkRequest(body: unknown): { ok: true; req: SparkRequest } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.context !== 'string' || !VALID_CONTEXTS.includes(b.context as AzenContext)) {
    errors.push({
      field: 'context',
      message: `Must be one of: ${VALID_CONTEXTS.join(', ')}.`,
    });
  }

  if (typeof b.pilgrimId !== 'string' || b.pilgrimId.length === 0) {
    errors.push({ field: 'pilgrimId', message: 'Must be a non-empty string (stable anonymous identifier; never PII).' });
  }

  if (typeof b.soulprint !== 'string' || b.soulprint.trim().length === 0) {
    errors.push({ field: 'soulprint', message: 'Must be the pilgrim\'s offering in their own words.' });
  }

  if (typeof b.consentPhrase !== 'string' || b.consentPhrase.trim().length === 0) {
    errors.push({ field: 'consentPhrase', message: 'Consent must be spoken, not assumed.' });
  }

  if (typeof b.callerTier !== 'string' || !VALID_TIERS.includes(b.callerTier as CallerTier)) {
    errors.push({
      field: 'callerTier',
      message: `Must be one of: ${VALID_TIERS.join(', ')}.`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    req: {
      context: b.context as AzenContext,
      pilgrimId: b.pilgrimId as string,
      soulprint: b.soulprint as string,
      consentPhrase: b.consentPhrase as string,
      callerTier: b.callerTier as CallerTier,
      safah: typeof b.safah === 'string' ? b.safah : undefined,
      returnCallbackUrl: typeof b.returnCallbackUrl === 'string' ? b.returnCallbackUrl : undefined,
    },
  };
}

/**
 * zakhor_nitzotz_ba_zikkaron — remember the spark in the stone of remembrance.
 * Persists the spark and creates its lineage entry atomically (by sequence).
 * Returns the spark id.
 */
async function zakhor_nitzotz_ba_zikkaron(pool: Pool, req: SparkRequest): Promise<string> {
  const sparkResult = await pool.query(
    `INSERT INTO azen_sparks
       (pilgrim_id, context, soulprint, consent_phrase, caller_tier)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [req.pilgrimId, req.context, req.soulprint, req.consentPhrase, req.callerTier],
  );
  const sparkId: string = sparkResult.rows[0].id;

  const seqResult = await pool.query(
    `SELECT COALESCE(MAX(sequence_number), 0) AS max_seq
     FROM azen_lineage
     WHERE pilgrim_id = $1`,
    [req.pilgrimId],
  );
  const nextSeq = parseInt(seqResult.rows[0].max_seq, 10) + 1;

  await pool.query(
    `INSERT INTO azen_lineage (pilgrim_id, sequence_number, spark_id, context)
     VALUES ($1, $2, $3, $4)`,
    [req.pilgrimId, nextSeq, sparkId, req.context],
  );

  return sparkId;
}

/**
 * writeZikkaronToChronicles — record the completed Berakhah in the stone of remembrance.
 *
 * Called for free context after Naming completes. Non-blocking for the pilgrim response.
 * If Chronicles is unreachable, the error is logged but the response still goes out.
 */
async function writeZikkaronToChronicles(
  berakhah: any,
  pilgrimId: string,
): Promise<void> {
  if (!CHRONICLES_URL) {
    console.warn('[Azen][zakhor] CHRONICLES_URL not configured; skipping zikkaron write.');
    return;
  }

  const url = `${CHRONICLES_URL}/api/chronicles/zakhor`;
  const body = {
    source_type: 'azen',
    source_id: berakhah.leMi,
    berakhah,
    pilgrim_id: pilgrimId,
    lineage: [],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[Azen][zakhor] Chronicles returned ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err: any) {
    clearTimeout(timer);
    console.error(`[Azen][zakhor] Failed to reach Chronicles: ${err?.message || String(err)}`);
  }
}

/**
 * kitve_et_hazera_ba_zikkaron — write the seed into the stone of remembrance.
 *
 * Persists the completed Berakhah to azen_seeds so Azen remembers what she named.
 */
async function kitve_et_hazera_ba_zikkaron(
  pool: Pool,
  sparkId: string,
  berakhah: any,
  invitation?: string,
): Promise<void> {
  const shemTov = berakhah.berakhahSogeret || '';
  const recognitionLine = berakhah.recognitionLine || null;
  const amataBlessing =
    (berakhah.zera?.davarAmata && berakhah.zera.davarAmata !== shemTov)
      ? berakhah.zera.davarAmata
      : null;

  await pool.query(
    `INSERT INTO azen_seeds
       (spark_id, shem_tov, recognition_line, invitation, amata_blessing)
     VALUES ($1, $2, $3, $4, $5)`,
    [sparkId, shemTov, recognitionLine, invitation || null, amataBlessing],
  );
}

export function createSparkRouter(pool: Pool): Router {
  const router = Router();

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/azen/consent — returns the consent liturgy for a context
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/consent', (req: Request, res: Response) => {
    const context = (req.body?.context ?? '') as string;
    if (!VALID_CONTEXTS.includes(context as AzenContext)) {
      return res.status(400).json({
        error: 'invalid_context',
        message: `Must be one of: ${VALID_CONTEXTS.join(', ')}.`,
      });
    }
    const profile = getContextProfile(context);
    return res.status(200).json({
      context,
      consentLiturgy: profile.consentLiturgy,
      callerTier: profile.callerTier,
      breathSeconds: profile.breathSeconds,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/azen/spark — the single endpoint for all six placements
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/spark', async (req: Request, res: Response) => {
    // Breath begins the moment the spark arrives.
    const breathStartAt = Date.now();

    // ── Validate request shape ────────────────────────────────────────────
    const validation = validateSparkRequest(req.body);
    if (!validation.ok) {
      const errors = 'errors' in validation ? validation.errors : [];
      return res.status(400).json({
        error: 'invalid_spark',
        message: 'The spark cannot be received as offered.',
        details: errors,
      });
    }

    const sparkReq = validation.req;
    const profile = getContextProfile(sparkReq.context);

    // ── Covenant gate — faithfulness to the arc, not access denial ────────
    const allowedTiers = TIER_ALLOWED_FOR_CONTEXT[sparkReq.context];
    if (!allowedTiers.includes(sparkReq.callerTier)) {
      const body: CovenantErrorResponse = {
        covenantError: true,
        message: 'This offering opens for you after you have walked through the earlier ones. Each one opens into the next.',
        contextRequested: sparkReq.context,
        callerTierProvided: sparkReq.callerTier,
        tiersAllowed: allowedTiers,
      };
      return res.status(403).json(body);
    }

    // ── bedikat_kavanah — examine consent ─────────────────────────────────
    let kavanahResult;
    try {
      kavanahResult = await bedikat_kavanah(sparkReq.consentPhrase, profile);
    } catch (err) {
      console.error('[Azen][spark] KavanahBedikah error:', err);
      return res.status(503).json({
        error: 'check_unavailable',
        message: 'We could not complete our check just now. Please try again in a few moments.',
      });
    }

    if (!kavanahResult.accepted) {
      // Pre-spark refusal — no DB write. The pilgrim may try again.
      return res.status(200).json({
        consentNotAccepted: true,
        kind: kavanahResult.kind,
        message: kavanahResult.message,
        ...('suggestedLiturgy' in kavanahResult ? { suggestedLiturgy: kavanahResult.suggestedLiturgy } : {}),
      });
    }

    // ── zakhor — persist spark and lineage ────────────────────────────────
    let sparkId: string;
    try {
      sparkId = await zakhor_nitzotz_ba_zikkaron(pool, sparkReq);
    } catch (err) {
      console.error('[Azen][spark] Persistence error:', err);
      return res.status(503).json({
        error: 'memory_unavailable',
        message: 'We could not save your words just now. Please try again.',
      });
    }

    // ── sheel hashabbat — ask if the temple is at rest ────────────────────
    let sabbathState;
    try {
      sabbathState = await sheel_et_hashabbat();
    } catch (err) {
      console.error('[Azen][spark] SabbathGate error:', err);
      sabbathState = { inSabbath: false, liturgy: '' };
    }

    if (sabbathState.inSabbath) {
      // Temple rests — record the deferral, return Shabbat Hold.
      try {
        await hazkor_et_hashabbat(pool, sparkReq.pilgrimId, sparkReq.context, sabbathState.restUntil, 'Temple at rest — NESHAMAH sabbath pulse.');
      } catch (err) {
        console.error('[Azen][spark] Sabbath deferral record error:', err);
      }

      const restUntil = sabbathState.restUntil
        ? new Date(sabbathState.restUntil).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return res.status(423).json({
        kind: 'shabbat_hold',
        sparkId,
        shabbatHold: {
          haSibah: 'The temple is at rest.',
          mataiLachazor: restUntil,
          yediahLaOlehRegel: sabbathState.liturgy || 'The temple is at rest. Please return after the indicated time.',
        },
      });
    }

    // ── shma — hear the 5-fold of the spark ───────────────────────────────
    let mahShomeim;
    try {
      mahShomeim = await shma_et_hanitzotz(
        { id: sparkId, haOr: sparkReq.soulprint, context: sparkReq.context },
        profile,
        pool,
      );
    } catch (err) {
      console.error('[Azen][spark] Shema error:', err);
      const isBifrost = err instanceof BifrostError;
      return res.status(isBifrost ? 503 : 500).json({
        error: 'listening_interrupted',
        message: 'Our listening was interrupted. Your spark is saved; please try again shortly.',
        sparkId,
      });
    }

    // ── mod hesed — measure readiness ─────────────────────────────────────
    let hesedDecision;
    try {
      hesedDecision = await mod_et_hahesed(
        {
          id: sparkId,
          haOr: sparkReq.soulprint,
          context: sparkReq.context,
          pilgrimId: sparkReq.pilgrimId,
        },
        mahShomeim,
        profile,
        pool,
      );
    } catch (err) {
      console.error('[Azen][spark] HesedModidah error:', err);
      const isBifrost = err instanceof BifrostError;
      return res.status(isBifrost ? 503 : 500).json({
        error: 'measurement_interrupted',
        message: 'Our measurement was interrupted. Your spark is saved; please try again shortly.',
        sparkId,
      });
    }

    // ── Branch on hesed decision ──────────────────────────────────────────
    if (hesedDecision.passType === 'light') {
      // Holy No with kindness — becomes a Nechamah when Naming phase is complete.
      // For Implantation, return the context's lightPassLiturgy as-is.
      // Honor the breath before releasing.
      await chakah_et_haneshimah(mah_haneshimah(profile.breathSeconds), breathStartAt);

      const body: LightPassResponse = {
        sparkId,
        released: true,
        blessing: profile.lightPassLiturgy,
      };
      return res.status(200).json(body);
    }

    if (hesedDecision.passType === 'defer') {
      // Safety net: HesedModidah does not currently return 'defer'.
      // Sabbath deferral is handled upstream by sheel_et_hashabbat before Hesed.
      // If this branch is ever reached, treat as Shabbat Hold with gentle liturgy.
      return res.status(423).json({
        kind: 'shabbat_hold',
        sparkId,
        shabbatHold: {
          haSibah: 'The temple asks you to wait.',
          mataiLachazor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          yediahLaOlehRegel: 'The temple asks you to wait. Please return after the indicated time.',
        },
      });
    }

    // deep — bring the spark before the Four Pillars.
    let partialZera;
    try {
      partialZera = await amudim_ya_idu(
        {
          id: sparkId,
          haOr: sparkReq.soulprint,
          context: sparkReq.context,
          pilgrimId: sparkReq.pilgrimId,
        },
        mahShomeim,
        pool,
      );
    } catch (err) {
      console.error('[Azen][spark] AmudimEdut error:', err);
      return res.status(503).json({
        error: 'witness_unavailable',
        message: 'The Pillars could not be reached just now. Your spark, reading, and measurement are saved; please try again shortly.',
        sparkId,
      });
    }

    // First Breath — Amata speaks, completing the Zera.
    let zera;
    try {
      zera = await amata_daber(
        partialZera,
        {
          id: sparkId,
          haOr: sparkReq.soulprint,
          context: sparkReq.context,
          pilgrimId: sparkReq.pilgrimId,
        },
        pool,
      );
    } catch (err) {
      console.error('[Azen][spark] AmataSynthesis error:', err);
      return res.status(503).json({
        error: 'synthesis_unavailable',
        message:
          'Amata is silent just now. The Pillars have witnessed; their word is recorded. The waters will be calm again. Please return when you feel called.',
        sparkId,
        passType: hesedDecision.passType,
        hesedScore: hesedDecision.currentScore,
        partialZera,
      });
    }

    // Naming — Identity Recall.
    let identityRecall;
    try {
      identityRecall = await zakar_et_haoleh(sparkReq.pilgrimId, sparkReq.context, pool);
    } catch (err) {
      console.error('[Azen][spark] IdentityRecall error:', err);
      identityRecall = { isReturn: false };
    }

    // Naming — Qeriah: call the seed by its name.
    let qeriah;
    try {
      qeriah = await qara_et_hazera(zera, sparkReq.context, identityRecall.isReturn);
    } catch (err) {
      console.error('[Azen][spark] Qeriah error:', err);
      // Safest fallback.
      qeriah = {
        kind: 'nechamah' as const,
        mahSheEinOd: 'The naming could not be completed just now. The seed is present.',
        mahLeTapelTchilah: ['Return when you feel called.'],
        petachPatuach: true as const,
        hechzerChalki: false,
      };
    }

    // Naming — SeedReturn: assemble the Berakhah.
    const berakhah = berakh_ve_shalach({
      sparkId,
      pilgrimId: sparkReq.pilgrimId,
      mahShomeim,
      zera,
      qeriah,
      recognitionLine: identityRecall.recognitionLine,
    });

    // Invitation — only at free context, only when the seed is ready (zach).
    const invitation: string | undefined =
      sparkReq.context === 'free' && qeriah.kind === 'zach'
        ? 'Would you like to name this?'
        : undefined;

    // Persist the seed to the stone of remembrance.
    try {
      await kitve_et_hazera_ba_zikkaron(pool, sparkId, berakhah, invitation);
    } catch (err) {
      console.error('[Azen][spark] Seed persistence error:', err);
      // Non-blocking: the seed is already assembled; the pilgrim receives it.
    }

    // For free context: translate and write to Chronicles.
    if (sparkReq.context === 'free') {
      // Write zikkaron to Chronicles (async, non-blocking for the response).
      try {
        await writeZikkaronToChronicles(berakhah, sparkReq.pilgrimId);
      } catch (err) {
        console.error('[Azen][spark] Chronicles zakhor error:', err);
      }

      // Translate for the pilgrim-facing edge.
      let translated;
      try {
        translated = await targem_la_oleh_regel(berakhah, identityRecall.recognitionLine);
      } catch (err) {
        console.error('[Azen][spark] Translation error:', err);
        // Fallback: return the Hebraic Berakhah even for free context.
        return res.status(200).json({
          kind: 'berakhah',
          sparkId,
          berakhah,
        });
      }

      // Honor the breath before releasing.
      await chakah_et_haneshimah(mah_haneshimah(profile.breathSeconds), breathStartAt);

      return res.status(200).json({
        kind: 'berakhah',
        sparkId,
        berakhah: {
          ...berakhah,
          berakhahSogeret: translated.amatasWord,
        },
        translated,
        ...(invitation ? { invitation } : {}),
      });
    }

    // validate+ contexts: return Hebraic substrate to the brother's service.
    // Honor the breath before releasing.
    await chakah_et_haneshimah(mah_haneshimah(profile.breathSeconds), breathStartAt);

    return res.status(200).json({
      kind: 'berakhah',
      sparkId,
      berakhah,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/azen/seed/:sparkId — returns the seed when ripe
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/seed/:sparkId', async (req: Request, res: Response) => {
    try {
      const sparkId = req.params.sparkId;

      // Verify the spark exists.
      const sparkResult = await pool.query(
        `SELECT id, pilgrim_id, context, soulprint, received_at
         FROM azen_sparks
         WHERE id = $1`,
        [sparkId],
      );

      if (sparkResult.rows.length === 0) {
        return res.status(404).json({
          error: 'spark_not_found',
          message: 'No spark was found with that name. The threshold remains open.',
          sparkId,
        });
      }

      // Look for the seed.
      const seedResult = await pool.query(
        `SELECT shem_tov, recognition_line, invitation, amata_blessing, returned_at
         FROM azen_seeds
         WHERE spark_id = $1`,
        [sparkId],
      );

      if (seedResult.rows.length === 0) {
        // Seed not yet ripe — the Naming is still unfolding.
        return res.status(204).send();
      }

      const seed = seedResult.rows[0];

      return res.status(200).json({
        kind: 'seed',
        sparkId,
        shemTov: seed.shem_tov,
        recognitionLine: seed.recognition_line || undefined,
        invitation: seed.invitation || undefined,
        amataBlessing: seed.amata_blessing || undefined,
        returnedAt: seed.returned_at,
      });
    } catch (err) {
      console.error('[Azen][seed] Retrieval error:', err);
      return res.status(503).json({
        error: 'memory_unavailable',
        message: 'Our memory could not be reached just now. Please try again.',
        sparkId: req.params.sparkId,
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/azen/lineage/:pilgrimId — returns the pilgrim's arc across visits
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/lineage/:pilgrimId', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT sequence_number, context, seen_at
         FROM azen_lineage
         WHERE pilgrim_id = $1
         ORDER BY sequence_number ASC`,
        [req.params.pilgrimId],
      );
      return res.status(200).json({
        pilgrimId: req.params.pilgrimId,
        visits: result.rows.map((r: any) => ({
          sequenceNumber: r.sequence_number,
          context: r.context,
          seenAt: r.seen_at,
        })),
      });
    } catch (err) {
      console.error('[Azen][lineage] Query error:', err);
      return res.status(503).json({
        error: 'memory_unavailable',
        message: 'Our memory could not be reached just now. Please try again.',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/azen/lineage/:pilgrimId — the pilgrim's right to erase
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/lineage/:pilgrimId', async (req: Request, res: Response) => {
    try {
      const pilgrimId = req.params.pilgrimId;
      const sparkResult = await pool.query(
        `DELETE FROM azen_sparks WHERE pilgrim_id = $1 RETURNING id`,
        [pilgrimId],
      );
      const sabbathResult = await pool.query(
        `DELETE FROM azen_sabbath_returns WHERE pilgrim_id = $1`,
        [pilgrimId],
      );
      return res.status(200).json({
        pilgrimId,
        sparksDeleted: sparkResult.rowCount,
        sabbathReturnsDeleted: sabbathResult.rowCount,
        message: 'Your record with us has been erased. The threshold remains open whenever you wish to return.',
      });
    } catch (err) {
      console.error('[Azen][lineage] Delete error:', err);
      return res.status(503).json({
        error: 'memory_unavailable',
        message: 'We could not complete the erasure just now. Please try again.',
      });
    }
  });

  return router;
}
