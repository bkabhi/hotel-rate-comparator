import { ERROR_CODES, type ErrorCode } from './types';

/** Error types the activity marks non-retryable, mirrored in the retry policy. */
export const NON_RETRYABLE_ERROR_TYPES = ['InvalidSearchRequest', 'SupplierEmptyResponse'] as const;

/** Thrown by request validation; never worth retrying. */
export class InvalidSearchRequestError extends Error {
  override readonly name = 'InvalidSearchRequest';
  readonly code: ErrorCode = ERROR_CODES.INVALID_REQUEST;
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

/**
 * A supplier answered with something unusable — non-2xx, malformed body or a
 * transport failure. Retryable: the next attempt may well succeed.
 */
export class SupplierUnavailableError extends Error {
  override readonly name = 'SupplierUnavailable';
  constructor(message: string) {
    super(message);
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
