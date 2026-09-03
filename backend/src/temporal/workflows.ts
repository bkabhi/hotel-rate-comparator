import {
  ApplicationFailure,
  CancellationScope,
  CancelledFailure,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';

import type { Activities } from './activities';
import { searchProgressQuery } from './shared';
import { resolvePolicy, type SearchPolicy } from './policy';
import { selectBestOffer, sortOffers } from './compare';
import { NON_RETRYABLE_ERROR_TYPES } from '../shared/errors';
import {
  ERROR_CODES,
  SUPPLIER_IDS,
  SUPPLIER_NAMES,
  type HotelOffer,
  type SearchProgress,
  type SearchRequest,
  type SearchResult,
  type SupplierId,
  type SupplierOutcome,
  type SupplierProgress,
} from '../shared/types';

export interface HotelSearchInput {
  request: SearchRequest;
  policy?: Partial<SearchPolicy>;
}

/**
 * Fans out to both suppliers in parallel, tolerates each one failing in its own
 * way, and returns the cheapest rate that came back.
 *
 * Three failure modes are handled distinctly, because they mean different
 * things to the caller:
 *
 *   - **Slow supplier** — each supplier runs inside its own
 *     `CancellationScope.withTimeout`. Blowing that budget cancels the activity
 *     for real (the in-flight HTTP request is aborted via the activity's
 *     cancellation signal) and the search continues on whatever else answered.
 *   - **Failing supplier** — errors are thrown as retryable failures, so
 *     Temporal's retry policy handles "fails twice, then succeeds" without any
 *     retry code here. Retries share the supplier's deadline budget.
 *   - **Cancelled search** — a cancellation request on the workflow itself
 *     propagates to both activities; the workflow then stops with a
 *     `CancelledFailure` rather than pretending it produced a result.
 *
 * An empty hotel list is a valid answer, not a failure: one supplier returning
 * nothing still lets the other one win.
 */
export async function hotelSearchWorkflow(input: HotelSearchInput): Promise<SearchResult> {
  const policy = resolvePolicy(input.policy);
  const { request } = input;
  const searchKey = workflowInfo().workflowId;
  const startedAt = Date.now();

  // ---- Live progress, readable via query while the workflow runs -----------
  const progress: Record<SupplierId, SupplierProgress> = {
    A: emptyProgress('A'),
    B: emptyProgress('B'),
  };
  let phase: SearchProgress['phase'] = 'STARTING';

  setHandler(searchProgressQuery, () => ({
    phase,
    suppliers: SUPPLIER_IDS.map((id) => ({ ...progress[id] })),
  }));

  // A supplier hitting its deadline cancels a *child* scope. Only a cancel of
  // this root scope means the user asked to stop, so the two are tracked apart.
  let searchCancelled = false;
  CancellationScope.current().cancelRequested.catch(() => {
    searchCancelled = true;
  });

  const suppliers = makeSupplierProxies(policy);

  phase = 'FETCHING';

  // `Promise.all` over runners that never reject — every supplier resolves to
  // an outcome, so one supplier's failure can't short-circuit the other's work.
  const settled = await Promise.all(
    SUPPLIER_IDS.map((id) => runSupplier(id, suppliers[id], policy, request, progress, () => searchCancelled)),
  );

  if (searchCancelled) {
    phase = 'DONE';
    log.info('Search cancelled by the caller', { searchKey });
    throw new CancelledFailure('Search cancelled before a rate could be returned');
  }

  phase = 'COMPARING';

  const outcomes = settled.map((entry) => entry.outcome);
  const offers = sortOffers(settled.flatMap((entry) => entry.offers));
  const answered = outcomes.filter((o) => o.status === 'FULFILLED' || o.status === 'EMPTY');

  // Nobody answered at all — this is a genuine failure, not an empty result.
  if (answered.length === 0) {
    phase = 'DONE';
    throw ApplicationFailure.create({
      type: ERROR_CODES.ALL_SUPPLIERS_FAILED,
      message: 'Both suppliers failed to return rates',
      nonRetryable: true,
      details: [{ suppliers: outcomes }],
    });
  }

  const best = selectBestOffer(offers);
  phase = 'DONE';

  const nights = offers[0]?.nights ?? nightsBetween(request.checkIn, request.checkOut);
  const base = {
    offers,
    suppliers: outcomes,
    request: { city: request.city, checkIn: request.checkIn, checkOut: request.checkOut },
    nights,
    elapsedMs: Date.now() - startedAt,
  };

  if (!best) {
    log.info('Suppliers answered but had no inventory', { city: request.city });
    return { ...base, status: 'NO_HOTELS', best: null, message: 'No hotels found' };
  }

  log.info('Best rate selected', { hotel: best.name, supplier: best.supplier, price: best.price });
  return { ...base, status: 'BEST_RATE', best };
}

// ---------------------------------------------------------------------------
// Per-supplier execution
// ---------------------------------------------------------------------------

interface SupplierRun {
  outcome: SupplierOutcome;
  offers: HotelOffer[];
}

type SupplierProxy = (
  supplier: SupplierId,
  request: SearchRequest,
  searchKey: string,
) => Promise<Awaited<ReturnType<Activities['fetchSupplierRates']>>>;

/**
 * One proxy per supplier so each activity carries a stable, readable
 * `activityId` — that is what lets the API surface live attempt counts from
 * the workflow's pending activities.
 */
function makeSupplierProxies(policy: SearchPolicy): Record<SupplierId, SupplierProxy> {
  const build = (supplier: SupplierId): SupplierProxy => {
    const { fetchSupplierRates } = proxyActivities<Activities>({
      activityId: `supplier-${supplier}`,
      startToCloseTimeout: policy.attemptTimeoutMs,
      // Backstop only: the per-supplier cancellation scope normally fires first.
      scheduleToCloseTimeout: policy.supplierDeadlineMs + policy.attemptTimeoutMs,
      retry: {
        initialInterval: policy.retryInitialIntervalMs,
        backoffCoefficient: 2,
        maximumInterval: policy.retryMaxIntervalMs,
        maximumAttempts: policy.maxAttempts,
        nonRetryableErrorTypes: [...NON_RETRYABLE_ERROR_TYPES],
      },
    });
    return fetchSupplierRates;
  };

  return { A: build('A'), B: build('B') };
}

async function runSupplier(
  supplier: SupplierId,
  call: SupplierProxy,
  policy: SearchPolicy,
  request: SearchRequest,
  progress: Record<SupplierId, SupplierProgress>,
  searchWasCancelled: () => boolean,
): Promise<SupplierRun> {
  const startedAt = Date.now();
  const searchKey = workflowInfo().workflowId;
  progress[supplier].status = 'CALLING';
  progress[supplier].attempts = 1;

  try {
    const result = await CancellationScope.withTimeout(policy.supplierDeadlineMs, () =>
      call(supplier, request, searchKey),
    );

    const status = result.offers.length > 0 ? 'FULFILLED' : 'EMPTY';
    progress[supplier].status = status;
    progress[supplier].attempts = result.attempt;
    progress[supplier].offerCount = result.offers.length;

    return {
      offers: result.offers,
      outcome: {
        supplier,
        supplierName: SUPPLIER_NAMES[supplier],
        status,
        offerCount: result.offers.length,
        latencyMs: result.latencyMs,
        attempts: result.attempt,
      },
    };
  } catch (err) {
    const elapsed = Date.now() - startedAt;

    // Cancellation reaches here two ways: the user cancelled the search, or
    // this supplier blew its own deadline. Only the latter is recoverable.
    const status = isCancellation(err)
      ? searchWasCancelled()
        ? 'CANCELLED'
        : 'TIMED_OUT'
      : 'FAILED';

    const error =
      status === 'TIMED_OUT'
        ? `No response within ${policy.supplierDeadlineMs} ms — cancelled`
        : status === 'CANCELLED'
          ? 'Search cancelled before this supplier answered'
          : failureMessage(err, supplier);

    progress[supplier].status = status;
    progress[supplier].error = error;
    // A supplier that failed used its whole retry budget; one that was
    // cancelled kept whatever attempt it was on.
    if (status === 'FAILED') progress[supplier].attempts = policy.maxAttempts;

    log.warn('Supplier did not produce a usable result', { supplier, status, error });

    return {
      offers: [],
      outcome: {
        supplier,
        supplierName: SUPPLIER_NAMES[supplier],
        status,
        offerCount: 0,
        latencyMs: elapsed,
        attempts: progress[supplier].attempts,
        error,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers (deterministic, workflow-safe)
// ---------------------------------------------------------------------------

function emptyProgress(supplier: SupplierId): SupplierProgress {
  return {
    supplier,
    supplierName: SUPPLIER_NAMES[supplier],
    status: 'PENDING',
    attempts: 0,
    offerCount: 0,
  };
}

/** Unwraps Temporal's ActivityFailure envelope down to the useful message. */
function failureMessage(err: unknown, supplier: SupplierId): string {
  let cursor: unknown = err;
  const seen = new Set<unknown>();
  while (cursor instanceof Error && !seen.has(cursor)) {
    seen.add(cursor);
    const cause = (cursor as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      cursor = cause;
      continue;
    }
    break;
  }
  if (cursor instanceof Error && cursor.message) return cursor.message;
  return `${SUPPLIER_NAMES[supplier]} failed`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
