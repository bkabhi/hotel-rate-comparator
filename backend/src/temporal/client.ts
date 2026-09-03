import { Client, Connection } from '@temporalio/client';
import { config } from '../config';

let clientPromise: Promise<Client> | null = null;

/** Lazily-created, process-wide Temporal client. */
export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({ address: config.temporal.address }).then(
      (connection) => new Client({ connection, namespace: config.temporal.namespace }),
    );
    // A failed connection must not be cached, or every later call inherits it.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

export async function closeTemporalClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  clientPromise = null;
  await client?.connection.close();
}
