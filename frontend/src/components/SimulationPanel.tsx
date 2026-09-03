import type { Dispatch, SetStateAction } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';
import { Segmented, type SegmentedOption } from './ui/Segmented';
import type { SimulationConfig, SupplierBehavior, SupplierId } from '../api/contract';
import styles from './SimulationPanel.module.css';

/**
 * Forces each mock supplier down a specific path. This is what turns the
 * scenario matrix in the brief into something you can click through instead of
 * having to trust the test output for.
 */
export type BehaviorPreset = 'normal' | 'slow' | 'timeout' | 'empty' | 'error' | 'flaky';

const OPTIONS: readonly SegmentedOption<BehaviorPreset>[] = [
  { value: 'normal', label: 'Healthy', title: 'Answers normally, in about 100–500 ms' },
  { value: 'slow', label: 'Slow', tone: 'warn', title: 'Answers after 3 s — inside the deadline' },
  {
    value: 'timeout',
    label: 'Stalls',
    tone: 'danger',
    title: 'Never answers — the workflow cancels it after 5 s',
  },
  { value: 'empty', label: 'Empty', title: 'Answers with no hotels at all' },
  { value: 'error', label: 'Errors', tone: 'danger', title: 'Answers HTTP 503 on every attempt' },
  {
    value: 'flaky',
    label: 'Flaky',
    tone: 'warn',
    title: 'Fails twice, then succeeds — exercises the retry policy',
  },
];

const NOTES: Record<BehaviorPreset, string> = {
  normal: 'Answers in about 100–500 ms.',
  slow: 'Takes 3 s — slow, but inside the 5 s budget.',
  timeout: 'Never answers. Cancelled at 5 s.',
  empty: 'Answers with an empty hotel list.',
  error: 'Returns HTTP 503 on every attempt.',
  flaky: 'Fails twice, then succeeds on attempt 3.',
};

export type SimulationState = Record<SupplierId, BehaviorPreset>;

export const DEFAULT_SIMULATION: SimulationState = { A: 'normal', B: 'normal' };

const SUPPLIER_NAMES: Record<SupplierId, string> = {
  A: 'Sarai Travel',
  B: 'Nivaas Rooms',
};

/** Turns the panel's presets into the wire format the API expects. */
export function toSimulationConfig(state: SimulationState): SimulationConfig | undefined {
  const entries = (Object.keys(state) as SupplierId[]).flatMap<[SupplierId, SupplierBehavior]>(
    (supplier) => {
      const preset = state[supplier];
      if (preset === 'normal') return [];
      return [[supplier, toBehavior(preset)]];
    },
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function toBehavior(preset: Exclude<BehaviorPreset, 'normal'>): SupplierBehavior {
  switch (preset) {
    case 'slow':
      return { kind: 'slow', delayMs: 3000 };
    case 'error':
      return { kind: 'error', status: 503 };
    case 'flaky':
      return { kind: 'flaky', failures: 2 };
    default:
      return { kind: preset };
  }
}

interface SimulationPanelProps {
  value: SimulationState;
  /** A setter, not a plain callback: two segment clicks in one frame must not
      collapse into one because both read the same rendered value. */
  onChange: Dispatch<SetStateAction<SimulationState>>;
  disabled: boolean;
}

export function SimulationPanel({ value, onChange, disabled }: SimulationPanelProps) {
  const dirty = value.A !== 'normal' || value.B !== 'normal';

  return (
    <Panel
      title="Supplier simulation"
      icon={<FlaskConical size={14} />}
      aside={dirty ? <span className={styles.dirtyDot} aria-label="Faults active" /> : null}
    >
      <p className={styles.intro}>
        Force a supplier to misbehave and watch the workflow absorb it.
      </p>

      {(['A', 'B'] as const).map((supplier) => (
        <div key={supplier} className={styles.supplier}>
          <div className={styles.head}>
            <span className={styles.mark} aria-hidden>
              {supplier}
            </span>
            <span className={styles.name}>{SUPPLIER_NAMES[supplier]}</span>
          </div>
          <Segmented
            label={`Behaviour for supplier ${supplier}`}
            value={value[supplier]}
            options={OPTIONS}
            disabled={disabled}
            onChange={(preset) => onChange((prev) => ({ ...prev, [supplier]: preset }))}
          />
          <p
            className={[styles.note, value[supplier] !== 'normal' ? styles.active : '']
              .filter(Boolean)
              .join(' ')}
          >
            {NOTES[value[supplier]]}
          </p>
        </div>
      ))}

      {dirty ? (
        <div className={styles.resetAll}>
          <Button
            small
            variant="ghost"
            icon={<RotateCcw size={13} />}
            disabled={disabled}
            onClick={() => onChange(DEFAULT_SIMULATION)}
          >
            Reset both to healthy
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
