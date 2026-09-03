/**
 * Mirrors `backend/src/shared/types.ts`.
 *
 * Deliberately duplicated rather than shared through a workspace package: the
 * two apps install, build and deploy independently, and the API surface between
 * them is small enough that a single file is cheaper than the tooling a
 * monorepo would need. See the README's "Known limitations".
 */

export type SupplierId = 'A' | 'B';

export type SupplierBehaviorKind = 'normal' | 'slow' | 'timeout' | 'empty' | 'error' | 'flaky';

export interface SupplierBehavior {
  kind: SupplierBehaviorKind;
  delayMs?: number;
  status?: number;
  failures?: number;
}

export type SimulationConfig = Partial<Record<SupplierId, SupplierBehavior>>;

export interface SearchRequest {
  city: string;
  checkIn: string;
  checkOut: string;
  simulation?: SimulationConfig;
}

export interface HotelOffer {
  hotelId: string;
  name: string;
  price: number;
  currency: string;
  rating: number;
  neighbourhood: string;
  supplier: SupplierId;
  supplierName: string;
  nights: number;
  pricePerNight: number;
}

export type SupplierOutcomeStatus = 'FULFILLED' | 'EMPTY' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';

export interface SupplierOutcome {
  supplier: SupplierId;
  supplierName: string;
  status: SupplierOutcomeStatus;
  offerCount: number;
  latencyMs: number;
  attempts: number;
  error?: string;
}

export interface SearchResult {
  status: 'BEST_RATE' | 'NO_HOTELS';
  best: HotelOffer | null;
  offers: HotelOffer[];
  suppliers: SupplierOutcome[];
  request: { city: string; checkIn: string; checkOut: string };
  nights: number;
  elapsedMs: number;
  message?: string;
}

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

export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT' | 'TERMINATED';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

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

export const SUPPLIER_IDS: readonly SupplierId[] = ['A', 'B'];
