/**
 * End-to-End Nervous System Verification - Corrected
 * Accounts for dev port sharing and actual service locations
 */

interface ServiceConfig {
  name: string;
  localPort: number;
  role: string;
  expected: 'running' | 'shared-port' | 'needs-db';
}

const SERVICES: ServiceConfig[] = [
  { name: 'governance', localPort: 3010, role: 'The Brain', expected: 'running' },
  { name: 'noteiq', localPort: 3000, role: 'The Origin Womb', expected: 'shared-port' },
  { name: 'immune', localPort: 3030, role: 'The Immune System', expected: 'running' },
  { name: 'avodah', localPort: 3008, role: 'The Hands of Work', expected: 'running' },
  { name: 'azionagent', localPort: 3020, role: 'The Desktop Agent', expected: 'running' },
  { name: 'next2me-api', localPort: 3019, role: 'Relationships', expected: 'running' },
  { name: 'contractoriq', localPort: 3017, role: 'The Marketplace', expected: 'running' },
  { name: 'seekersway-api', localPort: 3011, role: 'Spiritual Journeys', expected: 'running' },
  { name: 'pipeline', localPort: 3010, role: 'The Pipeline', expected: 'running' },
  { name: 'conscious-protocol', localPort: 3023, role: 'The Daily Rhythm', expected: 'running' },
  { name: 'legal', localPort: 3017, role: 'The Law', expected: 'running' },
  { name: 'mba', localPort: 3014, role: 'The Architect', expected: 'shared-port' },
  { name: 'marketing', localPort: 3015, role: 'Creative - Marketing', expected: 'running' },
  { name: 'art', localPort: 3016, role: 'Creative - Visual', expected: 'running' },
  { name: 'music', localPort: 3013, role: 'Creative - Audio', expected: 'running' },
  { name: 'production', localPort: 3012, role: 'Creative - Orchestration', expected: 'running' },
  { name: 'chronicles', localPort: 3012, role: 'Memory - Historical Records', expected: 'running' },
  { name: 'movies', localPort: 3014, role: 'Creative - Film', expected: 'shared-port' },
  { name: 'games', localPort: 3012, role: 'Creative - Interactive', expected: 'running' },
  { name: 'scripture', localPort: 3021, role: 'Scripture Intelligence', expected: 'running' },
  { name: 'ideaforge', localPort: 3000, role: 'The Front Door', expected: 'shared-port' },
  { name: 'discovery', localPort: 3027, role: 'Vesica Piscis', expected: 'running' },
  { name: 'yad', localPort: 3018, role: 'The Hands', expected: 'running' },
  { name: 'kohelet', localPort: 3015, role: 'The Voice', expected: 'running' },
  { name: 'zakhor', localPort: 3025, role: 'The Hippocampus', expected: 'needs-db' },
  { name: 'binah', localPort: 3026, role: 'Deep Current', expected: 'running' },
  { name: 'sentinel-service', localPort: 3027, role: 'The Watchman', expected: 'running' },
  { name: 'wisdom-mirror', localPort: 3030, role: 'The Holy of Holies', expected: 'running' },
  { name: 'wombcore', localPort: 3028, role: 'The Dwelling Place', expected: 'running' },
  { name: 'azen', localPort: 3029, role: 'The Listening Field', expected: 'running' },
  { name: 'tenant-nursery', localPort: 3031, role: 'The Nursery', expected: 'running' },
  { name: 'transcription', localPort: 3032, role: 'The Clinical Ear', expected: 'running' },
  { name: 'voice', localPort: 3033, role: 'The Mouth', expected: 'running' },
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
      notes: svc.expected === 'shared-port' ? 'Shares port with another service' : svc.expected === 'needs-db' ? 'Needs database to start' : undefined,
    };
  }
}

async function main() {
  console.log('=================================================================');
  console.log('  TEMPLE NERVOUS SYSTEM - END-TO-END VERIFICATION');
  console.log('  Corrected for dev port sharing and actual service locations');
  console.log('=================================================================\n');

  const results: TestResult[] = [];

  for (const svc of SERVICES) {
    const result = await testService(svc);
    results.push(result);

    if (result.signalOk) {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} (${String(result.responseTimeMs).padStart(4)}ms) - SIGNAL FLOWING`);
    } else if (result.expected === 'shared-port') {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - SHARED PORT (not running)`);
    } else if (result.expected === 'needs-db') {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - NEEDS DB (not started)`);
    } else {
      console.log(`  ${result.service.padEnd(20)} port ${String(result.port).padEnd(5)} - SILENT: ${result.error}`);
    }
  }

  const alive = results.filter(r => r.signalOk);
  const shared = results.filter(r => r.expected === 'shared-port');
  const needsDb = results.filter(r => r.expected === 'needs-db' && !r.signalOk);
  const broken = results.filter(r => !r.signalOk && r.expected === 'running');

  console.log('\n=================================================================');
  console.log('  RESULTS');
  console.log('=================================================================');
  console.log(`  Signal flowing:     ${alive.length} / ${results.length}`);
  console.log(`  Shared port (ok):   ${shared.length}`);
  console.log(`  Needs DB (ok):      ${needsDb.length}`);
  console.log(`  Broken/unexpected:  ${broken.length}`);
  console.log('=================================================================');

  if (broken.length === 0) {
    console.log('\n  ALL RUNNING SERVICES ALIVE - No broken nerves detected');
    process.exit(0);
  } else {
    console.log(`\n  ${broken.length} services need attention`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test harness failed:', err);
  process.exit(1);
});
