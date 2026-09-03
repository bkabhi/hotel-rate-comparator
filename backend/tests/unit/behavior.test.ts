import { decodeBehavior, encodeBehavior, isBehaviorKind } from '../../src/suppliers/behavior';
import type { SupplierBehavior } from '../../src/shared/types';

describe('behaviour encoding', () => {
  const cases: SupplierBehavior[] = [
    { kind: 'normal' },
    { kind: 'timeout' },
    { kind: 'empty' },
    { kind: 'slow', delayMs: 6000 },
    { kind: 'error', status: 500 },
    { kind: 'flaky', failures: 2 },
  ];

  it.each(cases)('round-trips %j', (behavior) => {
    expect(decodeBehavior(encodeBehavior(behavior))).toEqual(behavior);
  });

  it('fills in defaults for parameterised behaviours', () => {
    expect(decodeBehavior('slow')).toEqual({ kind: 'slow', delayMs: 6000 });
    expect(decodeBehavior('error')).toEqual({ kind: 'error', status: 503 });
    expect(decodeBehavior('flaky')).toEqual({ kind: 'flaky', failures: 2 });
  });

  it('falls back to normal for unknown or missing input', () => {
    expect(decodeBehavior(undefined)).toEqual({ kind: 'normal' });
    expect(decodeBehavior('explode')).toEqual({ kind: 'normal' });
    expect(isBehaviorKind('explode')).toBe(false);
    expect(isBehaviorKind('flaky')).toBe(true);
  });
});
