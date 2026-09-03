import { fieldErrors, nightsBetween, searchRequestSchema } from '../../src/api/validation';

function parse(input: unknown) {
  return searchRequestSchema.safeParse(input);
}

const VALID = { city: 'Mumbai', checkIn: '2026-05-01', checkOut: '2026-05-04' };

describe('search request validation', () => {
  it('accepts a well-formed request', () => {
    const result = parse(VALID);
    expect(result.success).toBe(true);
  });

  it('trims the city and rejects blank input', () => {
    expect(parse({ ...VALID, city: '  Mumbai  ' }).success).toBe(true);
    const blank = parse({ ...VALID, city: ' ' });
    expect(blank.success).toBe(false);
    expect(fieldErrors(blank.error!)).toHaveProperty('city');
  });

  it('rejects malformed dates', () => {
    const bad = parse({ ...VALID, checkIn: '01/05/2026' });
    expect(bad.success).toBe(false);
    expect(fieldErrors(bad.error!).checkIn).toMatch(/YYYY-MM-DD/);
  });

  it('rejects dates that are not real days', () => {
    expect(parse({ ...VALID, checkIn: '2026-02-31' }).success).toBe(false);
  });

  it('requires check-out to be after check-in', () => {
    const sameDay = parse({ ...VALID, checkOut: VALID.checkIn });
    expect(sameDay.success).toBe(false);
    expect(fieldErrors(sameDay.error!).checkOut).toMatch(/at least one night/i);

    const reversed = parse({ city: 'Mumbai', checkIn: '2026-05-04', checkOut: '2026-05-01' });
    expect(reversed.success).toBe(false);
  });

  it('rejects stays longer than 30 nights', () => {
    const long = parse({ city: 'Mumbai', checkIn: '2026-05-01', checkOut: '2026-07-01' });
    expect(long.success).toBe(false);
    expect(fieldErrors(long.error!).checkOut).toMatch(/30 nights/);
  });

  it('accepts supplier simulation directives', () => {
    const result = parse({
      ...VALID,
      simulation: { A: { kind: 'error', status: 500 }, B: { kind: 'slow', delayMs: 6000 } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown simulation behaviour', () => {
    expect(parse({ ...VALID, simulation: { A: { kind: 'explode' } } }).success).toBe(false);
  });

  it('counts nights inclusively of the check-in day only', () => {
    expect(nightsBetween('2026-05-01', '2026-05-04')).toBe(3);
    expect(nightsBetween('2026-05-01', '2026-05-01')).toBe(0);
  });
});
