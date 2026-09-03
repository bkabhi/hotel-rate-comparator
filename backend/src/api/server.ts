import { config } from '../config';
import { createApiApp } from './app';
import { closeTemporalClient, getTemporalClient } from '../temporal/client';

const app = createApiApp({ getClient: getTemporalClient });

const server = app.listen(config.api.port, () => {
  console.log(`[api] listening on http://localhost:${config.api.port}`);
  console.log(`[api]   POST /api/search-hotels            start a search`);
  console.log(`[api]   GET  /api/search-hotels/:searchId  poll status, progress and result`);
  console.log(`[api]   POST /api/search-hotels/:id/cancel cancel a running search`);
  console.log(`[api] temporal ${config.temporal.address} · queue "${config.temporal.taskQueue}"`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[api] ${signal} received, closing…`);
  server.close();
  await closeTemporalClient();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
