import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { config } from '../config';
import { SUPPLIER_NAMES, type SupplierHotelsResponse, type SupplierId } from '../shared/types';
import { lookupHotels, SUPPORTED_CITIES } from './catalog';
import { behaviorRegistry, decodeBehavior, flakyLedger, isBehaviorKind, sleep } from './behavior';

/** How long a `timeout` supplier holds the socket open before giving up. */
const HANG_MS = 120_000;

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function healthyLatency(): number {
  return config.suppliers.baseLatencyMs + Math.floor(Math.random() * config.suppliers.jitterLatencyMs);
}

/**
 * One handler serves both suppliers; they differ only in their shelf of
 * inventory and their simulated latency profile.
 */
function makeHotelsHandler(supplier: SupplierId) {
  return async (req: Request, res: Response): Promise<void> => {
    const city = String(req.query.city ?? '').trim();
    const checkIn = String(req.query.checkIn ?? '').trim();
    const checkOut = String(req.query.checkOut ?? '').trim();

    if (!city || !checkIn || !checkOut) {
      res.status(400).json({ error: 'city, checkIn and checkOut are required query parameters' });
      return;
    }

    const nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0) {
      res.status(400).json({ error: 'checkOut must be at least one night after checkIn' });
      return;
    }

    // Per-request behaviour wins over the server-wide default.
    const requested = req.query.behavior ? decodeBehavior(String(req.query.behavior)) : undefined;
    const behavior = requested ?? behaviorRegistry.get(supplier);
    const idempotencyKey = String(req.query.key ?? req.header('x-search-key') ?? 'anonymous');

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    try {
      switch (behavior.kind) {
        case 'error': {
          await sleep(40, abort.signal);
          res
            .status(behavior.status ?? 503)
            .json({ error: `${SUPPLIER_NAMES[supplier]} is temporarily unavailable`, supplier });
          return;
        }

        case 'timeout': {
          // Never answers. The caller's own timeout is what ends this.
          await sleep(HANG_MS, abort.signal);
          res.status(504).json({ error: 'gateway timeout', supplier });
          return;
        }

        case 'slow': {
          await sleep(behavior.delayMs ?? 6000, abort.signal);
          break;
        }

        case 'flaky': {
          const call = flakyLedger.next(supplier, idempotencyKey);
          const failures = behavior.failures ?? 2;
          await sleep(healthyLatency(), abort.signal);
          if (call <= failures) {
            res.status(503).json({
              error: `${SUPPLIER_NAMES[supplier]} rate service degraded (call ${call} of ${failures + 1})`,
              supplier,
              call,
            });
            return;
          }
          break;
        }

        case 'empty': {
          await sleep(healthyLatency(), abort.signal);
          res.json(emptyResponse(supplier, city, checkIn, checkOut, nights));
          return;
        }

        case 'normal':
        default: {
          await sleep(healthyLatency(), abort.signal);
          break;
        }
      }
    } catch {
      // Client hung up mid-delay; nothing left to answer.
      return;
    }

    const hotels = lookupHotels(supplier, city, nights);
    res.json({
      supplier,
      supplierName: SUPPLIER_NAMES[supplier],
      city,
      checkIn,
      checkOut,
      nights,
      hotels,
    } satisfies SupplierHotelsResponse);
  };
}

function emptyResponse(
  supplier: SupplierId,
  city: string,
  checkIn: string,
  checkOut: string,
  nights: number,
): SupplierHotelsResponse {
  return {
    supplier,
    supplierName: SUPPLIER_NAMES[supplier],
    city,
    checkIn,
    checkOut,
    nights,
    hotels: [],
  };
}

export function createSupplierApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/supplierA/hotels', makeHotelsHandler('A'));
  app.get('/supplierB/hotels', makeHotelsHandler('B'));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'mock-suppliers', cities: SUPPORTED_CITIES });
  });

  // --- Test/demo controls -------------------------------------------------
  app.get('/__mock/config', (_req, res) => {
    res.json({ defaults: behaviorRegistry.getAll(), flakyLedgerSize: flakyLedger.size });
  });

  app.post('/__mock/config', (req, res) => {
    const body = req.body as Record<string, { kind?: string; delayMs?: number; status?: number; failures?: number }>;
    for (const supplier of ['A', 'B'] as const) {
      const next = body?.[supplier];
      if (!next) continue;
      if (!isBehaviorKind(next.kind)) {
        res.status(400).json({ error: `Unknown behaviour "${next.kind}" for supplier ${supplier}` });
        return;
      }
      behaviorRegistry.set(supplier, {
        kind: next.kind,
        ...(next.delayMs !== undefined ? { delayMs: next.delayMs } : {}),
        ...(next.status !== undefined ? { status: next.status } : {}),
        ...(next.failures !== undefined ? { failures: next.failures } : {}),
      });
    }
    res.json({ defaults: behaviorRegistry.getAll() });
  });

  app.post('/__mock/reset', (_req, res) => {
    behaviorRegistry.reset();
    res.json({ defaults: behaviorRegistry.getAll() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
