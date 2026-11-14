import { serviceName } from './index.js';

// Placeholder process: it only stays up until it is asked to stop, so the container
// has something to run. The real process replaces this file in a later work item.
function log(event: string, fields: Record<string, string> = {}): void {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), service: serviceName, event, ...fields }),
  );
}

// Signal listeners alone do not keep the event loop alive.
const keepAlive = setInterval(() => undefined, 60_000);

function stop(signal: NodeJS.Signals): void {
  log('stopping', { signal });
  clearInterval(keepAlive);
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);

log('started');
