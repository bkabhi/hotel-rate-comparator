/**
 * Workflow tests for every scenario in the brief.
 *
 * These run against Temporal's time-skipping test server with the supplier
 * activity mocked, so retry backoffs and the 5-second supplier deadline resolve
 * instantly instead of in real time. The workflow code under test is the exact
 * code the worker runs.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, type Runtime } from '@temporalio/worker';
import { ApplicationFailure, CancelledFailure, WorkflowFailedError } from '@temporalio/client';

import { hotelSearchWorkflow, type HotelSearchInput } from '../../src/temporal/workflows';
import { searchProgressQuery } from '../../src/temporal/shared';
import { SupplierUnavailableError } from '../../src/shared/errors';
import type {
  SearchProgress,
  SearchResult,
  SupplierFetchResult,
  SupplierId,
  SupplierOutcome,
} from '../../src/shared/types';
import { NIGHTS, SEARCH, fetchResult, offer } from '../helpers/fixtures';

jest.setTimeout(120_000);

const TASK_QUEUE = 'hotel-search-test';

/** Compressed policy: the deadline still dominates, but nothing waits for real. */
const TEST_POLICY: HotelSearchInput['policy'] = {
  supplierDeadlineMs: 5_000,
  attemptTimeoutMs: 5_000,
  maxAttempts: 3,
  retryInitialIntervalMs: 100,
  retryMaxIntervalMs: 200,
};

/** Per-supplier behaviour the mocked activity plays out for one test. */
type SupplierScript = () =>
  | Promise<SupplierFetchResult>
  | SupplierFetchResult;

let env: TestWorkflowEnvironment;
let scripts: Record<SupplierId, SupplierScript>;

beforeAll(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await env?.teardown();
});

beforeEach(() => {
  scripts = {
    A: () => fetchResult('A', []),
    B: () => fetchResult('B', []),
  };
});

/** Runs a workflow to completion against a worker wired to the current scripts. */
async function runWorkflow(
  input: Partial<HotelSearchInput> = {},
  onStarted?: (handle: Awaited<ReturnType<typeof env.client.workflow.start>>) => Promise<void>,
): Promise<SearchResult> {
  const worker = await makeWorker();

  return worker.runUntil(async () => {
    const handle = await env.client.workflow.start(hotelSearchWorkflow, {
      workflowId: `test-${randomUUID()}`,
      taskQueue: TASK_QUEUE,
      args: [{ request: SEARCH, policy: TEST_POLICY, ...input }],
    });
    if (onStarted) await onStarted(handle);
    return (await handle.result()) as SearchResult;
  });
}

async function makeWorker(): Promise<Worker> {
  return Worker.create({
    connection: env.nativeConnection,
    taskQueue: TASK_QUEUE,
    workflowsPath: path.join(__dirname, '../../src/temporal/workflows.ts'),
    activities: {
      async fetchSupplierRates(supplier: SupplierId): Promise<SupplierFetchResult> {
        return scripts[supplier]();
      },
    },
  });
}

function outcomeFor(result: SearchResult, supplier: SupplierId): SupplierOutcome {
  const found = result.suppliers.find((entry) => entry.supplier === supplier);
  if (!found) throw new Error(`No outcome recorded for supplier ${supplier}`);
  return found;
}

/** Hangs until the workflow cancels this activity, then reports the cancellation. */
async function hangUntilCancelled(): Promise<never> {
  await Context.current().cancelled;
  throw new Error('unreachable: cancellation always rejects');
}

/** Fails `times` times, then answers with `offers`. */
function failsThenSucceeds(supplier: SupplierId, times: number, offers = [offer(supplier, 300)]): SupplierScript {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls <= times) {
      throw new SupplierUnavailableError(`${supplier} degraded (call ${calls})`);
    }
    return fetchResult(supplier, offers, { attempt: calls });
  };
}

// ===========================================================================
// Basic scenarios
// ===========================================================================

describe('basic scenarios', () => {
  it('returns Supplier A’s result when A is cheaper', async () => {
    scripts.A = () => fetchResult('A', [offer('A', 384), offer('A', 492)]);
    scripts.B = () => fetchResult('B', [offer('B', 423)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'A', price: 384 });
    expect(result.offers).toHaveLength(3);
    expect(result.offers.map((o) => o.price)).toEqual([384, 423, 492]);
  });

  it('returns Supplier B’s result when B is cheaper', async () => {
    scripts.A = () => fetchResult('A', [offer('A', 512)]);
    scripts.B = () => fetchResult('B', [offer('B', 459)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'B', price: 459 });
  });

  it('breaks an exact tie deterministically in favour of Supplier A', async () => {
    scripts.A = () => fetchResult('A', [offer('A', 558)]);
    scripts.B = () => fetchResult('B', [offer('B', 558)]);

    // Run it repeatedly: a tie must never resolve by whoever answered first.
    for (let i = 0; i < 3; i += 1) {
      const result = await runWorkflow();
      expect(result.best).toMatchObject({ supplier: 'A', price: 558 });
      expect(result.offers[0]!.supplier).toBe('A');
    }
  });

  it('returns Supplier B’s result when Supplier A fails outright', async () => {
    scripts.A = () => {
      throw new SupplierUnavailableError('Sarai Travel returned HTTP 503');
    };
    scripts.B = () => fetchResult('B', [offer('B', 611)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'B', price: 611 });
    expect(outcomeFor(result, 'A')).toMatchObject({ status: 'FAILED', offerCount: 0 });
    expect(outcomeFor(result, 'A').error).toContain('503');
  });

  it('fails the search when both suppliers fail', async () => {
    scripts.A = () => {
      throw new SupplierUnavailableError('Sarai Travel returned HTTP 503');
    };
    scripts.B = () => {
      throw new SupplierUnavailableError('Nivaas Rooms returned HTTP 500');
    };

    const failure = await runWorkflow().catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(WorkflowFailedError);
    const cause = (failure as WorkflowFailedError).cause;
    expect(cause).toBeInstanceOf(ApplicationFailure);
    expect((cause as ApplicationFailure).type).toBe('ALL_SUPPLIERS_FAILED');
    expect((cause as ApplicationFailure).message).toMatch(/both suppliers failed/i);

    const details = (cause as ApplicationFailure).details?.[0] as { suppliers: SupplierOutcome[] };
    expect(details.suppliers.map((s) => s.status)).toEqual(['FAILED', 'FAILED']);
  });

  it('uses the available result when one supplier returns an empty list', async () => {
    scripts.A = () => fetchResult('A', []);
    scripts.B = () => fetchResult('B', [offer('B', 348)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'B', price: 348 });
    expect(outcomeFor(result, 'A')).toMatchObject({ status: 'EMPTY', offerCount: 0 });
    expect(outcomeFor(result, 'B')).toMatchObject({ status: 'FULFILLED', offerCount: 1 });
  });

  it('reports "No hotels found" when both suppliers return empty lists', async () => {
    scripts.A = () => fetchResult('A', []);
    scripts.B = () => fetchResult('B', []);

    const result = await runWorkflow();

    expect(result.status).toBe('NO_HOTELS');
    expect(result.best).toBeNull();
    expect(result.offers).toEqual([]);
    expect(result.message).toBe('No hotels found');
    expect(result.suppliers.map((s) => s.status)).toEqual(['EMPTY', 'EMPTY']);
  });
});

// ===========================================================================
// Advanced scenarios
// ===========================================================================

describe('advanced scenarios', () => {
  it('cancels a supplier that exceeds the 5s deadline and proceeds with the other', async () => {
    scripts.A = hangUntilCancelled;
    scripts.B = () => fetchResult('B', [offer('B', 405)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'B', price: 405 });

    const slow = outcomeFor(result, 'A');
    expect(slow.status).toBe('TIMED_OUT');
    expect(slow.error).toMatch(/No response within 5000 ms — cancelled/);
    expect(slow.offerCount).toBe(0);
  });

  it('still fails the search when the only supplier left also times out', async () => {
    scripts.A = hangUntilCancelled;
    scripts.B = hangUntilCancelled;

    const failure = await runWorkflow().catch((err: unknown) => err);
    const cause = (failure as WorkflowFailedError).cause as ApplicationFailure;

    expect(cause.type).toBe('ALL_SUPPLIERS_FAILED');
    const details = cause.details?.[0] as { suppliers: SupplierOutcome[] };
    expect(details.suppliers.map((s) => s.status)).toEqual(['TIMED_OUT', 'TIMED_OUT']);
  });

  it('succeeds when Supplier A fails twice before succeeding, within the retry policy', async () => {
    scripts.A = failsThenSucceeds('A', 2, [offer('A', 279)]);
    scripts.B = () => fetchResult('B', [offer('B', 333)]);

    const result = await runWorkflow();

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'A', price: 279 });
    expect(outcomeFor(result, 'A')).toMatchObject({ status: 'FULFILLED', attempts: 3 });
  });

  it('gives up on a supplier that keeps failing past the retry policy', async () => {
    // 3 failures with maxAttempts = 3 means the third attempt is the last.
    scripts.A = failsThenSucceeds('A', 3, [offer('A', 100)]);
    scripts.B = () => fetchResult('B', [offer('B', 333)]);

    const result = await runWorkflow();

    expect(result.best).toMatchObject({ supplier: 'B', price: 333 });
    expect(outcomeFor(result, 'A')).toMatchObject({ status: 'FAILED', attempts: 3 });
  });

  it('stops gracefully when the caller cancels the search mid-way', async () => {
    // Records that each activity actually observed its own cancellation, rather
    // than being abandoned while it kept running.
    const cancelledActivities: SupplierId[] = [];
    const trackCancellation = (supplier: SupplierId): SupplierScript => async () => {
      try {
        await Context.current().cancelled;
        throw new Error('unreachable');
      } catch (err) {
        cancelledActivities.push(supplier);
        throw err;
      }
    };
    scripts.A = trackCancellation('A');
    scripts.B = trackCancellation('B');

    const worker = await makeWorker();

    const workflowId = `test-cancel-${randomUUID()}`;

    const failure = await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(hotelSearchWorkflow, {
        workflowId,
        taskQueue: TASK_QUEUE,
        args: [{ request: SEARCH, policy: TEST_POLICY }],
      });

      // Wait until both activities are genuinely in flight before cancelling.
      await waitForPhase(handle, 'FETCHING');
      await handle.cancel();

      return handle.result().catch((err: unknown) => err);
    });

    expect(failure).toBeInstanceOf(WorkflowFailedError);
    expect((failure as WorkflowFailedError).cause).toBeInstanceOf(CancelledFailure);

    // The SDK spells this CANCELLED; accept either to stay version-tolerant.
    const description = await env.client.workflow.getHandle(workflowId).describe();
    expect(['CANCELLED', 'CANCELED']).toContain(description.status.name);

    // Both in-flight suppliers were told to stop, not silently orphaned.
    expect(cancelledActivities.sort()).toEqual(['A', 'B']);
  });
});

// ===========================================================================
// Live progress
// ===========================================================================

describe('progress query', () => {
  it('reports per-supplier state while the workflow is still running', async () => {
    let releaseA: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    scripts.A = async () => {
      await gate;
      return fetchResult('A', [offer('A', 210)]);
    };
    scripts.B = () => fetchResult('B', [offer('B', 250)]);

    const worker = await makeWorker();

    const result = await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(hotelSearchWorkflow, {
        workflowId: `test-progress-${randomUUID()}`,
        taskQueue: TASK_QUEUE,
        args: [{ request: SEARCH, policy: TEST_POLICY }],
      });

      await waitForCondition(async () => {
        const progress = await handle.query(searchProgressQuery);
        return progress.suppliers.find((s) => s.supplier === 'B')?.status === 'FULFILLED';
      });

      const midFlight = await handle.query(searchProgressQuery);
      expect(midFlight.phase).toBe('FETCHING');
      expect(midFlight.suppliers.find((s) => s.supplier === 'A')?.status).toBe('CALLING');
      expect(midFlight.suppliers.find((s) => s.supplier === 'B')).toMatchObject({
        status: 'FULFILLED',
        offerCount: 1,
      });

      releaseA!();
      return (await handle.result()) as SearchResult;
    });

    expect(result.status).toBe('BEST_RATE');
    expect(result.best).toMatchObject({ supplier: 'A', price: 210 });
  });
});

// ===========================================================================
// Result shape
// ===========================================================================

describe('result shape', () => {
  it('echoes the request and derives nightly pricing', async () => {
    scripts.A = () => fetchResult('A', [offer('A', 384)]);
    scripts.B = () => fetchResult('B', []);

    const result = await runWorkflow();

    expect(result.request).toEqual({
      city: SEARCH.city,
      checkIn: SEARCH.checkIn,
      checkOut: SEARCH.checkOut,
    });
    expect(result.nights).toBe(NIGHTS);
    expect(result.best?.pricePerNight).toBe(128);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------

interface Queryable {
  query(definition: typeof searchProgressQuery): Promise<SearchProgress>;
}

async function waitForPhase(handle: Queryable, phase: SearchProgress['phase']): Promise<void> {
  await waitForCondition(async () => (await handle.query(searchProgressQuery)).phase === phase);
}

async function waitForCondition(check: () => Promise<boolean>, attempts = 100): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if (await check()) return;
    } catch {
      // Workflow task may not have started yet; keep trying.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for workflow condition');
}
