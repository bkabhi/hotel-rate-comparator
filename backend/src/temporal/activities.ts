import { Context } from '@temporalio/activity';
import { config } from '../config';
import { SupplierUnavailableError } from '../shared/errors';
import { round2 } from '../suppliers/catalog';
import { encodeBehavior } from '../suppliers/behavior';
import {
  SUPPLIER_NAMES,
  type HotelOffer,
  type SearchRequest,
  type SupplierFetchResult,
  type SupplierHotel,
  type SupplierHotelsResponse,
  type SupplierId,
} from '../shared/types';

const SUPPLIER_PATHS: Record<SupplierId, string> = {
  A: '/supplierA/hotels',
  B: '/supplierB/hotels',
};

/**
 * Calls one supplier's rate endpoint and normalises the answer.
 *
 * Everything unusable — non-2xx, malformed body, transport failure — is thrown
 * as a retryable `SupplierUnavailable`, so Temporal's retry policy owns the
 * "fail twice then succeed" case. An empty hotel list is *not* an error: it is
 * a legitimate answer that the workflow has to reason about.
 *
 * The activity's abort signal is wired to `fetch`, so when the workflow cancels
 * a slow supplier the in-flight HTTP request is torn down rather than orphaned.
 */
export async function fetchSupplierRates(
  supplier: SupplierId,
  request: SearchRequest,
  /** Stable per-search key so the mock supplier can count retries. */
  searchKey: string,
): Promise<SupplierFetchResult> {
  const ctx = Context.current();
  const attempt = ctx.info.attempt;
  const startedAt = Date.now();

  const url = new URL(SUPPLIER_PATHS[supplier], config.suppliers.baseUrl);
  url.searchParams.set('city', request.city);
  url.searchParams.set('checkIn', request.checkIn);
  url.searchParams.set('checkOut', request.checkOut);
  url.searchParams.set('key', searchKey);

  const behavior = request.simulation?.[supplier];
  if (behavior) url.searchParams.set('behavior', encodeBehavior(behavior));

  ctx.log.info('Calling supplier', { supplier, attempt, url: url.pathname });

  let response: Response;
  try {
    response = await fetch(url, {
      signal: ctx.cancellationSignal,
      headers: { accept: 'application/json' },
    });
  } catch (err) {
    if (ctx.cancellationSignal.aborted) throw err;
    throw new SupplierUnavailableError(
      `${SUPPLIER_NAMES[supplier]} did not respond: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new SupplierUnavailableError(
      `${SUPPLIER_NAMES[supplier]} returned HTTP ${response.status}`,
    );
  }

  let body: SupplierHotelsResponse;
  try {
    body = (await response.json()) as SupplierHotelsResponse;
  } catch {
    throw new SupplierUnavailableError(`${SUPPLIER_NAMES[supplier]} returned a malformed payload`);
  }

  if (!Array.isArray(body.hotels)) {
    throw new SupplierUnavailableError(`${SUPPLIER_NAMES[supplier]} returned no hotel list`);
  }

  const nights = body.nights > 0 ? body.nights : 1;
  const offers = body.hotels.filter(isUsableHotel).map((hotel) => toOffer(hotel, supplier, nights));

  return {
    supplier,
    offers,
    latencyMs: Date.now() - startedAt,
    attempt,
  };
}

function isUsableHotel(hotel: SupplierHotel): boolean {
  return (
    typeof hotel?.hotelId === 'string' &&
    typeof hotel?.name === 'string' &&
    typeof hotel?.price === 'number' &&
    Number.isFinite(hotel.price) &&
    hotel.price > 0
  );
}

function toOffer(hotel: SupplierHotel, supplier: SupplierId, nights: number): HotelOffer {
  return {
    ...hotel,
    currency: hotel.currency ?? 'INR',
    supplier,
    supplierName: SUPPLIER_NAMES[supplier],
    nights,
    pricePerNight: round2(hotel.price / nights),
  };
}

export type Activities = {
  fetchSupplierRates: typeof fetchSupplierRates;
};
