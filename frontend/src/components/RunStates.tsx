import type { ReactNode } from 'react';
import { BedDouble, Ban, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button';
import type { ApiError, SearchResult } from '../api/contract';
import { dateRange } from '../lib/format';
import styles from './RunStates.module.css';

// ---------------------------------------------------------------------------
// Idle — the first thing anyone sees, so it explains the machine
// ---------------------------------------------------------------------------

export function IdleState() {
  return (
    <div className={styles.state}>
      <h3 className={styles.title}>Ready when you are</h3>
      <p className={styles.body}>
        Every search starts a Temporal workflow. Watch it work here.
      </p>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <span>
            Both suppliers are called <strong>in parallel</strong>, each with its own five-second
            budget.
          </span>
        </li>
        <li className={styles.step}>
          <span>
            A supplier that fails is <strong>retried up to three times</strong> inside that budget.
            One that stalls is <strong>cancelled</strong>, and the search carries on without it.
          </span>
        </li>
        <li className={styles.step}>
          <span>
            The <strong>cheapest surviving rate</strong> wins, with Supplier A taking exact ties.
          </span>
        </li>
      </ol>
      <p className={styles.body} style={{ marginTop: 'var(--s2)', fontSize: 'var(--text-sm)' }}>
        Use the simulation controls to force a delay, an outage or an empty response and see how
        the workflow reacts.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No hotels — a valid answer, not a failure
// ---------------------------------------------------------------------------

export function NoHotelsState({ result, onReset }: { result: SearchResult; onReset: () => void }) {
  return (
    <div className={styles.state}>
      <span className={`${styles.badge} ${styles.badgeMuted}`} aria-hidden>
        <BedDouble size={17} />
      </span>
      <h3 className={styles.title}>No hotels found</h3>
      <p className={styles.body}>
        Both suppliers answered, and neither had inventory in {result.request.city} for{' '}
        {dateRange(result.request.checkIn, result.request.checkOut)}. Try different dates, or a city
        the suppliers cover.
      </p>
      <div className={styles.actions}>
        <Button onClick={onReset} icon={<RotateCcw size={14} />}>
          Start over
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failure — names the problem and the recovery
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
  children?: ReactNode;
}

const CANCELLED_CODE = 'SEARCH_CANCELLED';

export function ErrorState({ error, onRetry, children }: ErrorStateProps) {
  const cancelled = error.code === CANCELLED_CODE;

  return (
    <div className={styles.state}>
      <span
        className={[styles.badge, cancelled ? styles.badgeMuted : styles.badgeDanger].join(' ')}
        aria-hidden
      >
        {cancelled ? <Ban size={17} /> : <TriangleAlert size={17} />}
      </span>
      <h3 className={styles.title}>{title(error)}</h3>
      <p className={styles.body} role="alert">
        {body(error)}
      </p>
      {children}
      {onRetry ? (
        <div className={styles.actions}>
          <Button onClick={onRetry} icon={<RotateCcw size={14} />}>
            Try again
          </Button>
        </div>
      ) : null}
      {!cancelled ? <p className={styles.code}>{error.code}</p> : null}
    </div>
  );
}

function title(error: ApiError): string {
  switch (error.code) {
    case CANCELLED_CODE:
      return 'Search cancelled';
    case 'ALL_SUPPLIERS_FAILED':
      return 'Neither supplier could be reached';
    case 'TEMPORAL_UNAVAILABLE':
      return 'The Temporal server is not running';
    case 'NETWORK':
      return 'The search API is unreachable';
    case 'SEARCH_NOT_FOUND':
      return 'That search has expired';
    case 'INVALID_REQUEST':
      return 'Check the search details';
    default:
      return 'The search could not be completed';
  }
}

function body(error: ApiError): string {
  switch (error.code) {
    case CANCELLED_CODE:
      return 'The workflow stopped cleanly and both suppliers were told to stand down. Nothing was charged or reserved.';
    case 'ALL_SUPPLIERS_FAILED':
      return 'Both suppliers exhausted their retries without returning rates. This is usually temporary — run the search again in a moment.';
    case 'TEMPORAL_UNAVAILABLE':
      return 'Start it with `npm run temporal:dev` in the backend folder, then run the search again.';
    default:
      return error.message;
  }
}

export { styles as runStateStyles };
