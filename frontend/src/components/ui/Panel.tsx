import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, icon, aside, flush, className, children }: PanelProps) {
  return (
    <section className={[styles.panel, className ?? ''].filter(Boolean).join(' ')}>
      {title ? (
        <header className={styles.header}>
          {icon ? (
            <span className={styles.headerIcon} aria-hidden>
              {icon}
            </span>
          ) : null}
          <h2 className={styles.title}>{title}</h2>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          {aside ? <div className={styles.aside}>{aside}</div> : null}
        </header>
      ) : null}
      <div className={[styles.body, flush ? styles.flush : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}
