import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../config';
import * as activities from './activities';

async function run(): Promise<void> {
  const connection = await NativeConnection.connect({ address: config.temporal.address });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: path.join(__dirname, 'workflows.ts'),
    activities,
  });

  console.log(`[worker] polling "${config.temporal.taskQueue}" on ${config.temporal.address}`);
  console.log(`[worker] suppliers at ${config.suppliers.baseUrl}`);

  const shutdown = () => {
    console.log('\n[worker] shutting down…');
    worker.shutdown();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
