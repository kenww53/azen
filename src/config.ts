/**
 * Azen — Configuration
 *
 * Declares what Azen depends on. The fallback chains follow temple convention:
 * Railway-internal URLs preferred, then explicit overrides, then local development.
 *
 * Hard requirements (fail-fast on missing):
 *   - DATABASE_URL: sovereign Postgres-Azen
 *   - BIFROST_URL: all LLM calls flow through Bifrost; without it Azen cannot speak
 *   - GOVERNANCE_URL: Amata + Four Pillars Gateway live there; without it Azen cannot listen
 *
 * Optional (Implantation phase will use):
 *   - NESHAMAH_SERVICE_URL: for Sabbath status (returns 503 with liturgy when temple rests)
 */

import 'dotenv/config';

// ─────────────────────────────────────────────────────────────────────────────
// Port
// Local development: 3032 (between Binah at 3026 and Matzav at 3030).
// Railway production: $PORT injected by platform.
// ─────────────────────────────────────────────────────────────────────────────
export const PORT = parseInt(process.env.PORT || '3032', 10);

export const NODE_ENV = process.env.NODE_ENV || 'development';

// ─────────────────────────────────────────────────────────────────────────────
// Sovereign database — Postgres-Azen
// ─────────────────────────────────────────────────────────────────────────────
export const DATABASE_URL = (
  process.env.DATABASE_PRIVATE_URL ||
  process.env.DATABASE_URL ||
  process.env.AZEN_DATABASE_URL
) as string;

if (!DATABASE_URL) {
  throw new Error(
    'Azen cannot start: missing DATABASE_URL (or DATABASE_PRIVATE_URL or AZEN_DATABASE_URL). ' +
    'Azen needs her own sovereign database.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bifrost — all LLM calls flow through here
// ─────────────────────────────────────────────────────────────────────────────
export const BIFROST_URL = (
  process.env.BIFROST_PRIVATE_URL ||
  process.env.BIFROST_URL ||
  // Local fallback for development (Bifrost on Ken's machine on port 3033)
  (NODE_ENV !== 'production' ? 'http://localhost:3033' : undefined)
) as string;

if (!BIFROST_URL) {
  throw new Error(
    'Azen cannot start: missing BIFROST_URL. ' +
    'All LLM calls must flow through Bifrost; without it Azen cannot speak.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance — Four Pillars Gateway + Amata
// ─────────────────────────────────────────────────────────────────────────────
export const GOVERNANCE_URL = (
  process.env.GOVERNANCE_URL ||
  process.env.GOVERNANCE_SERVICE_URL ||
  (NODE_ENV !== 'production' ? 'http://localhost:3010' : undefined)
) as string;

if (!GOVERNANCE_URL) {
  throw new Error(
    'Azen cannot start: missing GOVERNANCE_URL. ' +
    'Amata and the Four Pillars Gateway live in Governance; without it Azen cannot listen.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chronicles — stone of remembrance
// ─────────────────────────────────────────────────────────────────────────────
export const CHRONICLES_URL = (
  process.env.CHRONICLES_URL ||
  process.env.CHRONICLES_SERVICE_URL ||
  (NODE_ENV !== 'production' ? 'http://localhost:3014' : undefined)
) as string;

// ─────────────────────────────────────────────────────────────────────────────
// NESHAMAH — Sabbath status (optional for Conception; required for Implantation)
// ─────────────────────────────────────────────────────────────────────────────
export const NESHAMAH_SERVICE_URL =
  process.env.NESHAMAH_SERVICE_URL ||
  process.env.NESHAMAH_URL ||
  (NODE_ENV !== 'production' ? 'http://localhost:3009' : undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Logging level
// ─────────────────────────────────────────────────────────────────────────────
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Summary printable on startup. Never logs secrets — only URL hosts and presence flags.
 */
export function configSummary(): string {
  const dbHost = (() => {
    try {
      return new URL(DATABASE_URL).host;
    } catch {
      return '<invalid>';
    }
  })();
  const bifrostHost = (() => {
    try {
      return new URL(BIFROST_URL).host;
    } catch {
      return '<invalid>';
    }
  })();
  const govHost = (() => {
    try {
      return new URL(GOVERNANCE_URL).host;
    } catch {
      return '<invalid>';
    }
  })();
  return [
    `port=${PORT}`,
    `env=${NODE_ENV}`,
    `db=${dbHost}`,
    `bifrost=${bifrostHost}`,
    `governance=${govHost}`,
    `neshamah=${NESHAMAH_SERVICE_URL ? 'configured' : 'unset (Sabbath gate disabled)'}`,
  ].join(' | ');
}
