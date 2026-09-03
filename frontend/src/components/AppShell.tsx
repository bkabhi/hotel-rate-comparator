import type { ReactNode } from 'react';
import { ArrowUpRight, Waypoints } from 'lucide-react';
import styles from './AppShell.module.css';

export type HealthState = 'checking' | 'connected' | 'down';

interface AppShellProps {
  health: HealthState;
  taskQueue: string | null;
  rail: ReactNode;
  children: ReactNode;
}

const HEALTH_COPY: Record<HealthState, string> = {
  checking: 'Checking Temporal',
  connected: 'Temporal connected',
  down: 'Temporal unreachable',
};

export function AppShell({ health, taskQueue, rail, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden>
            <Waypoints size={15} strokeWidth={2.2} />
          </span>
          <h1 className={styles.wordmark}>Rate Comparator</h1>
          <span className={styles.tagline}>Two suppliers, one best rate</span>
        </div>

        <div className={styles.barRight}>
          <span className={styles.pill} title={HEALTH_COPY[health]}>
            <span
              className={[
                styles.statusDot,
                health === 'connected' ? styles.dotOk : health === 'down' ? styles.dotDown : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />
            <span className={styles.pillText}>{HEALTH_COPY[health]}</span>
            {taskQueue ? <span className={styles.queue}>{taskQueue}</span> : null}
          </span>

          <a
            className={styles.uiLink}
            href="http://localhost:8233"
            target="_blank"
            rel="noreferrer"
            title="Open the Temporal Web UI"
          >
            <span className={styles.linkText}>Workflow UI</span>
            <ArrowUpRight size={12} aria-hidden />
            <span className="srOnly">Open the Temporal Web UI in a new tab</span>
          </a>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.rail}>{rail}</div>
        {children}
      </main>
    </div>
  );
}
