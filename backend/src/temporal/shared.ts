import { defineQuery } from '@temporalio/workflow';
import type { SearchProgress } from '../shared/types';

/** Live per-supplier state, readable while the workflow is still running. */
export const searchProgressQuery = defineQuery<SearchProgress>('searchProgress');

/** Prefix for generated workflow ids; also the API's `searchId`. */
export const SEARCH_ID_PREFIX = 'hotel-search';
