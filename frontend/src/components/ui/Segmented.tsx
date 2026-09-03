import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Colours the selected chip so a forced fault reads as a fault. */
  tone?: 'neutral' | 'warn' | 'danger';
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        const tone =
          active && option.tone === 'warn'
            ? styles.activeWarn
            : active && option.tone === 'danger'
              ? styles.activeDanger
              : active
                ? styles.active
                : '';

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={option.title ?? option.label}
            className={[styles.option, tone].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
