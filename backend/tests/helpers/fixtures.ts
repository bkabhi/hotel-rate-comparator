import type { HotelOffer, SearchRequest, SupplierFetchResult, SupplierId } from '../../src/shared/types';
import { SUPPLIER_NAMES } from '../../src/shared/types';

export const SEARCH: SearchRequest = {
  city: 'Mumbai',
  checkIn: '2026-05-01',
  checkOut: '2026-05-04',
};

export const NIGHTS = 3;

export function offer(
  supplier: SupplierId,
  price: number,
  overrides: Partial<HotelOffer> = {},
): HotelOffer {
  return {
    hotelId: `${supplier.toLowerCase()}-${price}`,
    name: `Hotel ${supplier}${price}`,
    price,
    currency: 'INR',
    rating: 4.4,
    neighbourhood: 'Colaba',
    supplier,
    supplierName: SUPPLIER_NAMES[supplier],
    nights: NIGHTS,
    pricePerNight: Math.round((price / NIGHTS) * 100) / 100,
    ...overrides,
  };
}

export function fetchResult(
  supplier: SupplierId,
  offers: HotelOffer[],
  overrides: Partial<SupplierFetchResult> = {},
): SupplierFetchResult {
  return {
    supplier,
    offers,
    latencyMs: 120,
    attempt: 1,
    ...overrides,
  };
}
