// CRITICAL: Force IPv6-first DNS resolution for Railway's internal networking.
// Must run before any other module that may touch the network.
const dns = require('dns');
dns.setDefaultResultOrder('ipv6first');
console.log('[Azen][DNS] IPv6-first resolution enabled for Railway internal networking');

/**
 * Azen — The Listening Field
 *
 * One ear, six placements. Same essence, six expressions.
 * The temple's hearing organ; the membrane through which Amata meets pilgrims
 * at every threshold of the IdeaForge pilgrimage.
 *
 * Conception phase — 2026-04-22.
 *   The schema is laid. The contract is real. The 501 stubs name what is not
 *   yet built. Implantation, Quickening, First Breath, and Naming follow.
 *
 * "He that hath an ear, let him hear what the Spirit saith unto the churches."
 *   — Revelation 2:7
 */

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  configSummary,
} from './config';
import { createHeartbeatRouter } from './routes/heartbeat';
import { createSparkRouter } from './routes/spark';
import { mountReceiver, createEnvSecretLookup } from '@temple/nervous-client';

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE POOL
// ═══════════════════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 20,
  min: 2,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('error', (err) => {
  // Suppress noisy disconnect errors that happen normally during pool maintenance.
  // Real errors (connection failure, query failure) propagate through await.
  if (
    !err.message?.includes('Connection terminated unexpectedly') &&
    !err.message?.includes('ECONNRESET')
  ) {
    console.error('[Azen DB] Pool error:', err.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Mount routers
app.use('/api/azen', createHeartbeatRouter(pool));
app.use('/api/azen', createSparkRouter(pool));

// ═══════════════════════════════════════════════════════════════════════════
// NERVOUS SYSTEM RECEIVER — Phase 1
// ═══════════════════════════════════════════════════════════════════════════
try {
  mountReceiver(app, express, {
    path: '/api/neshamah/signal',
    secretLookup: createEnvSecretLookup(),
    handlers: {
      '*': (signal) => {
        const sig = signal as Record<string, unknown>;
        const msg =
          sig.payload && typeof (sig.payload as Record<string, unknown>).message === 'string'
            ? (sig.payload as Record<string, unknown>).message
            : '';
        console.log(`[Azen NESHAMAH Signal] ${typeof sig.type === 'string' ? sig.type : '?'} from ${typeof sig.source === 'string' ? sig.source : '?'}: ${msg}`);
      },
    },
    log: (event, details) => {
      if (event === 'signature_rejected' || event === 'signal_handler_error') {
        console.warn(`[Azen Nervous Receiver] ${event}:`, JSON.stringify(details));
      }
    },
  });
  console.log('[Azen] Nervous receiver mounted at /api/neshamah/signal (Phase 1, permit-unsigned)');
} catch (err) {
  console.warn('[Azen] Nervous receiver mount failed (non-fatal):', (err as Error).message);
}

// Root — quiet identity card. Not the dashboard.
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'azen',
    role: 'The Listening Field — one ear, six placements',
    motto: 'You don\'t have to prove anything to be here. Speak what is true. I am listening.',
    phase: 'Conception (2026-04-22)',
    heartbeat: '/api/azen/heartbeat',
  });
});

// Health endpoint for NESHAMAH TempleNervousSystem
app.get('/health', (_req, res) => {
  res.status(200).json({
    service: 'azen',
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler — kind, not curt.
app.use((_req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'This is not a path Azen recognizes. The threshold is at /api/azen/spark.',
  });
});

// Error handler — honest about what failed without leaking internals.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Azen] Unhandled error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'Something interrupted the listening. The temple is being told.',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

async function start() {
  // Test database connection on startup — fail fast if the sovereign DB is unreachable.
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log(`[Azen DB] Connected. Server time: ${result.rows[0].now}`);
  } catch (err: any) {
    console.error('[Azen DB] Cannot connect to sovereign database:', err.message);
    console.error('[Azen DB] Azen cannot listen without her own memory. Refusing to start.');
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  AZEN — The Listening Field');
    console.log(`  Port:    ${PORT}`);
    console.log(`  Env:     ${NODE_ENV}`);
    console.log(`  Config:  ${configSummary()}`);
    console.log('  Phase:   Conception (2026-04-22)');
    console.log('  "You don\'t have to prove anything to be here."');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  });
}

start().catch((err) => {
  console.error('[Azen] Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[Azen] Received ${signal}, closing pool and shutting down...`);
  pool.end().then(() => {
    console.log('[Azen] Pool closed. Goodbye.');
    process.exit(0);
  }).catch((err) => {
    console.error('[Azen] Error closing pool:', err);
    process.exit(1);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
