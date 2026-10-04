/**
 * Error taxonomy.
 *
 * Every failure that crosses a boundary (route handler, server action, data
 * access) is normalised into an AppError. That gives three guarantees:
 * a stable machine-readable `code` for clients, an HTTP status that does not
 * have to be re-derived at each call site, and an explicit `expose` flag so
 * internal messages never reach a user by accident.
 */

export const ERROR_CODES = {
  BAD_REQUEST: { status: 400, expose: true },
  VALIDATION_FAILED: { status: 422, expose: true },
  UNAUTHORIZED: { status: 401, expose: true },
  FORBIDDEN: { status: 403, expose: true },
  NOT_FOUND: { status: 404, expose: true },
  CONFLICT: { status: 409, expose: true },
  RATE_LIMITED: { status: 429, expose: true },
  SERVICE_UNAVAILABLE: { status: 503, expose: false },
  INTERNAL: { status: 500, expose: false },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface AppErrorOptions {
  /** Field-level detail, safe to show the user. */
  details?: Record<string, string[]>;
  /** Original error, kept for logs only — never serialised to a response. */
  cause?: unknown;
  /** Override the default exposure rule for this code. */
  expose?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly details?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.expose = options.expose ?? ERROR_CODES[code].expose;
    this.details = options.details;
  }
}

/** Shorthand constructors for the codes used most often. */
export const errors = {
  badRequest: (message = "The request could not be read.", options?: AppErrorOptions) =>
    new AppError("BAD_REQUEST", message, options),
  validation: (message = "Some fields need attention.", options?: AppErrorOptions) =>
    new AppError("VALIDATION_FAILED", message, options),
  unauthorized: (message = "Sign in to continue.", options?: AppErrorOptions) =>
    new AppError("UNAUTHORIZED", message, options),
  forbidden: (message = "This account cannot access that resource.", options?: AppErrorOptions) =>
    new AppError("FORBIDDEN", message, options),
  notFound: (message = "That resource does not exist.", options?: AppErrorOptions) =>
    new AppError("NOT_FOUND", message, options),
  conflict: (message = "That resource already exists.", options?: AppErrorOptions) =>
    new AppError("CONFLICT", message, options),
  internal: (message = "Something went wrong on our side.", options?: AppErrorOptions) =>
    new AppError("INTERNAL", message, options),
};

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Wrap any thrown value into an AppError so downstream code has one shape. */
export function normalizeError(value: unknown): AppError {
  if (isAppError(value)) return value;

  if (value instanceof Error) {
    return new AppError("INTERNAL", value.message, { cause: value });
  }

  return new AppError("INTERNAL", "An unknown error was thrown.", { cause: value });
}

export interface PublicError {
  code: ErrorCode;
  message: string;
  details?: Record<string, string[]>;
}

/** Strip anything the caller should not see. */
export function toPublicError(error: AppError): PublicError {
  return {
    code: error.code,
    message: error.expose ? error.message : "Something went wrong on our side.",
    ...(error.expose && error.details ? { details: error.details } : {}),
  };
}
