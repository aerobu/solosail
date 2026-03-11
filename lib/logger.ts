/**
 * Structured logger. Thin wrapper over console that adds ISO timestamps
 * and session correlation. Swap the console.* calls for Axiom/Sentry when ready.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogContext {
  sessionId?: string;
  agent?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ?? {}),
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info:  (message: string, context?: LogContext) => log("info",  message, context),
  warn:  (message: string, context?: LogContext) => log("warn",  message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
  debug: (message: string, context?: LogContext) => log("debug", message, context),
};
