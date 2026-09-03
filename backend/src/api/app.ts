import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { Client } from '@temporalio/client';

import { config } from '../config';
import { SUPPORTED_CITIES } from '../suppliers/catalog';
import { ERROR_CODES, type ApiError } from '../shared/types';
import { fieldErrors, searchRequestSchema } from './validation';
import {
  awaitSearch,
  cancelSearch,
  getSearch,
  newSearchId,
  SearchNotFoundError,
  startSearch,
} from './search-service';

export interface ApiDeps {
  /** Resolved lazily so the API can boot before Temporal is reachable. */
  getClient: () => Promise<Client>;
}

export function createApiApp({ getClient }: ApiDeps): Express {
  const app = express();
  app.use(cors({ origin: config.api.corsOrigin }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', async (_req, res) => {
    let temporal = 'connected';
    try {
      const client = await getClient();
      await client.connection.workflowService.getSystemInfo({});
    } catch (err) {
      temporal = err instanceof Error ? `unavailable: ${err.message}` : 'unavailable';
    }
    res.json({ ok: temporal === 'connected', temporal, taskQueue: config.temporal.taskQueue });
  });

  app.get('/api/cities', (_req, res) => {
    res.json({ cities: SUPPORTED_CITIES });
  });

  /**
   * Starts a search and answers immediately with its id. Pass `?wait=1` to
   * block until the workflow closes instead — handy from curl, but the UI polls
   * so it can render progress and offer a cancel button.
   */
  app.post('/api/search-hotels', asyncRoute(async (req, res) => {
    const parsed = searchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_REQUEST,
          message: 'The search could not be started because some details are missing or invalid',
          details: fieldErrors(parsed.error),
        } satisfies ApiError,
      });
      return;
    }

    const client = await getClient();
    const searchId = newSearchId();
    const started = await startSearch(client, parsed.data, searchId);

    if (isTruthy(req.query.wait)) {
      const settled = await withTimeout(awaitSearch(client, searchId), config.api.syncWaitMs);
      res.status(settled.status === 'COMPLETED' ? 200 : 200).json(settled);
      return;
    }

    res.status(202).json(started);
  }));

  app.get('/api/search-hotels/:searchId', asyncRoute(async (req, res) => {
    const searchId = req.params.searchId ?? '';
    const client = await getClient();
    const run = await getSearch(client, searchId);
    res.json(run);
  }));

  app.post('/api/search-hotels/:searchId/cancel', asyncRoute(async (req, res) => {
    const searchId = req.params.searchId ?? '';
    const client = await getClient();
    await cancelSearch(client, searchId);
    res.status(202).json({ searchId, status: 'CANCELLING' });
  }));

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'No such endpoint' } satisfies ApiError,
    });
  });

  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------

type Handler = (req: Request, res: Response) => Promise<void>;

function asyncRoute(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof SearchNotFoundError) {
    res.status(404).json({
      error: {
        code: ERROR_CODES.SEARCH_NOT_FOUND,
        message: 'That search no longer exists. Start a new one.',
      } satisfies ApiError,
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const unreachable = /ECONNREFUSED|UNAVAILABLE|Connection refused|deadline/i.test(message);

  if (unreachable) {
    res.status(503).json({
      error: {
        code: ERROR_CODES.TEMPORAL_UNAVAILABLE,
        message:
          'Cannot reach the Temporal server. Start it with `npm run temporal:dev` in backend/.',
      } satisfies ApiError,
    });
    return;
  }

  console.error('[api] unhandled error:', err);
  res.status(500).json({
    error: { code: ERROR_CODES.INTERNAL, message: 'Something went wrong handling the search' } satisfies ApiError,
  });
}

function isTruthy(value: unknown): boolean {
  return value === '' || value === '1' || value === 'true' || value === true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms} ms waiting for the search`)), ms),
    ),
  ]);
}
