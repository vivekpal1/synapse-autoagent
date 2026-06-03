import pino, { type Logger } from 'pino';
import { getEnv } from '@autoagent/config';

export type { Logger };

let root: Logger | null = null;

/** Process-wide structured logger. Pretty in dev (TTY), JSON in prod. */
export function getLogger(): Logger {
  if (root) return root;
  const level = getEnv().LOG_LEVEL;
  const pretty = process.stderr.isTTY && process.env.NODE_ENV !== 'production';
  // Structured logs go to STDERR (sync) so they never interleave with the
  // human-readable run summary on STDOUT.
  root = pino(
    { level },
    pretty
      ? pino.transport({
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname', destination: 2 },
        })
      : pino.destination({ fd: 2, sync: true }),
  );
  return root;
}

/** A child logger scoped to a component or run. */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
