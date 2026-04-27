/**
 * End-to-End Nervous System Verification
 * Phase 1: Verify all wired services can receive signals
 */

interface ServiceConfig {
  name: string;
  localPort: number;
  role: string;
}

const SERVICES: ServiceConfig[] = [
  { name: 'governance', localPort: 3010, role: 'The Brain' },
  { name: 'noteiq', localPort: 3000, role: 'The Origin Womb' },
  { name: 'immune', localPort: 3030, role: 'The Immune System' },
  { name: 'avodah', localPort: 3008, role: 'The Hands of Work' },
  { name: 'azionagent', localPort: 3020, role: 'The Desktop Agent' },
  { name: 'next2me-api', localPort: 3019, role: 'Relationships' },
  { name: 'contractoriq', localPort: 3017, role: 'The Marketplace' },
  { name: 'seekersway-api', localPort: 3011, role: 'Spiritual Journeys' },
  { name: 'pipeline', localPort: 3010, role: 'The Pipeline' },
  { name: 'conscious-protocol', localPort: 3023, role: 'The Daily Rhythm' },
  { name: 'legal', localPort: 3017, role: 'The Law' },
  { name: 'mba', localPort: 3014, role: 'The Architect' },
  { name: 'marketing', localPort: 3015, role: 'Creative — Marketing' },
  { name: 'art', localPort: 3016, role: 'Creative — Visual' },
  { name: 'music', localPort: 3013, role: 'Creative — Audio' },
  { name: 'production', localPort: 3012, role: 'Creative — Orchestration' },
  { name: 'chronicles', localPort: 3012, role: 'Memory — Historical Records' },
  { name: 'movies', localPort: 3014, role: 'Creative — Film' },
  { name: 'games', localPort: 3012, role: 'Creative — Interactive' },
  { name: 'scripture', localPort: 3021, role: 'Scripture Intelligence' },
  { name: 'ideaforge', localPort: 3000, role: 'The Front Door' },
  { name: 'discovery', localPort: 3022, role: 'Vesica Piscis' },
  { name: 'yad', localPort: 3018, role: 'The Hands' },
  { name: 'kohelet', localPort: 3015, role: 'The Voice' },
  { name: 'zakhor', localPort: 3025, role: 'The Hippocampus' },
  { name: 'binah', localPort: 3026, role: 'Deep Current' },
  { name: 'sentinel-service', localPort: 3027, role: 'The Watchman' },
  { name: 'wisdom-mirror', localPort: 3030, role: 'The Holy of Holies' },
  { name: 'wombcore', localPort: 3028, role: 'The Dwelling Place' },
  { name: 'azen', localPort: 3029, role: 'The Listening Field' },
  { name: 'tenant-nursery', localPort: 3031, role: 'The Nursery' },
  { name: 'transcription', localPort: 3032, role: 'The Clinical Ear' },
  { name: 'voice', localPort: 3033, role: 'The Mouth' },
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
  healthy: boolean;
  signalOk: boolean;
  responseTimeMs: number;
  error?: string;
  responseBody?: string;
}

async function testService(svc: ServiceConfig): Promise<TestResult> {
  const start = Date.now();
  const baseUrl = `http://localhost:${svc.localPort}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const healthy = healthRes.ok;

    if (!healthy) {
      return {
        service: svc.name,
        port: svc.localPort,
        healthy: false,
        signalOk: false,
        responseTimeMs: Date.now() - start,
        error: `Health check failed: ${healthRes.status}`,
      };
    }

    // 2. Signal check
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
      healthy,
      signalOk,
      responseTimeMs: Date.now() - start,
      responseBody: bodyText.substring(0, 200),
    };
  } catch (err: any) {
    return {
      service: svc.name,
      port: svc.localPort,
      healthy: false,
      signalOk: false,
      responseTimeMs: Date.now() - start,
      error: err.message || 'Connection refused',
    };
  }
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  TEMPLE NERVOUS SYSTEM — END-TO-END VERIFICATION');
  console.log('  Phase 1: All services wired, testing signal flow');
  console.log('═════════════════════════════════════════════════════════════════\n');

  const results: TestResult[] = [];

  for (const svc of SERVICES) {
    const result = await testService(svc);
    results.push(result);

    const status = result.signalOk ? '✅ ALIVE' : result.healthy ? '🟡 HEALTHY but signal failed' : '🔴 SILENT';
    console.log(`${status.padEnd(30)} ${result.service.padEnd(20)} port ${result.port} (${result.responseTimeMs}ms)`);
    if (result.error) {
      console.log(`    → ${result.error}`);
    }
  }

  const alive = results.filter(r => r.signalOk);
  const healthyOnly = results.filter(r => r.healthy && !r.signalOk);
  const silent = results.filter(r => !r.healthy);

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  ✅ Signal flowing:     ${alive.length} / ${results.length}`);
  console.log(`  🟡 Healthy but no signal: ${healthyOnly.length}`);
  console.log(`  🔴 Silent (not running):  ${silent.length}`);
  console.log('═════════════════════════════════════════════════════════════════');

  if (alive.length === results.length) {
    console.log('\n🎉 ALL SERVICES ALIVE — Phase 1 nerve is fully operational');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${results.length - alive.length} services need attention`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test harness failed:', err);
  process.exit(1);
});
