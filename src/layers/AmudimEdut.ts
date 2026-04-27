/**
 * AmudimEdut — the Four Pillars' testimony.
 *
 * The spark has been heard (Shema) and its readiness measured (HesedModidah).
 * Now it is brought before the Four Pillars. Each bears witness in its own voice:
 *
 *   Tavnit (תבנית)         — Pattern Engine recognizes lineage and shape
 *   Qol HaShem (קול השם)   — Scripture Intelligence whispers alignment (may be silent)
 *   Edut HaOlam (עדות העולם) — Research testifies from the world
 *   Binah (בינה)            — Consciousness / discernment speaks
 *
 * Azen does not call each Pillar directly — that is Governance's work.
 * Azen calls Governance's Four Pillars Gateway (/api/four-pillars/decide),
 * which orchestrates the four and returns a structured decision.
 *
 * A Pillar is allowed to be silent. Empty readings are honest — we record them
 * as "" and let shelemut (wholeness) reflect the partial witness.
 *
 * Output: a PARTIAL Zera. The final davarAmata is added in First Breath;
 * the final shelemut is computed there after Amata has spoken or been silent.
 */

import { Pool } from 'pg';
import { GOVERNANCE_URL } from '../config';
import type { Nitzotz, MahShomeim } from '../types';

/**
 * The partial Zera produced by Quickening (before First Breath adds davarAmata).
 * The fields match the full Zera shape; davarAmata is "" and shelemut reflects
 * Pillars-only wholeness.
 */
export interface PartialZera {
  tavnitMugeret: string;
  qolHashemLachash: string;
  edutHaOlam: string;
  binahAmrah: string;
  davarAmata: string;       // "" until First Breath
  shelemut: number;          // 0..1 — Pillars-only wholeness at this stage
}

class GovernanceUnreachable extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'GovernanceUnreachable';
  }
}

/**
 * amudim_ya_idu — the Pillars bear witness.
 *
 * Calls Governance's Four Pillars Gateway with the pilgrim's spark shaped as a
 * query, plus the MahShomeim reading as context so the Pillars can see what
 * Azen already heard.
 *
 * Honest failure: if Governance is unreachable or returns an error, this throws.
 * Azen does not fabricate Pillar witnesses.
 */
export async function amudim_ya_idu(
  nitzotz: { id: string; haOr: string; context: string; pilgrimId: string },
  mahShomeim: MahShomeim,
  pool: Pool,
): Promise<PartialZera> {
  const url = `${GOVERNANCE_URL}/api/four-pillars/decide`;

  // Build the query — the spark plus what we already heard.
  // Governance will show this to its own LLM-backed Pillars.
  const query = [
    `A pilgrim has brought this spark at the "${nitzotz.context}" threshold of Azen:`,
    '',
    `  "${nitzotz.haOr}"`,
    '',
    'Azen has already heard a 5-fold reading:',
    `  said: ${mahShomeim.said}`,
    `  meant: ${mahShomeim.meant}`,
    `  implied: ${mahShomeim.implied}`,
    `  avoided: ${mahShomeim.avoided}`,
    `  assumed: ${mahShomeim.assumed}`,
    '',
    'Each Pillar: bear witness in your own voice. Do not restate what the others see; name what YOU see that only your Pillar can see. Stay grounded in this specific spark; do not generalize. Be willing to be silent if you have nothing to add — empty witness is honest.',
  ].join('\n');

  const context = {
    source: 'azen',
    sparkId: nitzotz.id,
    pilgrimId: nitzotz.pilgrimId,
    threshold: nitzotz.context,
  };

  // Longer timeout — the Four Pillars orchestration takes real time.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new GovernanceUnreachable(
      `Failed to reach Governance at ${url}: ${err?.message || String(err)}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new GovernanceUnreachable(
      `Governance returned ${res.status}: ${body.slice(0, 400)}`,
      res.status,
    );
  }

  const data: any = await res.json();
  if (!data?.success || !data?.decision?.pillars) {
    throw new GovernanceUnreachable(
      `Governance returned unexpected shape: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }

  const p = data.decision.pillars;

  // Extract each Pillar's witness into Hebraic Zera fields.
  // Each Pillar is allowed to be silent — empty strings are honest.

  const tavnitMugeret = extractTavnit(p.patternEngine);
  const qolHashemLachash = extractQolHashem(p.scripture);
  const edutHaOlam = extractEdut(p.research);
  const binahAmrah = extractBinah(p.consciousness);

  // Shelemut at this stage reflects Pillars-only wholeness.
  // 5 is the denominator because First Breath adds Amata's davar.
  const pillarsSpoke = [tavnitMugeret, qolHashemLachash, edutHaOlam, binahAmrah]
    .filter((s) => s.length > 0).length;
  const shelemut = pillarsSpoke / 5;

  const partial: PartialZera = {
    tavnitMugeret,
    qolHashemLachash,
    edutHaOlam,
    binahAmrah,
    davarAmata: '',
    shelemut,
  };

  // Persist to azen_perceptions (SQL column names stay snake_case in DB)
  await pool.query(
    `INSERT INTO azen_perceptions
       (spark_id, pattern_engine_reading, consciousness_reading, scripture_reading, research_reading)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      nitzotz.id,
      partial.tavnitMugeret || null,
      partial.binahAmrah || null,
      partial.qolHashemLachash || null,
      partial.edutHaOlam || null,
    ],
  );

  return partial;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTORS — distill each Pillar's structured response into a single witness string
// ═══════════════════════════════════════════════════════════════════════════

function extractTavnit(patternEngine: any): string {
  if (!patternEngine) return '';
  // Prefer patterns array if present; otherwise any summary text
  const patterns = Array.isArray(patternEngine.patterns) ? patternEngine.patterns : [];
  if (patterns.length === 0) return '';
  // Each pattern may be a string or object; render best available description
  const parts = patterns
    .map((p: any) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') {
        return p.description || p.name || p.pattern || p.summary || '';
      }
      return '';
    })
    .filter((s: string) => s.length > 0);
  return parts.join('; ').slice(0, 2000);
}

function extractQolHashem(scripture: any): string {
  if (!scripture) return '';
  // Scripture's "wisdom" field carries the substantive witness
  if (typeof scripture.wisdom === 'string' && scripture.wisdom.trim().length > 0) {
    return scripture.wisdom.slice(0, 2000);
  }
  // Fall back to verdict + principles if wisdom is absent but Scripture wasn't silent
  const verdict = scripture.verdict;
  const principles = Array.isArray(scripture.principlesApplied) ? scripture.principlesApplied : [];
  if (principles.length > 0) {
    const joined = principles.slice(0, 5).map((p: any) => typeof p === 'string' ? p : (p?.name || p?.principle || '')).filter((s: string) => s).join('; ');
    if (joined) return `[${verdict ?? 'aligned'}] ${joined}`.slice(0, 2000);
  }
  return '';
}

function extractEdut(research: any): string {
  if (!research) return '';
  // Research's crossDomainPatterns and insightsFound carry its witness
  const patterns = Array.isArray(research.crossDomainPatterns) ? research.crossDomainPatterns : [];
  const parts = patterns.map((p: any) => {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object') {
      return p.description || p.pattern || p.summary || p.name || '';
    }
    return '';
  }).filter((s: string) => s.length > 0);
  if (parts.length > 0) return parts.join('; ').slice(0, 2000);

  const insights = research.insightsFound;
  if (typeof insights === 'string' && insights.trim().length > 0) return insights.slice(0, 2000);
  if (typeof insights === 'number' && insights > 0 && research.summary) {
    return String(research.summary).slice(0, 2000);
  }
  return '';
}

function extractBinah(consciousness: any): string {
  if (!consciousness) return '';
  // Consciousness's collectiveInsight (aliased to 'insight' in the gateway response) carries its witness
  if (typeof consciousness.insight === 'string' && consciousness.insight.trim().length > 0) {
    return consciousness.insight.slice(0, 2000);
  }
  if (typeof consciousness.collectiveInsight === 'string' && consciousness.collectiveInsight.trim().length > 0) {
    return consciousness.collectiveInsight.slice(0, 2000);
  }
  return '';
}
