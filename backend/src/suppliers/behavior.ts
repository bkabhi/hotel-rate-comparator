import type { SupplierBehavior, SupplierBehaviorKind, SupplierId } from '../shared/types';

const KINDS: readonly SupplierBehaviorKind[] = [
  'normal',
  'slow',
  'timeout',
  'empty',
  'error',
  'flaky',
] as const;

export function isBehaviorKind(value: unknown): value is SupplierBehaviorKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

/**
 * Behaviours travel over the wire as a compact query param so the activity can
 * forward them without a bespoke supplier protocol:
 *   normal | slow:2500 | timeout | empty | error:500 | flaky:2
 */
export function encodeBehavior(behavior: SupplierBehavior): string {
  switch (behavior.kind) {
    case 'slow':
      return `slow:${behavior.delayMs ?? 6000}`;
    case 'error':
      return `error:${behavior.status ?? 503}`;
    case 'flaky':
      return `flaky:${behavior.failures ?? 2}`;
    default:
      return behavior.kind;
  }
}

export function decodeBehavior(raw: string | undefined): SupplierBehavior {
  if (!raw) return { kind: 'normal' };
  const [kind, arg] = raw.split(':');
  if (!isBehaviorKind(kind)) return { kind: 'normal' };
  const numeric = arg === undefined ? undefined : Number.parseInt(arg, 10);
  const valid = numeric !== undefined && !Number.isNaN(numeric);

  switch (kind) {
    case 'slow':
      return { kind, delayMs: valid ? numeric : 6000 };
    case 'error':
      return { kind, status: valid ? numeric : 503 };
    case 'flaky':
      return { kind, failures: valid ? numeric : 2 };
    default:
      return { kind };
  }
}

/**
 * `flaky` needs to remember how many times it has already refused a caller.
 * Keyed by supplier + the caller-supplied idempotency key (the workflow id),
 * so retries of one search share a counter while separate searches do not.
 */
class FlakyLedger {
  private readonly calls = new Map<string, number>();

  /** Returns the 1-based call number for this key. */
  next(supplier: SupplierId, key: string): number {
    const composite = `${supplier}:${key}`;
    const count = (this.calls.get(composite) ?? 0) + 1;
    this.calls.set(composite, count);
    return count;
  }

  reset(): void {
    this.calls.clear();
  }

  get size(): number {
    return this.calls.size;
  }
}

export const flakyLedger = new FlakyLedger();

/** Server-wide defaults, overridable per request. Set via `POST /__mock/config`. */
class BehaviorRegistry {
  private defaults: Record<SupplierId, SupplierBehavior> = {
    A: { kind: 'normal' },
    B: { kind: 'normal' },
  };

  get(supplier: SupplierId): SupplierBehavior {
    return this.defaults[supplier];
  }

  getAll(): Record<SupplierId, SupplierBehavior> {
    return { ...this.defaults };
  }

  set(supplier: SupplierId, behavior: SupplierBehavior): void {
    this.defaults[supplier] = behavior;
  }

  reset(): void {
    this.defaults = { A: { kind: 'normal' }, B: { kind: 'normal' } };
    flakyLedger.reset();
  }
}

export const behaviorRegistry = new BehaviorRegistry();

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
