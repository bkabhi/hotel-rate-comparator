import { SUPPLIER_IDS, type HotelOffer } from '../shared/types';

/**
 * Orders offers cheapest-first with a fully deterministic tie-break, so the
 * same set of supplier responses always yields the same winner on replay:
 *
 *   1. lower total price
 *   2. supplier priority (A before B) — the brief's "pick deterministically"
 *   3. hotelId, alphabetically, as a final backstop
 */
export function compareOffers(a: HotelOffer, b: HotelOffer): number {
  if (a.price !== b.price) return a.price - b.price;

  const priority = SUPPLIER_IDS.indexOf(a.supplier) - SUPPLIER_IDS.indexOf(b.supplier);
  if (priority !== 0) return priority;

  return a.hotelId.localeCompare(b.hotelId);
}

export function sortOffers(offers: readonly HotelOffer[]): HotelOffer[] {
  return [...offers].sort(compareOffers);
}

/** The cheapest offer, or null when nothing was on offer at all. */
export function selectBestOffer(offers: readonly HotelOffer[]): HotelOffer | null {
  if (offers.length === 0) return null;
  return sortOffers(offers)[0]!;
}
