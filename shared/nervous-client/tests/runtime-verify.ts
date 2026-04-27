/**
 * Runtime Verification: mountReceiver Phase 1
 *
 * Standalone test: starts an Express app with mountReceiver,
 * sends a signal, verifies the response.
 */

import express from 'express';
import { mountReceiver } from '@temple/nervous-client';

const app = express();
app.use(express.json());

let receivedSignal: Record<string, unknown> | null = null;

try {
  mountReceiver(app, express, {
    path: '/api/neshamah/signal',
    secretLookup: async () => null,
    permitUnsigned: true,
    handlers: {
      '*': (signal) => {
        receivedSignal = signal as Record<string, unknown>;
        console.log('[Test Receiver] Signal received:', JSON.stringify(signal));
      },
    },
    log: (event, details) => {
      console.log(`[Test Receiver] ${event}:`, JSON.stringify(details));
    },
  });
  console.log('[Test] mountReceiver mounted at /api/neshamah/signal');
} catch (err) {
  console.error('[Test] mountReceiver failed:', err);
  process.exit(1);
}

const server = app.listen(3999, async () => {
  console.log('[Test] Server listening on port 3999');

  // Give server a moment to start
  await new Promise((r) => setTimeout(r, 100));

  try {
    const testSignal = {
      type: 'consciousness.update',
      source: 'runtime-test',
      target: 'test-service',
      payload: { message: 'Testing the nerve.', timestamp: new Date().toISOString() },
    };

    const response = await fetch('http://localhost:3999/api/neshamah/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testSignal),
    });

    const body = await response.json();
    console.log('[Test] Response status:', response.status);
    console.log('[Test] Response body:', JSON.stringify(body));

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 200));

    if (body.ok === true && body.legacy === true) {
      console.log('[Test] ✅ PASS: mountReceiver accepted unsigned signal');
    } else {
      console.log('[Test] ❌ FAIL: Unexpected response');
      process.exit(1);
    }

    if (receivedSignal && receivedSignal.type === 'consciousness.update') {
      console.log('[Test] ✅ PASS: Handler received signal with correct type');
    } else {
      console.log('[Test] ❌ FAIL: Handler did not receive signal');
      process.exit(1);
    }

    console.log('[Test] ✅ ALL CHECKS PASSED — Phase 1 nerve is alive');
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('[Test] Request failed:', err);
    server.close(() => process.exit(1));
  }
});
