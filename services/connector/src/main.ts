import { ConfigError, loadConnectorConfig } from '@arlo-tern/shared/config';

import { serviceName } from './index.js';

// Placeholder process: it validates its configuration, then only stays up until it is asked
// to stop, so the container has something to run. The real process replaces this file in a
// later work item.
function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), service: serviceName, event, ...fields }),
  );
}

// A missing or invalid setting stops the process here, before anything else starts. The
// report holds variable names and the rule each one broke, never a value. Do not log the
// loaded configuration either. Later work items keep the returned value and pass it on.
try {
  loadConnectorConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  log('config_invalid', { issues: error.issues });
  process.exit(1);
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
