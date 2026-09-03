import type { SupplierHotel, SupplierId } from '../shared/types';

/**
 * Deterministic mock inventory across six Indian cities. Each supplier carries a
 * partly overlapping shelf at different nightly rates, so "who is cheapest"
 * varies by city — Mumbai goes to A, Jaipur to B, and Udaipur is a dead heat
 * that the tie-break has to resolve.
 *
 * Rates are nightly, in whole rupees, and sit in a realistic band: roughly
 * ₹3,000 for a simple guesthouse room up to ₹26,000 for a heritage suite.
 */

interface CatalogEntry {
  hotelId: string;
  name: string;
  neighbourhood: string;
  rating: number;
  /** Nightly rate in INR per supplier. Omit a supplier to keep it off that shelf. */
  nightly: Partial<Record<SupplierId, number>>;
}

const CATALOG: Record<string, CatalogEntry[]> = {
  mumbai: [
    { hotelId: 'bom-001', name: 'Colaba Causeway House', neighbourhood: 'Colaba', rating: 4.6, nightly: { A: 6800, B: 7450 } },
    { hotelId: 'bom-002', name: 'Bandra Sea Rooms', neighbourhood: 'Bandra West', rating: 4.4, nightly: { A: 9200, B: 8900 } },
    { hotelId: 'bom-003', name: 'Fort Heritage Inn', neighbourhood: 'Fort', rating: 4.2, nightly: { A: 4300 } },
    { hotelId: 'bom-004', name: 'Juhu Beach Retreat', neighbourhood: 'Juhu', rating: 4.7, nightly: { B: 12400 } },
    { hotelId: 'bom-005', name: 'Worli Skyline Suites', neighbourhood: 'Worli', rating: 4.8, nightly: { A: 18500, B: 17900 } },
  ],
  'new delhi': [
    { hotelId: 'del-001', name: 'Hauz Khas Courtyard', neighbourhood: 'Hauz Khas', rating: 4.5, nightly: { A: 5600, B: 5900 } },
    { hotelId: 'del-002', name: 'Connaught Circle Rooms', neighbourhood: 'Connaught Place', rating: 4.3, nightly: { A: 7100, B: 6750 } },
    { hotelId: 'del-003', name: 'Nizamuddin Haveli', neighbourhood: 'Nizamuddin', rating: 4.6, nightly: { A: 4850 } },
    { hotelId: 'del-004', name: 'Chanakyapuri Residency', neighbourhood: 'Chanakyapuri', rating: 4.8, nightly: { A: 15200, B: 15800 } },
  ],
  jaipur: [
    { hotelId: 'jai-001', name: 'Amer Fort View', neighbourhood: 'Amer', rating: 4.6, nightly: { A: 5200, B: 4750 } },
    { hotelId: 'jai-002', name: 'Pink City Haveli', neighbourhood: 'Old City', rating: 4.4, nightly: { A: 3900, B: 3600 } },
    { hotelId: 'jai-003', name: 'Civil Lines Bungalow', neighbourhood: 'Civil Lines', rating: 4.3, nightly: { A: 6100 } },
    { hotelId: 'jai-004', name: 'Jal Mahal Terrace', neighbourhood: 'Amer Road', rating: 4.9, nightly: { A: 24500, B: 25900 } },
  ],
  goa: [
    { hotelId: 'goi-001', name: 'Assagao Garden Villa', neighbourhood: 'Assagao', rating: 4.7, nightly: { A: 8400, B: 7950 } },
    { hotelId: 'goi-002', name: 'Fontainhas Latin Quarter Inn', neighbourhood: 'Panjim', rating: 4.5, nightly: { A: 4600, B: 4900 } },
    { hotelId: 'goi-003', name: 'Palolem Beach Huts', neighbourhood: 'Palolem', rating: 4.1, nightly: { B: 3200 } },
    { hotelId: 'goi-004', name: 'Vagator Cliff Rooms', neighbourhood: 'Vagator', rating: 4.3, nightly: { A: 6300 } },
  ],
  udaipur: [
    // Identical rates on both shelves — this city exercises the tie-break path.
    { hotelId: 'udr-001', name: 'Gangaur Ghat House', neighbourhood: 'Lake Pichola', rating: 4.4, nightly: { A: 7900, B: 7900 } },
    { hotelId: 'udr-002', name: 'Fateh Sagar Terrace', neighbourhood: 'Fateh Sagar', rating: 4.2, nightly: { A: 9600, B: 9600 } },
    { hotelId: 'udr-003', name: 'Sajjangarh Ridge Villa', neighbourhood: 'Sajjangarh', rating: 4.7, nightly: { A: 16400, B: 16900 } },
  ],
  kochi: [
    { hotelId: 'cok-001', name: 'Fort Kochi Bungalow', neighbourhood: 'Fort Kochi', rating: 4.6, nightly: { A: 4200, B: 4550 } },
    { hotelId: 'cok-002', name: 'Mattancherry Spice House', neighbourhood: 'Mattancherry', rating: 4.4, nightly: { A: 3350 } },
    { hotelId: 'cok-003', name: 'Marine Drive Waterfront', neighbourhood: 'Marine Drive', rating: 4.2, nightly: { A: 6800, B: 6400 } },
  ],
};

/** Title-cased city names for the UI, with multi-word names handled. */
export const SUPPORTED_CITIES = Object.keys(CATALOG)
  .map((key) => key.replace(/\b\w/g, (c) => c.toUpperCase()))
  .sort();

const CURRENCY = 'INR';

export function lookupHotels(supplier: SupplierId, city: string, nights: number): SupplierHotel[] {
  const entries = CATALOG[city.trim().toLowerCase()];
  if (!entries) return [];

  return entries
    .filter((entry) => entry.nightly[supplier] !== undefined)
    .map((entry) => ({
      hotelId: entry.hotelId,
      name: entry.name,
      price: round2(entry.nightly[supplier]! * nights),
      currency: CURRENCY,
      rating: entry.rating,
      neighbourhood: entry.neighbourhood,
    }));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
