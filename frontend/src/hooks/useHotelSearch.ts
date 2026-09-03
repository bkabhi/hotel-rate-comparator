import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { ApiError, SearchRequest, SearchRunResponse } from '../api/contract';

const POLL_INTERVAL_MS = 350;

export type SearchPhase = 'idle' | 'starting' | 'running' | 'cancelling' | 'settled';

export interface SearchState {
  phase: SearchPhase;
  searchId: string | null;
  run: SearchRunResponse | null;
  /** Set when the search itself could not be started or completed. */
  error: ApiError | null;
  /** Per-field validation messages from the API, keyed by form field. */
  fieldErrors: Record<string, string>;
  /** Milliseconds since the search started; drives the live elapsed readout. */
  elapsedMs: number;
}

const IDLE: SearchState = {
  phase: 'idle',
  searchId: null,
  run: null,
  error: null,
  fieldErrors: {},
  elapsedMs: 0,
};

/**
 * Owns one search at a time: starts the workflow, polls it for progress and the
 * result, and can cancel it mid-flight. A newer search supersedes an older one,
 * so a late poll response from an abandoned run can never overwrite the UI.
 */
export function useHotelSearch() {
  const [state, setState] = useState<SearchState>(IDLE);

  const currentId = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);

  const stopTimers = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    pollTimer.current = null;
    tickTimer.current = null;
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const poll = useCallback(
    async (searchId: string): Promise<void> => {
      if (currentId.current !== searchId) return;

      try {
        const run = await api.getSearch(searchId);
        if (currentId.current !== searchId) return;

        const settled = run.status !== 'RUNNING';
        setState((prev) => ({
          ...prev,
          run,
          phase: settled ? 'settled' : prev.phase === 'cancelling' ? 'cancelling' : 'running',
          error: settled ? (run.error ?? null) : null,
          ...(settled ? { elapsedMs: elapsedFrom(run, startedAt.current) } : {}),
        }));

        if (settled) {
          stopTimers();
          return;
        }
        pollTimer.current = setTimeout(() => void poll(searchId), POLL_INTERVAL_MS);
      } catch (err) {
        if (currentId.current !== searchId) return;
        stopTimers();
        setState((prev) => ({ ...prev, phase: 'settled', error: toApiError(err) }));
      }
    },
    [stopTimers],
  );

  const search = useCallback(
    async (request: SearchRequest): Promise<void> => {
      stopTimers();
      currentId.current = null;
      startedAt.current = Date.now();
      setState({ ...IDLE, phase: 'starting' });

      try {
        const started = await api.startSearch(request);
        currentId.current = started.searchId;

        setState((prev) => ({ ...prev, phase: 'running', searchId: started.searchId }));

        tickTimer.current = setInterval(() => {
          setState((prev) =>
            prev.phase === 'running' || prev.phase === 'cancelling'
              ? { ...prev, elapsedMs: Date.now() - startedAt.current }
              : prev,
          );
        }, 100);

        void poll(started.searchId);
      } catch (err) {
        currentId.current = null;
        setState({
          ...IDLE,
          phase: 'settled',
          error: toApiError(err),
          fieldErrors: err instanceof ApiRequestError ? (err.fields ?? {}) : {},
        });
      }
    },
    [poll, stopTimers],
  );

  const cancel = useCallback(async (): Promise<void> => {
    const searchId = currentId.current;
    if (!searchId) return;

    setState((prev) => ({ ...prev, phase: 'cancelling' }));
    try {
      await api.cancelSearch(searchId);
    } catch (err) {
      setState((prev) => ({ ...prev, phase: 'settled', error: toApiError(err) }));
      stopTimers();
    }
  }, [stopTimers]);

  const reset = useCallback(() => {
    stopTimers();
    currentId.current = null;
    setState(IDLE);
  }, [stopTimers]);

  return { state, search, cancel, reset };
}

function elapsedFrom(run: SearchRunResponse, fallbackStart: number): number {
  if (run.result) return run.result.elapsedMs;
  if (run.closedAt) return Date.parse(run.closedAt) - Date.parse(run.startedAt);
  return Date.now() - fallbackStart;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiRequestError) return { code: err.code, message: err.message };
  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'The search failed unexpectedly',
  };
}
