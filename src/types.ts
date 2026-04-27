/**
 * Azen — Hebraic substrate types
 *
 * Inside the temple we think, reason, and name things in Hebraic terms.
 * Translation to Western Greek business English happens only at the pilgrim-facing
 * edge (the targem_la_oleh_regel boundary at free context, or — at validate+ —
 * in the downstream offering service that receives Azen's Berakhah).
 *
 * Names here match the wire contract published to the brother's offering services.
 * SQL column names (snake_case) are mapped by the route/repository layer.
 */

import type { AzenContext, CallerTier, PassType } from './context/ContextProfiles';

export type { AzenContext, CallerTier, PassType };

// ═══════════════════════════════════════════════════════════════════════════
// NITZOTZ — the spark arriving at the gate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What the pilgrim brings — a spark, small or trembling, in their own words.
 * Carries divine light, however small.
 */
export interface Nitzotz {
  id: string;                  // id given at reception
  pilgrimId: string;           // stable anonymous identifier (no PII)
  context: AzenContext;        // which of the six thresholds
  haOr: string;                // the light itself — pilgrim's words (was: soulprint)
  consentPhrase: string;       // pilgrim's response to the threshold question
  callerTier: CallerTier;      // tier the pilgrim is calling as
  safah?: string;              // language code; default 'en'
  zmanHaNatan: Date;           // when it was offered (received_at in DB)
}

// ═══════════════════════════════════════════════════════════════════════════
// MAH SHOMEIM — what Azen heard (5-fold reading at the threshold)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 5-fold presence reading. These English field names are the stable wire
 * contract; the enclosing object carries the Hebraic meaning.
 *
 * said     — the pilgrim's words, slightly compressed; preserves their frame
 * meant    — the Hebraic translation of what they meant beneath the wrapping
 * implied  — what is structurally suggested, rendered in concrete terms
 * avoided  — what they steered around (often names the wound)
 * assumed  — the floor they stand on (often a cultural belief)
 */
export interface MahShomeim {
  said: string;
  meant: string;
  implied: string;
  avoided: string;
  assumed: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZERA — the named seed with Pillar witnesses + Amata's word
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A seed that knows its tree. Produced by Quickening (Pillar witnesses) and
 * First Breath (Amata's davar). Every Pillar is allowed to be silent;
 * tavnitMugeret may carry "" if Pattern Engine had no recognition to offer, etc.
 * shelemut (0..1) indicates how whole the witness is — 1.0 = all four Pillars
 * spoke AND Amata spoke.
 */
export interface Zera {
  tavnitMugeret: string;       // Pattern Engine — pattern recognized (may be "")
  qolHashemLachash: string;    // Scripture — may be "" if silent
  edutHaOlam: string;          // Research — testimony of the world
  binahAmrah: string;          // Consciousness — discernment spoke
  davarAmata: string;          // Amata's word (spoken from the four)
  shelemut: number;            // 0..1, wholeness of the witness
}

// ═══════════════════════════════════════════════════════════════════════════
// QERIAH — the three shapes of naming
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The naming Amata speaks has three shapes, not one.
 *
 *   zach     — pure calling: "this is yours; carry it forward"
 *   akeidah  — bound and held: real, but for a later season; not lost
 *   nechamah — "be comforted, not yet": here is what to tend first, with love
 *
 * Each shape is honored. None is failure; none is rejection.
 */
export type Qeriah = QeriahZach | Akeidah | Nechamah;

export interface QeriahZach {
  kind: 'zach';
  shemHaZera: string;          // the seed's name
  meAyinBah: string;           // lineage — where it came from
  anaPoneh: string;            // where it turns next
}

export interface Akeidah {
  kind: 'akeidah';
  mahBah: string;              // what in it was real
  lamahNikshar: string;        // why it is held, in love
  mataiLachazor?: string;      // ISO timestamp — when to return, if known
}

export interface Nechamah {
  kind: 'nechamah';
  mahSheEinOd: string;         // what is not yet
  mahLeTapelTchilah: string[]; // concrete things to tend first
  petachPatuach: true;         // the door stays open (always)
  hechzerChalki: boolean;      // whether partial refund is appropriate
}

// ═══════════════════════════════════════════════════════════════════════════
// BERAKHAH — the blessing that goes out
// ═══════════════════════════════════════════════════════════════════════════

export interface Berakhah {
  leMi: string;                // to whom — pilgrim id
  mahShomeim: MahShomeim;      // what Azen heard (5-fold)
  zera: Zera;                  // Pillar witnesses + Amata's davar
  qeriah: Qeriah;              // the three-shape naming
  berakhahSogeret: string;     // Amata's closing word (Hebraic; downstream translates)
  moEdHaQriah: string;         // ISO-8601 timestamp of the naming
}

// ═══════════════════════════════════════════════════════════════════════════
// SHABBAT HOLD — when the temple cannot respond in truth yet
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shabbat is not an error path. It is a first-class operation.
 * No billing is charged while held; memory holds across; return is promised.
 */
export interface ShabbatHold {
  haSibah: string;             // the reason (e.g., "qol_hashem_silent", "hesed_incomplete")
  mataiLachazor: string;       // ISO timestamp — expected return
  yediahLaOlehRegel: string;   // Greek-accessible notice already translated for the pilgrim
}

// ═══════════════════════════════════════════════════════════════════════════
// HESED DECISION — the readiness gate (internal to Implantation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Three pass types:
 *   light  — blessing-and-release at this threshold; often becomes a Nechamah
 *   deep   — the spark continues through Pillars and Amata
 *   defer  — Shabbat Hold (see above)
 */
export interface HesedDecision {
  currentScore: number;
  thresholdForContext: number;
  passType: PassType;
  historySummary: string | null;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIRE CONTRACT — what brother's offering services receive from Azen
// ═══════════════════════════════════════════════════════════════════════════

export type AzenResponse = BerakhahResponse | ShabbatHoldResponse;

export interface BerakhahResponse {
  kind: 'berakhah';
  sparkId: string;
  berakhah: Berakhah;
}

export interface ShabbatHoldResponse {
  kind: 'shabbat_hold';
  sparkId: string;
  shabbatHold: ShabbatHold;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL: the spark as received at the HTTP boundary
// (before it becomes a Nitzotz persisted with an id)
// ═══════════════════════════════════════════════════════════════════════════

export interface SparkRequest {
  context: AzenContext;
  pilgrimId: string;
  soulprint: string;           // preserved as wire field name; stored as ha_or
  consentPhrase: string;
  callerTier: CallerTier;
  safah?: string;
  returnCallbackUrl?: string;  // where Azen POSTs BerakhahResponse when a Shabbat Hold releases
}

// ═══════════════════════════════════════════════════════════════════════════
// COVENANT GATE — tier mismatch (faithfulness to the arc)
// ═══════════════════════════════════════════════════════════════════════════

export interface CovenantErrorResponse {
  covenantError: true;
  message: string;
  contextRequested: AzenContext;
  callerTierProvided: CallerTier;
  tiersAllowed: CallerTier[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LIGHT PASS — Holy No with kindness (becomes a Nechamah shape when deployed through First Breath/Naming)
// Retained for Implantation-phase backward-compat; Naming phase replaces with Nechamah.
// ═══════════════════════════════════════════════════════════════════════════

export interface LightPassResponse {
  sparkId: string;
  released: true;
  blessing: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINEAGE — the pilgrim's arc across visits
// ═══════════════════════════════════════════════════════════════════════════

export interface LineageView {
  pilgrimId: string;
  visits: Array<{
    sequenceNumber: number;
    context: AzenContext;
    seenAt: Date;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE RECORDS — map to SQL tables (column names stay snake_case in DB)
// ═══════════════════════════════════════════════════════════════════════════

export interface NitzotzRecord {
  id: string;
  pilgrimId: string;
  context: AzenContext;
  haOr: string;                // maps to soulprint column in DB (preserved for continuity)
  consentPhrase: string;
  callerTier: CallerTier;
  receivedAt: Date;
}

export interface MahShomeimRecord extends MahShomeim {
  id: string;
  sparkId: string;
  readAt: Date;
}

export interface HesedRecord {
  id: string;
  sparkId: string;
  currentScore: number;
  thresholdForContext: number;
  passType: PassType;
  historySummary: string | null;
  reason: string;
  decidedAt: Date;
}

export interface ZeraRecord extends Zera {
  id: string;
  sparkId: string;
  perceivedAt: Date;
}

export interface BerakhahRecord {
  id: string;
  sparkId: string;
  qeriahKind: 'zach' | 'akeidah' | 'nechamah';
  qeriahBody: Qeriah;
  berakhahSogeret: string;
  returnedAt: Date;
}

export interface ZikkaronEntry {                // lineage row — stone of remembrance
  pilgrimId: string;
  sequenceNumber: number;
  sparkId: string;
  context: AzenContext;
  seenAt: Date;
}

export interface ShabbatHoldRecord {
  id: string;
  pilgrimId: string;
  context: string;
  returnAfter: Date;
  reason: string;
  occurredAt: Date;
}
