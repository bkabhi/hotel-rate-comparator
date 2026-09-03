import { Activity, CheckCircle2, Hourglass, Layers, Radio } from 'lucide-react';
import { Panel } from './ui/Panel';
import { SupplierLane } from './SupplierLane';
import { BestRate } from './BestRate';
import { OfferTable } from './OfferTable';
import { ErrorState, IdleState, NoHotelsState } from './RunStates';
import type { SearchState } from '../hooks/useHotelSearch';
import type { SearchProgress, SupplierOutcome, SupplierProgress } from '../api/contract';
import { duration, plural } from '../lib/format';
import styles from './RunPane.module.css';

interface RunPaneProps {
  state: SearchState;
  onRetry: () => void;
  onReset: () => void;
}

export function RunPane({ state, onRetry, onReset }: RunPaneProps) {
  if (state.phase === 'idle') {
    return (
      <div className={styles.pane}>
        <Panel flush>
          <IdleState />
        </Panel>
      </div>
    );
  }

  const { run, error } = state;
  const result = run?.result;
  const running = state.phase === 'starting' || state.phase === 'running' || state.phase === 'cancelling';
  const progress = run?.progress ?? placeholderProgress();
  const latencies = latencyBySupplier(result?.suppliers);
  const winner = result?.best?.supplier;

  return (
    <div className={styles.pane}>
      <Panel flush>
        <div className={styles.runHeader}>
          <span className={styles.phase}>
            <span
              className={[styles.phaseIcon, running ? styles.phaseLive : ''].filter(Boolean).join(' ')}
              aria-hidden
            >
              {phaseIcon(state, progress)}
            </span>
            {phaseLabel(state, progress)}
          </span>

          <span className={styles.runMeta}>
            {state.searchId ? (
              <span className={styles.searchId} title={state.searchId}>
                {state.searchId}
              </span>
            ) : null}
            <span className={`${styles.elapsed} tabular`}>{duration(state.elapsedMs)}</span>
          </span>
        </div>

        <div className={styles.progressLine} aria-hidden>
          {running ? <span className={styles.progressFill} /> : null}
        </div>

        <div role="status" aria-live="polite" className="srOnly">
          {phaseLabel(state, progress)}
        </div>

        {progress.suppliers.map((supplier) => (
          <SupplierLane
            key={supplier.supplier}
            supplier={supplier}
            latencyMs={latencies.get(supplier.supplier)}
            winner={winner === supplier.supplier}
            dimmed={winner !== undefined && winner !== supplier.supplier}
          />
        ))}

        {result && result.status === 'BEST_RATE' ? (
          <p className={styles.outcomeNote}>
            Compared {plural(result.offers.length, 'rate')} across{' '}
            {plural(result.suppliers.filter((s) => s.status === 'FULFILLED').length, 'supplier')} in{' '}
            <span className="tabular">{duration(result.elapsedMs)}</span>.
          </p>
        ) : null}
      </Panel>

      {result?.status === 'BEST_RATE' ? <BestRate result={result} /> : null}

      {result?.status === 'NO_HOTELS' ? (
        <Panel flush>
          <NoHotelsState result={result} onReset={onReset} />
        </Panel>
      ) : null}

      {error ? (
        <Panel flush>
          <ErrorState error={error} onRetry={onRetry} />
        </Panel>
      ) : null}

      {result && result.offers.length > 0 ? (
        <Panel
          title="All rates returned"
          icon={<Layers size={14} />}
          aside={
            <span className={styles.sectionMeta}>
              {plural(result.offers.length, 'rate')}, cheapest first
            </span>
          }
          flush
        >
          <OfferTable offers={result.offers} best={result.best} />
        </Panel>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function phaseLabel(state: SearchState, progress: SearchProgress): string {
  if (state.phase === 'starting') return 'Starting workflow';
  if (state.phase === 'cancelling') return 'Cancelling…';
  if (state.phase === 'running') {
    return progress.phase === 'COMPARING' ? 'Comparing rates' : 'Calling suppliers';
  }
  if (state.run?.status === 'CANCELLED') return 'Cancelled';
  if (state.error) return 'Search failed';
  if (state.run?.result?.status === 'NO_HOTELS') return 'No hotels found';
  return 'Search complete';
}

function phaseIcon(state: SearchState, progress: SearchProgress) {
  if (state.phase === 'starting') return <Hourglass size={14} />;
  if (state.phase === 'cancelling') return <Radio size={14} />;
  if (state.phase === 'running') {
    return progress.phase === 'COMPARING' ? <Activity size={14} /> : <Radio size={14} />;
  }
  return <CheckCircle2 size={14} />;
}

function latencyBySupplier(outcomes?: SupplierOutcome[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const outcome of outcomes ?? []) map.set(outcome.supplier, outcome.latencyMs);
  return map;
}

/** Shown for the moment between submitting and the first progress query. */
function placeholderProgress(): SearchProgress {
  const supplier = (id: 'A' | 'B', name: string): SupplierProgress => ({
    supplier: id,
    supplierName: name,
    status: 'PENDING',
    attempts: 0,
    offerCount: 0,
  });
  return {
    phase: 'STARTING',
    suppliers: [supplier('A', 'Sarai Travel'), supplier('B', 'Nivaas Rooms')],
  };
}
