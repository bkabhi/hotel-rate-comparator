import { randomUUID } from 'node:crypto';
import {
  Client,
  WorkflowFailedError,
  WorkflowNotFoundError,
  type WorkflowHandle,
} from '@temporalio/client';
import { ApplicationFailure, CancelledFailure, TimeoutFailure } from '@temporalio/common';

import { config } from '../config';
import { hotelSearchWorkflow } from '../temporal/workflows';
import { searchProgressQuery, SEARCH_ID_PREFIX } from '../temporal/shared';
import {
  ERROR_CODES,
  SUPPLIER_IDS,
  type ApiError,
  type RunStatus,
  type SearchProgress,
  type SearchRequest,
  type SearchResult,
  type SearchRunResponse,
  type StartSearchResponse,
  type SupplierId,
  type SupplierOutcome,
} from '../shared/types';

/** Raised when a search id does not map to a workflow. */
export class SearchNotFoundError extends Error {
  override readonly name = 'SearchNotFound';
}

export function newSearchId(): string {
  return `${SEARCH_ID_PREFIX}-${randomUUID()}`;
}

export async function startSearch(
  client: Client,
  request: SearchRequest,
  searchId = newSearchId(),
): Promise<StartSearchResponse> {
  const handle = await client.workflow.start(hotelSearchWorkflow, {
    workflowId: searchId,
    taskQueue: config.temporal.taskQueue,
    workflowExecutionTimeout: config.orchestration.workflowExecutionTimeoutMs,
    args: [
      {
        request,
        policy: {
          supplierDeadlineMs: config.orchestration.supplierDeadlineMs,
          attemptTimeoutMs: config.orchestration.supplierAttemptTimeoutMs,
          maxAttempts: config.orchestration.supplierMaxAttempts,
        },
      },
    ],
  });

  return {
    searchId: handle.workflowId,
    runId: handle.firstExecutionRunId,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  };
}

export async function cancelSearch(client: Client, searchId: string): Promise<void> {
  const handle = client.workflow.getHandle(searchId);
  try {
    await handle.cancel();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw new SearchNotFoundError(searchId);
    throw err;
  }
}

/**
 * One snapshot of a search: its run status plus either live per-supplier
 * progress, the finished result, or a structured error.
 */
export async function getSearch(client: Client, searchId: string): Promise<SearchRunResponse> {
  const handle = client.workflow.getHandle(searchId);

  let description: Awaited<ReturnType<WorkflowHandle['describe']>>;
  try {
    description = await handle.describe();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw new SearchNotFoundError(searchId);
    throw err;
  }

  const status = mapRunStatus(description.status.name);
  const base = {
    searchId,
    status,
    startedAt: description.startTime.toISOString(),
    ...(description.closeTime ? { closedAt: description.closeTime.toISOString() } : {}),
  };

  // Temporal can answer queries against closed workflows too, so the UI keeps
  // showing what each supplier did even after a failure or a cancellation.
  const queried = await readProgress(handle, description, status === 'RUNNING');

  if (status === 'RUNNING') {
    return { ...base, ...(queried ? { progress: queried } : {}) };
  }

  if (status === 'COMPLETED') {
    const result = (await handle.result()) as SearchResult;
    return { ...base, result, progress: queried ?? progressFromResult(result) };
  }

  const error = await describeFailure(handle, status);
  const progress = queried ?? progressFromFailure(error);
  return { ...base, error, ...(progress ? { progress } : {}) };
}

/** Blocks until the workflow closes; used by `POST /api/search-hotels?wait=1`. */
export async function awaitSearch(client: Client, searchId: string): Promise<SearchRunResponse> {
  const handle = client.workflow.getHandle(searchId);
  try {
    await handle.result();
  } catch {
    // Fall through: getSearch turns the closed state into a structured answer.
  }
  return getSearch(client, searchId);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function mapRunStatus(name: string): RunStatus {
  switch (name) {
    case 'RUNNING':
    case 'CONTINUED_AS_NEW':
      return 'RUNNING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED';
    case 'TIMED_OUT':
      return 'TIMED_OUT';
    case 'TERMINATED':
      return 'TERMINATED';
    default:
      return 'FAILED';
  }
}

/**
 * Queries the workflow for its own view of progress, then overlays the live
 * attempt counts Temporal already tracks for pending activities — that is how
 * a retry becomes visible while it is still happening.
 */
async function readProgress(
  handle: WorkflowHandle,
  description: Awaited<ReturnType<WorkflowHandle['describe']>>,
  live: boolean,
): Promise<SearchProgress | undefined> {
  let progress: SearchProgress;
  try {
    progress = await handle.query(searchProgressQuery);
  } catch {
    return undefined; // Workflow task not started yet, or worker unavailable.
  }

  if (!live) return progress;

  const attemptsById = new Map<SupplierId, number>();
  const pending = description.raw?.pendingActivities ?? [];
  for (const activity of pending) {
    const supplier = SUPPLIER_IDS.find((id) => activity.activityId === `supplier-${id}`);
    if (supplier && typeof activity.attempt === 'number') {
      attemptsById.set(supplier, activity.attempt);
    }
  }

  return {
    ...progress,
    suppliers: progress.suppliers.map((supplier) => {
      const attempt = attemptsById.get(supplier.supplier);
      if (attempt === undefined || supplier.status !== 'CALLING') return supplier;
      return {
        ...supplier,
        attempts: attempt,
        status: attempt > 1 ? 'RETRYING' : 'CALLING',
      };
    }),
  };
}

function progressFromResult(result: SearchResult): SearchProgress {
  return {
    phase: 'DONE',
    suppliers: result.suppliers.map((outcome) => ({
      supplier: outcome.supplier,
      supplierName: outcome.supplierName,
      status: outcome.status,
      attempts: outcome.attempts,
      offerCount: outcome.offerCount,
      ...(outcome.error ? { error: outcome.error } : {}),
    })),
  };
}

/**
 * Last resort when the query is unavailable: the ALL_SUPPLIERS_FAILED failure
 * carries the per-supplier outcomes in its details.
 */
function progressFromFailure(error: ApiError): SearchProgress | undefined {
  const details = error.details as { suppliers?: SupplierOutcome[] } | undefined;
  if (!details?.suppliers?.length) return undefined;
  return {
    phase: 'DONE',
    suppliers: details.suppliers.map((outcome) => ({
      supplier: outcome.supplier,
      supplierName: outcome.supplierName,
      status: outcome.status,
      attempts: outcome.attempts,
      offerCount: outcome.offerCount,
      ...(outcome.error ? { error: outcome.error } : {}),
    })),
  };
}

async function describeFailure(handle: WorkflowHandle, status: RunStatus): Promise<ApiError> {
  if (status === 'CANCELLED') {
    return {
      code: ERROR_CODES.SEARCH_CANCELLED,
      message: 'Search was cancelled before a rate could be returned',
    };
  }

  if (status === 'TIMED_OUT') {
    return {
      code: ERROR_CODES.ALL_SUPPLIERS_FAILED,
      message: 'The search ran out of time before any supplier answered',
    };
  }

  try {
    await handle.result();
  } catch (err) {
    return toApiError(err);
  }

  return { code: ERROR_CODES.INTERNAL, message: `Search ended as ${status}` };
}

export function toApiError(err: unknown): ApiError {
  const cause = err instanceof WorkflowFailedError ? err.cause : err;

  if (cause instanceof ApplicationFailure) {
    return {
      code: cause.type ?? ERROR_CODES.INTERNAL,
      message: cause.message,
      ...(cause.details?.length ? { details: cause.details[0] } : {}),
    };
  }
  if (cause instanceof CancelledFailure) {
    return { code: ERROR_CODES.SEARCH_CANCELLED, message: cause.message || 'Search was cancelled' };
  }
  if (cause instanceof TimeoutFailure) {
    return {
      code: ERROR_CODES.ALL_SUPPLIERS_FAILED,
      message: 'The search timed out before any supplier answered',
    };
  }
  return {
    code: ERROR_CODES.INTERNAL,
    message: cause instanceof Error ? cause.message : 'The search failed unexpectedly',
  };
}
