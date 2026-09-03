import { compareOffers, selectBestOffer, sortOffers } from '../../src/temporal/compare';
import { offer } from '../helpers/fixtures';

describe('offer comparison', () => {
  it('picks the cheapest total price', () => {
    const best = selectBestOffer([offer('A', 480), offer('B', 399), offer('A', 512)]);
    expect(best).toMatchObject({ supplier: 'B', price: 399 });
  });

  it('prefers Supplier A when prices are identical', () => {
    expect(selectBestOffer([offer('B', 300), offer('A', 300)])).toMatchObject({ supplier: 'A' });
    expect(selectBestOffer([offer('A', 300), offer('B', 300)])).toMatchObject({ supplier: 'A' });
  });

  it('falls back to hotelId so identical offers from one supplier still order stably', () => {
    const first = offer('A', 300, { hotelId: 'aaa-1' });
    const second = offer('A', 300, { hotelId: 'bbb-2' });
    expect(compareOffers(first, second)).toBeLessThan(0);
    expect(compareOffers(second, first)).toBeGreaterThan(0);
  });

  it('is a total order: sorting is stable regardless of input order', () => {
    const offers = [offer('B', 300), offer('A', 300), offer('A', 250), offer('B', 250)];
    const forward = sortOffers(offers).map((o) => `${o.supplier}${o.price}`);
    const reversed = sortOffers([...offers].reverse()).map((o) => `${o.supplier}${o.price}`);
    expect(forward).toEqual(['A250', 'B250', 'A300', 'B300']);
    expect(reversed).toEqual(forward);
  });

  it('returns null when there is nothing to compare', () => {
    expect(selectBestOffer([])).toBeNull();
  });

  it('does not mutate the input array', () => {
    const offers = [offer('B', 300), offer('A', 100)];
    const snapshot = offers.map((o) => o.price);
    sortOffers(offers);
    expect(offers.map((o) => o.price)).toEqual(snapshot);
  });
});
