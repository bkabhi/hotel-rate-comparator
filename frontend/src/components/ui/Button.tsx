import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  small?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  block = false,
  small = false,
  loading = false,
  icon,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    variant !== 'secondary' ? styles[variant] : '',
    block ? styles.block : '',
    small ? styles.small : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} className={classes} disabled={disabled || loading} aria-busy={loading}>
      {loading ? <Loader2 size={15} className={styles.spinner} aria-hidden /> : icon}
      {children}
    </button>
  );
}
