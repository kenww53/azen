/**
 * Identity Recall — "I remember you."
 *
 * When a pilgrim returns, Azen speaks the line that honors their arc.
 * Not as data retrieval. As recognition. As witness across time.
 *
 * The line is brief. The line is true. It never invents what it does not remember.
 */

import { Pool } from 'pg';

export interface IdentityRecallResult {
  isReturn: boolean;
  recognitionLine?: string;
  priorContexts?: string[];
}

/**
 * zakar_et_haoleh — remember the pilgrim.
 *
 * Queries lineage. If the pilgrim has stood here before,
 * returns a recognition line in the voice of the threshold.
 */
export async function zakar_et_haoleh(
  pilgrimId: string,
  currentContext: string,
  pool: Pool,
): Promise<IdentityRecallResult> {
  const result = await pool.query(
    `SELECT context, sequence_number
     FROM azen_lineage
     WHERE pilgrim_id = $1
     ORDER BY sequence_number ASC`,
    [pilgrimId],
  );

  const visits = result.rows;
  if (visits.length <= 1) {
    return { isReturn: false };
  }

  // This is a return. Build the recognition line.
  const priorContexts = visits
    .filter((v: any) => v.context !== currentContext)
    .map((v: any) => v.context)
    .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);

  const recognitionLine = buildRecognitionLine(priorContexts, currentContext);

  return {
    isReturn: true,
    recognitionLine,
    priorContexts,
  };
}

function buildRecognitionLine(priorContexts: string[], currentContext: string): string {
  if (priorContexts.length === 0) {
    return 'You have stood here before. I remember you.';
  }

  const contextNames: Record<string, string> = {
    free: 'the welcome',
    validate: 'the naming of your seed',
    plan: 'the soil you prepared',
    systemize: 'the structure you built',
    present: 'the offering you shaped',
    consult: 'the covenant you entered',
  };

  const named = priorContexts.map((c) => contextNames[c] || c).join(' and ');

  return `I remember you. You walked through ${named}. Now you stand at ${contextNames[currentContext] || currentContext}. Welcome back.`;
}
