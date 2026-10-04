/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line in production so log aggregators can index
 * fields, and a readable single line in development. Swapping in Pino or
 * OpenTelemetry later means replacing this file only.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogContext = Record<string, unknown>;

function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVELS) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function write(level: LogLevel, message: string, context?: LogContext) {
  if (LEVELS[level] < LEVELS[activeLevel()]) return;

  const entry = { level, time: new Date().toISOString(), message, ...context };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `${level.toUpperCase().padEnd(5)} ${message}${
          context ? ` ${JSON.stringify(context)}` : ""
        }`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
