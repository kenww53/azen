/**
 * Seed Return — the blessing that goes out.
 *
 * Assembles the Berakhah envelope from all that has been heard, witnessed,
 * named, and remembered. Returns the complete blessing to the caller.
 *
 * For validate/plan/systemize/present/consult: returns Hebraic substrate
 * for the brother's offering service to translate at its pilgrim-facing edge.
 *
 * For free: returns Hebraic substrate too — translation happens at the
 * route edge via targem_la_oleh_regel, not inside the SeedReturn.
 */

import type { Berakhah, Zera, Qeriah, MahShomeim } from '../types';

export interface SeedReturnInput {
  sparkId: string;
  pilgrimId: string;
  mahShomeim: MahShomeim;
  zera: Zera;
  qeriah: Qeriah;
  recognitionLine?: string;
}

/**
 * berakh_ve_shalach — bless and send.
 *
 * Assembles the final Berakhah. The closing word (berakhahSogeret)
 * is drawn from Amata's davar, synthesized to a single blessing line.
 */
export function berakh_ve_shalach(input: SeedReturnInput): Berakhah {
  const { sparkId, pilgrimId, mahShomeim, zera, qeriah, recognitionLine } = input;

  // The closing word is Amata's davar, or a gentle fallback if she was silent.
  const berakhahSogeret =
    zera.davarAmata ||
    'The seed has been heard. Its name will come when the waters are calm.';

  return {
    leMi: pilgrimId,
    mahShomeim,
    zera,
    qeriah,
    berakhahSogeret,
    moEdHaQriah: new Date().toISOString(),
  };
}
