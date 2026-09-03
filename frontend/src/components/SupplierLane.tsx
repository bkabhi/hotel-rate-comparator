import { describeStatus } from '../lib/supplierStatus';
import { duration, plural } from '../lib/format';
import type { SupplierProgress } from '../api/contract';
import styles from './SupplierLane.module.css';

const TONE_CLASS = {
  idle: styles.toneIdle,
  active: styles.toneActive,
  warn: styles.toneWarn,
  ok: styles.toneOk,
  danger: styles.toneDanger,
  muted: styles.toneMuted,
} as const;

interface SupplierLaneProps {
  supplier: SupplierProgress;
  /** Round-trip time, once the supplier has settled. */
  latencyMs?: number;
  /** True for the supplier whose offer won the comparison. */
  winner?: boolean;
  /** True once a winner exists and it is not this supplier. */
  dimmed?: boolean;
}

export function SupplierLane({ supplier, latencyMs, winner, dimmed }: SupplierLaneProps) {
  const status = describeStatus(supplier.status);
  const detail = describeDetail(supplier);

  return (
    <div
      className={[
        styles.lane,
        TONE_CLASS[status.tone],
        winner ? styles.winner : '',
        dimmed ? styles.dimmed : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={[styles.mark, winner ? styles.winnerMark : ''].filter(Boolean).join(' ')}>
        {supplier.supplier}
      </span>

      <div className={styles.body}>
        <div className={styles.name}>{supplier.supplierName}</div>
        <div className={styles.status}>
          <span className={styles.statusIcon} aria-hidden>
            {status.icon}
          </span>
          <span>{status.label}</span>
          {detail ? <span className={[styles.detail, styles.errorText].join(' ')}>· {detail}</span> : null}
        </div>
      </div>

      <div className={styles.meta}>
        {supplier.attempts > 1 ? (
          <span className={styles.attempts} title={`${supplier.attempts} activity attempts`}>
            attempt {supplier.attempts}
          </span>
        ) : null}
        {latencyMs !== undefined ? (
          <span className={`${styles.latency} tabular`}>{duration(latencyMs)}</span>
        ) : null}
      </div>

      {status.live ? (
        <span className={styles.rail} aria-hidden>
          <span className={styles.railFill} />
        </span>
      ) : null}
    </div>
  );
}

function describeDetail(supplier: SupplierProgress): string | null {
  if (supplier.error) return supplier.error;
  if (supplier.status === 'FULFILLED') return plural(supplier.offerCount, 'rate');
  return null;
}
