/**
 * Error types matching IAM OpenAPI ErrorResponse envelope.
 * Source of truth: chora-contracts/openapi/iam.yaml §ErrorResponse
 */
import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ErrorDetail {
  code: string;
  message: string;
  correlation_id: string;
  details?: {
    fields?: FieldError[];
    [key: string]: unknown;
  };
}

export interface ErrorResponse {
  error: ErrorDetail;
}

export class ApiError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly status: number;
  readonly fieldErrors: FieldError[];
  readonly details: Record<string, unknown>;
  /**
   * Raw HTTP response body as received (pre-envelope-parse). Some
   * endpoints carry a DOMAIN payload on error statuses (e.g. the
   * mana-pool create 409 returns the EXISTING pool DTO) — without this
   * the interceptor's envelope parse silently discards it (L1
   * CHO-1705 walk-caught).
   */
  readonly body: unknown;

  constructor(
    status: number,
    detail: ErrorDetail,
    body: unknown = null,
  ) {
    super(detail.message);
    this.name = 'ApiError';
    this.code = detail.code;
    this.correlationId = detail.correlation_id;
    this.status = status;
    this.fieldErrors = detail.details?.fields ?? [];
    const { fields: _, ...rest } = detail.details ?? {};
    this.details = rest;
    this.body = body;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Normalised view over the TWO error shapes Chora services observe:
 * `HttpErrorResponse` (HttpTestingController specs / interceptor-less
 * contexts) and `ApiError` (the runtime `errorInterceptor` re-throw).
 *
 * Service `classify()` helpers MUST go through this — matching
 * `err instanceof HttpErrorResponse` alone never fires at runtime
 * because the global interceptor converts every HTTP failure into
 * ApiError (L1 CHO-1705 walk-caught; specs pass without the
 * interceptor chain, production classifies everything NETWORK_ERROR).
 */
export interface HttpErrorView {
  status: number;
  body: unknown;
}

export function httpErrorView(err: unknown): HttpErrorView | null {
  if (err instanceof HttpErrorResponse) {
    return { status: err.status, body: err.error };
  }
  if (isApiError(err)) {
    return { status: err.status, body: err.body };
  }
  return null;
}

/**
 * The gateway's refusal for a validated session that carries no active tenant
 * (chora-gateway wizard_active_tenant.go). PLATFORM_OPERATOR is tenant-less by
 * design, so an operator who reaches the Setup Wizard before switching into an
 * organisation gets this rather than a 401 telling them to sign in again.
 * Shared because the three wizard services all have to tell it apart from a
 * generic conflict.
 */
export const NO_ACTIVE_TENANT_CODE = 'GATEWAY_NO_ACTIVE_TENANT';

/**
 * The envelope's error code, tolerating the two body shapes Chora services
 * observe: the canonical `{error:{code,message}}` and the flat `{code,message}`
 * a few older handlers still write. Returns undefined when the body carries
 * neither, which is a real answer: it means the status is all we know.
 */
export function errorCodeOf(view: HttpErrorView | null): string | undefined {
  const body = view?.body as
    | { error?: { code?: string }; code?: string }
    | undefined;
  return body?.error?.code ?? body?.code;
}

/** The envelope's message, same two shapes as errorCodeOf. */
export function errorMessageOf(view: HttpErrorView | null): string | undefined {
  const body = view?.body as
    | { error?: { message?: string }; message?: string }
    | undefined;
  return body?.error?.message ?? body?.message;
}
