/**
 * Heartbeat — honest health, not theater health.
 *
 * Reports on Azen's actual connectivity to her sister services:
 *   - Database (Postgres-Azen)
 *   - Bifrost (LLM gateway — without it Azen cannot speak)
 *   - Governance (Four Pillars Gateway + Amata — without it Azen cannot listen)
 *
 * Returns:
 *   200 with status='alive'  if all three are reachable
 *   200 with status='degraded' if some sister is unreachable (Azen still answers heartbeat
 *                              but cannot serve real sparks)
 *   503 with status='down' if the database is unreachable (Azen herself cannot function)
 *
 * The distinction matters: a degraded Azen tells the truth about which organ is hurt,
 * rather than pretending everything is fine.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { BIFROST_URL, GOVERNANCE_URL, configSummary } from '../config';

const STARTED_AT = new Date();

interface HeartbeatChecks {
  database: 'reachable' | 'unreachable' | 'unknown';
  bifrost: 'reachable' | 'unreachable' | 'unknown';
  governance: 'reachable' | 'unreachable' | 'unknown';
}

async function checkDatabase(pool: Pool): Promise<HeartbeatChecks['database']> {
  try {
    await pool.query('SELECT 1');
    return 'reachable';
  } catch {
    return 'unreachable';
  }
}

async function checkUrl(url: string, timeoutMs: number = 3000): Promise<'reachable' | 'unreachable'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    // Any HTTP response (even 404) means the host is reachable.
    return res.status >= 0 ? 'reachable' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function createHeartbeatRouter(pool: Pool): Router {
  const router = Router();

  router.get('/heartbeat', async (_req: Request, res: Response) => {
    const checks: HeartbeatChecks = {
      database: 'unknown',
      bifrost: 'unknown',
      governance: 'unknown',
    };

    // Run checks in parallel — heartbeat should be fast
    const [db, bif, gov] = await Promise.all([
      checkDatabase(pool),
      checkUrl(BIFROST_URL),
      checkUrl(GOVERNANCE_URL),
    ]);

    checks.database = db;
    checks.bifrost = bif;
    checks.governance = gov;

    const dbDown = db !== 'reachable';
    const sisterDown = bif !== 'reachable' || gov !== 'reachable';

    let status: 'alive' | 'degraded' | 'down';
    let httpCode: number;
    if (dbDown) {
      status = 'down';
      httpCode = 503;
    } else if (sisterDown) {
      status = 'degraded';
      httpCode = 200;
    } else {
      status = 'alive';
      httpCode = 200;
    }

    res.status(httpCode).json({
      service: 'azen',
      status,
      checks,
      uptime_seconds: Math.floor((Date.now() - STARTED_AT.getTime()) / 1000),
      started_at: STARTED_AT.toISOString(),
      config: configSummary(),
    });
  });

  return router;
}
