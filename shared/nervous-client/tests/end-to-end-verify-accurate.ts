/**
 * End-to-End Nervous System Verification — ACCURATE
 * Built from actual .env and server.ts files across all services.
 * "A wire that carries nothing is not a nerve."
 */

interface ServiceConfig {
  name: string;
  localPort: number;
  role: string;
  expected: 'running' | 'shared-port' | 'needs-db' | 'not-built';
}

// ── Declared from actual service .env / server.ts files ──────────────────────
const SERVICES: ServiceConfig[] = [
  // Core — running
  { name: 'scripture', localPort: 3001, role: 'Scripture Intelligence', expected: 'running' },
  { name: 'noteiq', localPort: 3008, role: 'The Origin Womb', expected: 'running' },
  { name: 'governance', localPort: 3010, role: 'The Brain', expected: 'running' },
  { name: 'marketing', localPort: 3011, role: 'Creative — Marketing', expected: 'running' },
  { name: 'music', localPort: 3012, role: 'Creative — Audio', expected: 'running' },
  { name: 'avodah', localPort: 3013, role: 'The Hands of Work', expected: 'running' },
  { name: 'art', localPort: 3015, role: 'Creative — Visual', expected: 'running' },
  { name: 'movies', localPort: 3016, role: 'Creative — Film', expected: 'running' },
  { name: 'production', localPort: 3017, role: 'Creative — Orchestration', expected: 'running' },
  { name: 'yad', localPort: 3018, role: 'The Hands', expected: 'running' },
  { name: 'games', localPort: 3019, role: 'Creative — Interactive', expected: 'running' },
  { name: 'loom', localPort: 3020, role: 'The Loom — Model Serving', expected: 'running' },
  { name: 'legal', localPort: 3021, role: 'The Law', expected: 'running' },
  { name: 'conscious-protocol', localPort: 3023, role: 'The Daily Rhythm', expected: 'running' },
  { name: 'binah', localPort: 3026, role: 'Deep Current', expected: 'running' },
  { name: 'discovery', localPort: 3027, role: 'Vesica Piscis', expected: 'running' },
  { name: 'next2me-api', localPort: 3028, role: 'Relationships', expected: 'running' },
  { name: 'chronicles', localPort: 3029, role: 'Memory — Historical Records', expected: 'running' },
  { name: 'immune', localPort: 3030, role: 'The Immune System', expected: 'running' },
  { name: 'contractoriq', localPort: 3031, role: 'The Marketplace', expected: 'running' },
  { name: 'wombcore', localPort: 3033, role: 'The Dwelling Place', expected: 'running' },
  { name: 'transcription', localPort: 3035, role: 'The Clinical Ear', expected: 'running' },

  // Shared ports (dev: only primary runs)
  { name: 'tenant-nursery', localPort: 3010, role: 'The Nursery', expected: 'shared-port' },
  { name: 'azionagent', localPort: 3020, role: 'The Desktop Agent', expected: 'shared-port' },
  { name: 'azioncall', localPort: 3020, role: 'AzionCall', expected: 'shared-port' },
  { name: 'ear', localPort: 3031, role: 'The Ear', expected: 'shared-port' },
  { name: 'wisdom-mirror', localPort: 3030, role: 'The Holy of Holies', expected: 'shared-port' },
  { name: 'azen', localPort: 3032, role: 'The Listening Field', expected: 'shared-port' },
  { name: 'voice', localPort: 3032, role: 'The Mouth', expected: 'shared-port' },

  // Unique ports, not running locally
  { name: 'neshamah', localPort: 3009, role: 'The Breath', expected: 'running' },
  { name: 'pipeline', localPort: 3022, role: 'The Pipeline', expected: 'running' },
  { name: 'seekersway-api', localPort: 3024, role: 'Spiritual Journeys', expected: 'running' },
  { name: 'sentinel-service', localPort: 3034, role: 'The Watchman', expected: 'running' },

  // Needs database
  { name: 'zakhor', localPort: 3025, role: 'The Hippocampus', expected: 'needs-db' },

  // Not built / external
  { name: 'ideaforge', localPort: 3000, role: 'The Front Door', expected: 'not-built' },
  { name: 'mba', localPort: 3014, role: 'The Architect', expected: 'running' },
  { name: 'kohelet', localPort: 3015, role: 'The Voice (Mautic)', expected: 'not-built' },
];

const testSignal = {
  type: 'nervous.pulse',
  source: 'test-harness',
  target: 'all-services',
  payload: { message: 'Testing the nerve. Are you alive?', timestamp: new Date().toISOString() },
};

interface TestResult {
  service: string;
  port: number;
  expected: string;
  signalOk: boolean;
  responseTimeMs: number;
  error?: string;
  notes?: string;
}

async function testService(svc: ServiceConfig): Promise<TestResult> {
  const start = Date.now();
  const baseUrl = `http://localhost:${svc.localPort}`;

  try {
    const signalRes = await fetch(`${baseUrl}/api/neshamah/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testSignal),
      signal: AbortSignal.timeout(5000),
    });

    const bodyText = await signalRes.text();
    let signalOk = false;
    try {
      const body = JSON.parse(bodyText);
      signalOk = body.ok === true && body.legacy === true;
    } catch {
      signalOk = false;
    }

    return {
      service: svc.name,
      port: svc.localPort,
      expected: svc.expected,
      signalOk,
      responseTimeMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      service: svc.name,
      port: svc.localPort,
      expected: svc.expected,
      signalOk: false,
      responseTimeMs: Date.now() - start,
      error: err.message || 'Connection refused',
      notes:
        svc.expected === 'shared-port'
          ? 'Shares port with another service'
          : svc.expected === 'needs-db'
            ? 'Needs database to start'
            : svc.expected === 'not-built'
              ? 'Not built or external service'
              : undefined,
    };
  }
}

async function main() {
  console.log('=================================================================');
  console.log('  TEMPLE NERVOUS SYSTEM — END-TO-END VERIFICATION');
  console.log('  Accurate port map from actual service .env / server.ts files');
  console.log('=================================================================\n');

  const results: TestResult[] = [];

  for (const svc of SERVICES) {
    const result = await testService(svc);
    results.push(result);

    if (result.expected === 'shared-port') {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - SHARED PORT (not running)`);
    } else if (result.expected === 'not-built') {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - NOT BUILT (deferred)`);
    } else if (result.expected === 'needs-db') {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - NEEDS DB (not started)`);
    } else if (result.signalOk) {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} (${String(result.responseTimeMs).padStart(4)}ms) - SIGNAL FLOWING`);
    } else {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - SILENT: ${result.error}`);
    }
  }

  const alive = results.filter((r) => r.signalOk);
  const shared = results.filter((r) => r.expected === 'shared-port');
  const needsDb = results.filter((r) => r.expected === 'needs-db' && !r.signalOk);
  const notBuilt = results.filter((r) => r.expected === 'not-built' && !r.signalOk);
  const broken = results.filter((r) => !r.signalOk && r.expected === 'running');

  console.log('\n=================================================================');
  console.log('  RESULTS');
  console.log('=================================================================');
  console.log(`  Signal flowing:     ${alive.length} / ${results.length}`);
  console.log(`  Shared port (ok):   ${shared.length}`);
  console.log(`  Needs DB (ok):      ${needsDb.length}`);
  console.log(`  Not built (ok):     ${notBuilt.length}`);
  console.log(`  Broken/unexpected:  ${broken.length}`);
  console.log('=================================================================');

  if (broken.length === 0) {
    console.log('\n  ALL RUNNING SERVICES ALIVE — No broken nerves detected');
    process.exit(0);
  } else {
    console.log(`\n  ${broken.length} services need attention`);
    for (const b of broken) {
      console.log(`    - ${b.service} (port ${b.port}): ${b.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test harness failed:', err);
  process.exit(1);
});
