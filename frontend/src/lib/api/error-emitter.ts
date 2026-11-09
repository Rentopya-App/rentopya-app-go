import type { ApiError } from "./errors";

/**
 * Global API error toast channel. `unwrap()` emits an error before throwing
 * it, and the react-query Query/MutationCache handlers emit the same rejected
 * error again; callers may also toast it in their own catch. Each ApiError is
 * shown once: emitted errors are remembered (WeakSet), callers that toast an
 * error themselves mark it (`markApiErrorShown`, done by `appToast.apiError`)
 * so a later cache emit stays quiet. Pure module, unit tested.
 */
export type ErrorHandler = (error: ApiError) => void;

let globalErrorHandler: ErrorHandler | null = null;
const emittedErrors = new WeakSet<object>();

export function setGlobalApiErrorHandler(handler: ErrorHandler | null) {
  globalErrorHandler = handler;
}

export function emitApiError(error: ApiError) {
  if (!globalErrorHandler || emittedErrors.has(error)) return;
  emittedErrors.add(error);
  globalErrorHandler(error);
}

/** True when this error has already been toasted by the global handler. */
export function wasApiErrorShown(error: unknown) {
  return typeof error === "object" && error !== null
    ? emittedErrors.has(error)
    : false;
}

/** Record that a caller toasted this error itself; later emits are skipped. */
export function markApiErrorShown(error: unknown) {
  if (typeof error === "object" && error !== null) emittedErrors.add(error);
}
