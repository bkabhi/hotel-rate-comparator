/**
 * Activity tests: real HTTP against the mock supplier server, running inside
 * Temporal's MockActivityEnvironment so `Context.current()` behaves as it does
 * in the worker (attempt number, cancellation signal, logging).
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MockActivityEnvironment } from '@temporalio/testing';

import { createSupplierApp } from '../../src/suppliers/app';
import { fetchSupplierRates } from '../../src/temporal/activities';
import { config } from '../../src/config';
import { behaviorRegistry, flakyLedger } from '../../src/suppliers/behavior';
import type { SearchRequest, SupplierFetchResult } from '../../src/shared/types';
import { SEARCH } from '../helpers/fixtures';

let server: Server;
let originalBaseUrl: string;

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = createSupplierApp().listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  originalBaseUrl = config.suppliers.baseUrl;
  // `config` is deeply readonly by type only; the activity reads it at call time.
  (config.suppliers as { baseUrl: string }).baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  (config.suppliers as { baseUrl: string }).baseUrl = originalBaseUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  behaviorRegistry.reset();
  flakyLedger.reset();
});

function run(
  request: SearchRequest,
  supplier: 'A' | 'B' = 'A',
  env = new MockActivityEnvironment(),
): Promise<SupplierFetchResult> {
  return env.run(fetchSupplierRates, supplier, request, 'test-key');
}

describe('fetchSupplierRates', () => {
  it('normalises a supplier response into tagged offers', async () => {
    const result = await run(SEARCH);

    expect(result.supplier).toBe('A');
    expect(result.attempt).toBe(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.offers.length).toBeGreaterThan(0);

    for (const offer of result.offers) {
      expect(offer.supplier).toBe('A');
      expect(offer.supplierName).toBe('Sarai Travel');
      expect(offer.nights).toBe(3);
      expect(offer.pricePerNight).toBeCloseTo(offer.price / 3, 2);
    }
  });

  it('treats an empty hotel list as a valid answer, not a failure', async () => {
    const result = await run({ ...SEARCH, simulation: { A: { kind: 'empty' } } });
    expect(result.offers).toEqual([]);
  });

  it('throws a retryable failure when the supplier returns 5xx', async () => {
    await expect(run({ ...SEARCH, simulation: { A: { kind: 'error', status: 503 } } })).rejects.toThrow(
      /Sarai Travel returned HTTP 503/,
    );
  });

  it('throws when the supplier host is unreachable', async () => {
    const previous = config.suppliers.baseUrl;
    (config.suppliers as { baseUrl: string }).baseUrl = 'http://127.0.0.1:1';
    try {
      await expect(run(SEARCH)).rejects.toThrow(/did not respond/);
    } finally {
      (config.suppliers as { baseUrl: string }).baseUrl = previous;
    }
  });

  it('reports the Temporal attempt number it ran on', async () => {
    const env = new MockActivityEnvironment({ attempt: 3 });
    const result = await run(SEARCH, 'A', env);
    expect(result.attempt).toBe(3);
  });

  it('aborts the in-flight HTTP request when the activity is cancelled', async () => {
    const env = new MockActivityEnvironment();
    const pending = run(
      { ...SEARCH, simulation: { A: { kind: 'slow', delayMs: 5_000 } } },
      'A',
      env,
    );

    // What the workflow's per-supplier deadline does to a stalled activity.
    setTimeout(() => env.cancel('CANCELLED'), 100);

    const started = Date.now();
    await expect(pending).rejects.toBeDefined();
    // Rejects on cancellation rather than waiting out the supplier's 5s delay.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('lets each supplier read its own shelf of inventory', async () => {
    const [a, b] = await Promise.all([run(SEARCH, 'A'), run(SEARCH, 'B')]);
    expect(a.offers.map((o) => o.hotelId)).not.toEqual(b.offers.map((o) => o.hotelId));
    expect(b.offers.every((o) => o.supplierName === 'Nivaas Rooms')).toBe(true);
  });
});
