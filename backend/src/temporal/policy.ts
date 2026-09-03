/**
 * Timing knobs for the search workflow.
 *
 * Kept free of `process.env` and any Node built-in so the workflow sandbox can
 * import it. The API process overrides these from `config.orchestration` when
 * starting a workflow; tests override them to compress or stretch time.
 */
export interface SearchPolicy {
  /**
   * Total budget for one supplier, retries included. When it elapses the
   * supplier's activity is *cancelled* and the search proceeds without it.
   */
  supplierDeadlineMs: number;
  /** Per-attempt activity timeout (startToClose). */
  attemptTimeoutMs: number;
  /** Total attempts per supplier activity. 1 disables retries. */
  maxAttempts: number;
  /** First retry backoff; doubles up to `retryMaxIntervalMs`. */
  retryInitialIntervalMs: number;
  retryMaxIntervalMs: number;
}

export const DEFAULT_SEARCH_POLICY: SearchPolicy = {
  supplierDeadlineMs: 5_000,
  attemptTimeoutMs: 5_000,
  maxAttempts: 3,
  retryInitialIntervalMs: 200,
  retryMaxIntervalMs: 1_000,
};

export function resolvePolicy(overrides?: Partial<SearchPolicy>): SearchPolicy {
  return { ...DEFAULT_SEARCH_POLICY, ...overrides };
}
