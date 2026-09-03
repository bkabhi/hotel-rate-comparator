import 'dotenv/config';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const config = {
  api: {
    port: int('API_PORT', 4000),
    corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173'),
    /** Cap for `POST /api/search-hotels?wait=1`. */
    syncWaitMs: int('API_SYNC_WAIT_MS', 30_000),
  },
  suppliers: {
    port: int('SUPPLIER_PORT', 4001),
    baseUrl: str('SUPPLIER_BASE_URL', 'http://localhost:4001'),
    /** Floor/ceiling of the random latency a healthy supplier answers within. */
    baseLatencyMs: int('SUPPLIER_BASE_LATENCY_MS', 120),
    jitterLatencyMs: int('SUPPLIER_JITTER_LATENCY_MS', 400),
  },
  temporal: {
    address: str('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: str('TEMPORAL_NAMESPACE', 'default'),
    taskQueue: str('TEMPORAL_TASK_QUEUE', 'hotel-search'),
  },
  orchestration: {
    /** Total budget per supplier including retries; exceeding it cancels it. */
    supplierDeadlineMs: int('SUPPLIER_DEADLINE_MS', 5_000),
    /** Per-attempt activity timeout. */
    supplierAttemptTimeoutMs: int('SUPPLIER_ATTEMPT_TIMEOUT_MS', 5_000),
    /** Total activity attempts per supplier. 1 disables retries. */
    supplierMaxAttempts: int('SUPPLIER_MAX_ATTEMPTS', 3),
    /** How long a finished workflow stays queryable for result polling. */
    workflowExecutionTimeoutMs: int('WORKFLOW_EXECUTION_TIMEOUT_MS', 60_000),
  },
} as const;

export type Config = typeof config;
