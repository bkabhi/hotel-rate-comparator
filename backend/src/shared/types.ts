/**
 * The domain contract shared by the API, the Temporal workflow, the activities
 * and the mock suppliers. `frontend/src/api/contract.ts` mirrors this file.
 */

export type SupplierId = 'A' | 'B';

/** Priority order used to break price ties deterministically. */
export const SUPPLIER_IDS: readonly SupplierId[] = ['A', 'B'] as const;

export const SUPPLIER_NAMES: Record<SupplierId, string> = {
  A: 'Sarai Travel',
  B: 'Nivaas Rooms',
};

// ---------------------------------------------------------------------------
// Supplier behaviour simulation
// ---------------------------------------------------------------------------

/**
 * Forces a mock supplier down a specific code path so every scenario in the
 * brief can be reproduced on demand instead of waited for.
 */
export type SupplierBehaviorKind =
  | 'normal'
  | 'slow'
  | 'timeout'
  | 'empty'
  | 'error'
  | 'flaky';

export interface SupplierBehavior {
  kind: SupplierBehaviorKind;
  /** `slow` only — how long the supplier stalls before answering. */
  delayMs?: number;
  /** `error` only — HTTP status to answer with. Defaults to 503. */
  status?: number;
  /** `flaky` only — how many calls fail before the supplier recovers. */
  failures?: number;
}

export type SimulationConfig = Partial<Record<SupplierId, SupplierBehavior>>;

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

export interface SearchRequest {
  city: string;
  /** ISO date, YYYY-MM-DD. */
  checkIn: string;
  /** ISO date, YYYY-MM-DD. Must be after `checkIn`. */
  checkOut: string;
  simulation?: SimulationConfig;
}

// ---------------------------------------------------------------------------
// Supplier output
// ---------------------------------------------------------------------------

/** Exactly what a supplier endpoint returns per hotel. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  /** Total price for the whole stay, in `currency` (INR throughout). */
  price: number;
  currency: string;
  rating: number;
  neighbourhood: string;
}

export interface SupplierHotelsResponse {
  supplier: SupplierId;
  supplierName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  hotels: SupplierHotel[];
}

/** A supplier hotel, tagged with where it came from. */
export interface HotelOffer extends SupplierHotel {
  supplier: SupplierId;
  supplierName: string;
  nights: number;
  /** `price / nights`, rounded to cents. */
  pricePerNight: number;
}

/** What the `fetchSupplierRates` activity hands back to the workflow. */
export interface SupplierFetchResult {
  supplier: SupplierId;
  offers: HotelOffer[];
  latencyMs: number;
  /** 1-based Temporal activity attempt that produced this result. */
  attempt: number;
}

// ---------------------------------------------------------------------------
// Workflow output
// ---------------------------------------------------------------------------

export type SupplierOutcomeStatus =
  /** Answered with at least one hotel. */
  | 'FULFILLED'
  /** Answered, but with no hotels for these dates. */
  | 'EMPTY'
  /** Exhausted its retry policy without a usable answer. */
  | 'FAILED'
  /** Blew the per-supplier deadline and was cancelled mid-flight. */
  | 'TIMED_OUT'
  /** The whole search was cancelled before this supplier answered. */
  | 'CANCELLED';

export interface SupplierOutcome {
  supplier: SupplierId;
  supplierName: string;
  status: SupplierOutcomeStatus;
  offerCount: number;
  latencyMs: number;
  attempts: number;
  /** Human-readable reason, present on FAILED / TIMED_OUT / CANCELLED. */
  error?: string;
}

export type SearchStatus = 'BEST_RATE' | 'NO_HOTELS';

export interface SearchResult {
  status: SearchStatus;
  /** Cheapest offer across every supplier that answered. Null when NO_HOTELS. */
  best: HotelOffer | null;
  /** Every offer received, cheapest first. */
  offers: HotelOffer[];
  suppliers: SupplierOutcome[];
  request: Omit<SearchRequest, 'simulation'>;
  nights: number;
  /** Wall-clock duration of the supplier fan-out, in ms. */
  elapsedMs: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Live progress (exposed as a Temporal query while the workflow runs)
// ---------------------------------------------------------------------------

export type SupplierProgressStatus =
  | 'PENDING'
  | 'CALLING'
  | 'RETRYING'
  | 'FULFILLED'
  | 'EMPTY'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED';

export interface SupplierProgress {
  supplier: SupplierId;
  supplierName: string;
  status: SupplierProgressStatus;
  attempts: number;
  offerCount: number;
  error?: string;
}

export interface SearchProgress {
  phase: 'STARTING' | 'FETCHING' | 'COMPARING' | 'DONE';
  suppliers: SupplierProgress[];
}

// ---------------------------------------------------------------------------
// REST API contract
// ---------------------------------------------------------------------------

export type RunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'TERMINATED';

export interface StartSearchResponse {
  searchId: string;
  runId: string;
  status: 'RUNNING';
  startedAt: string;
}

export interface SearchRunResponse {
  searchId: string;
  status: RunStatus;
  startedAt: string;
  closedAt?: string;
  progress?: SearchProgress;
  result?: SearchResult;
  error?: ApiError;
}

export interface ApiError {
  /** Stable machine-readable code, e.g. `ALL_SUPPLIERS_FAILED`. */
  code: string;
  message: string;
  details?: unknown;
}

/** Error codes the workflow and API can produce. */
export const ERROR_CODES = {
  ALL_SUPPLIERS_FAILED: 'ALL_SUPPLIERS_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  SEARCH_NOT_FOUND: 'SEARCH_NOT_FOUND',
  SEARCH_CANCELLED: 'SEARCH_CANCELLED',
  TEMPORAL_UNAVAILABLE: 'TEMPORAL_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
