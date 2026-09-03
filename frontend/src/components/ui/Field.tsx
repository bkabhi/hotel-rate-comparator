import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './Field.module.css';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
}

export function Field({ label, icon, error, hint, className, ...rest }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={[styles.field, error ? styles.invalid : ''].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      <div className={styles.control}>
        {icon ? (
          <span className={styles.icon} aria-hidden>
            {icon}
          </span>
        ) : null}
        <input
          {...rest}
          id={id}
          className={[styles.input, icon ? styles.withIcon : '', className ?? '']
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        />
      </div>

      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
