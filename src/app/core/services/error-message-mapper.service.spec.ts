import { TestBed } from '@angular/core/testing';
import { ErrorMessageMapperService, MappedError } from './error-message-mapper.service';
import { ApiError } from '../interceptors/api-error.model';

function createApiError(status: number, code: string, message = 'Test error'): ApiError {
  return new ApiError(status, {
    code,
    message,
    correlation_id: 'test-corr-id',
  });
}

describe('ErrorMessageMapperService', () => {
  let service: ErrorMessageMapperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ErrorMessageMapperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('mapErrorCode', () => {
    it('should map IAM_DUPLICATE_EMAIL to i18n key', () => {
      expect(service.mapErrorCode('IAM_DUPLICATE_EMAIL')).toBe('errors.iam.duplicate_email');
    });

    it('should map IAM_INVALID_CREDENTIALS to i18n key', () => {
      expect(service.mapErrorCode('IAM_INVALID_CREDENTIALS')).toBe(
        'errors.iam.invalid_credentials',
      );
    });

    it('should map IAM_ACCOUNT_LOCKED to i18n key', () => {
      expect(service.mapErrorCode('IAM_ACCOUNT_LOCKED')).toBe('errors.iam.account_locked');
    });

    it('should map ATOM_NOT_FOUND to i18n key', () => {
      expect(service.mapErrorCode('ATOM_NOT_FOUND')).toBe('errors.atomic.not_found');
    });

    it('should map ATOM_REVISION_IMMUTABLE to i18n key (revision conflict surrogate)', () => {
      expect(service.mapErrorCode('ATOM_REVISION_IMMUTABLE')).toBe(
        'errors.atomic.revision_immutable',
      );
    });

    it('should map ENGAGEMENT_GOAL_EXPIRED to i18n key', () => {
      expect(service.mapErrorCode('ENGAGEMENT_GOAL_EXPIRED')).toBe(
        'errors.engagement.goal_expired',
      );
    });

    it('should map TENANCY_STORAGE_QUOTA_EXCEEDED to i18n key', () => {
      expect(service.mapErrorCode('TENANCY_STORAGE_QUOTA_EXCEEDED')).toBe(
        'errors.tenancy.storage_quota_exceeded',
      );
    });

    it('should return generic fallback for UNKNOWN_ERROR', () => {
      expect(service.mapErrorCode('UNKNOWN_ERROR')).toBe('errors.generic.unknown');
    });

    it('should return generic fallback for unrecognized codes', () => {
      expect(service.mapErrorCode('SOME_UNRECOGNIZED_CODE')).toBe('errors.generic.unknown');
    });

    it('should return generic fallback for empty string', () => {
      expect(service.mapErrorCode('')).toBe('errors.generic.unknown');
    });

    it('should map GENERIC_VALIDATION_ERROR to i18n key', () => {
      expect(service.mapErrorCode('GENERIC_VALIDATION_ERROR')).toBe(
        'errors.generic.validation_error',
      );
    });

    it('should map QUOTA_API_RATE_LIMITED to i18n key', () => {
      expect(service.mapErrorCode('QUOTA_API_RATE_LIMITED')).toBe('errors.quota.api_rate_limited');
    });

    it('should map IAM_SESSION_EXPIRED to i18n key', () => {
      expect(service.mapErrorCode('IAM_SESSION_EXPIRED')).toBe('errors.iam.session_expired');
    });

    it('should map TENANCY_INVITATION_EXPIRED to i18n key', () => {
      expect(service.mapErrorCode('TENANCY_INVITATION_EXPIRED')).toBe(
        'errors.tenancy.invitation_expired',
      );
    });
  });

  describe('mapApiError', () => {
    it('should map a 400 error with known code', () => {
      const error = createApiError(400, 'GENERIC_VALIDATION_ERROR');
      const result: MappedError = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.bad_request');
      expect(result.message).toBe('errors.generic.validation_error');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 401 error with login action', () => {
      const error = createApiError(401, 'IAM_SESSION_EXPIRED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.unauthorized');
      expect(result.message).toBe('errors.iam.session_expired');
      expect(result.actions).toEqual(['errors.actions.login_again']);
    });

    it('should map a 403 error with contact admin action', () => {
      const error = createApiError(403, 'GENERIC_FORBIDDEN');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.forbidden');
      expect(result.message).toBe('errors.generic.forbidden');
      expect(result.actions).toEqual(['errors.actions.contact_admin']);
    });

    it('should map a 404 error without actions', () => {
      const error = createApiError(404, 'ATOM_NOT_FOUND');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.not_found');
      expect(result.message).toBe('errors.atomic.not_found');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 409 conflict error', () => {
      const error = createApiError(409, 'ATOM_REVISION_IMMUTABLE');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.conflict');
      expect(result.message).toBe('errors.atomic.revision_immutable');
    });

    it('should map a 429 rate limit error with wait action', () => {
      const error = createApiError(429, 'QUOTA_API_RATE_LIMITED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.rate_limited');
      expect(result.message).toBe('errors.quota.api_rate_limited');
      expect(result.actions).toEqual(['errors.actions.wait_retry']);
    });

    it('should map a 500 error with retry and support actions', () => {
      const error = createApiError(500, 'GENERIC_INTERNAL_ERROR');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.server_error');
      expect(result.message).toBe('errors.generic.internal_error');
      expect(result.actions).toEqual(['errors.actions.try_again', 'errors.actions.contact_support']);
    });

    it('should map a 503 error with try later action', () => {
      const error = createApiError(503, 'GENERIC_SERVICE_UNAVAILABLE');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.service_unavailable');
      expect(result.message).toBe('errors.generic.service_unavailable');
      expect(result.actions).toEqual(['errors.actions.try_again_later']);
    });

    it('should use generic title for unknown status codes', () => {
      const error = createApiError(418, 'UNKNOWN_ERROR');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.error');
      expect(result.message).toBe('errors.generic.unknown');
      expect(result.actions).toBeUndefined();
    });

    it('should handle unknown error code with known status', () => {
      const error = createApiError(400, 'COMPLETELY_NEW_ERROR_CODE');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.bad_request');
      expect(result.message).toBe('errors.generic.unknown');
    });

    it('should handle zero status code gracefully', () => {
      const error = createApiError(0, 'UNKNOWN_ERROR');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.error');
      expect(result.message).toBe('errors.generic.unknown');
    });

    // --- additional status-title coverage ---
    it('should map a 402 payment-required error with update payment action', () => {
      const error = createApiError(402, 'BILLING_PAYMENT_FAILED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.payment_required');
      expect(result.message).toBe('errors.billing.payment_failed');
      expect(result.actions).toEqual(['errors.actions.update_payment']);
    });

    it('should map a 410 gone error without actions', () => {
      const error = createApiError(410, 'IAM_EXPORT_EXPIRED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.gone');
      expect(result.message).toBe('errors.iam.export_expired');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 413 payload-too-large error', () => {
      const error = createApiError(413, 'CMS_MEDIA_SIZE_EXCEEDED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.payload_too_large');
      expect(result.message).toBe('errors.cms.media_size_exceeded');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 415 unsupported-media-type error', () => {
      const error = createApiError(415, 'CMS_MEDIA_TYPE_NOT_ALLOWED');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.unsupported_media_type');
      expect(result.message).toBe('errors.cms.media_type_not_allowed');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 422 validation error', () => {
      const error = createApiError(422, 'GENERIC_VALIDATION_ERROR');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.validation');
      expect(result.message).toBe('errors.generic.validation_error');
      expect(result.actions).toBeUndefined();
    });

    it('should map a 502 bad-gateway error with try-again-later action', () => {
      const error = createApiError(502, 'GATEWAY_SERVICE_UNAVAILABLE');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.bad_gateway');
      expect(result.message).toBe('errors.gateway.service_unavailable');
      expect(result.actions).toEqual(['errors.actions.try_again_later']);
    });

    it('should map a 504 gateway-timeout error with try-again action', () => {
      const error = createApiError(504, 'GATEWAY_BACKEND_TIMEOUT');
      const result = service.mapApiError(error);

      expect(result.title).toBe('errors.titles.gateway_timeout');
      expect(result.message).toBe('errors.gateway.backend_timeout');
      expect(result.actions).toEqual(['errors.actions.try_again']);
    });

    // --- retryable flag coverage ---
    it('should set retryable=true for a retryable code', () => {
      const error = createApiError(500, 'GENERIC_INTERNAL_ERROR');
      const result = service.mapApiError(error);

      expect(result.retryable).toBe(true);
    });

    it('should set retryable=false for a non-retryable code', () => {
      const error = createApiError(404, 'ATOM_NOT_FOUND');
      const result = service.mapApiError(error);

      expect(result.retryable).toBe(false);
    });

    it('should set retryable=false for an unknown code', () => {
      const error = createApiError(400, 'COMPLETELY_NEW_ERROR_CODE');
      const result = service.mapApiError(error);

      expect(result.retryable).toBe(false);
    });

    it('should NOT include actions key when status has no action mapping', () => {
      const error = createApiError(409, 'GENERIC_CONFLICT');
      const result = service.mapApiError(error);

      expect('actions' in result).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('should return true for GENERIC_INTERNAL_ERROR', () => {
      expect(service.isRetryable('GENERIC_INTERNAL_ERROR')).toBe(true);
    });

    it('should return true for GENERIC_SERVICE_UNAVAILABLE', () => {
      expect(service.isRetryable('GENERIC_SERVICE_UNAVAILABLE')).toBe(true);
    });

    it('should return true for GATEWAY_RATE_LIMIT_EXCEEDED', () => {
      expect(service.isRetryable('GATEWAY_RATE_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should return true for QUOTA_API_RATE_LIMITED', () => {
      expect(service.isRetryable('QUOTA_API_RATE_LIMITED')).toBe(true);
    });

    it('should return true for FAMILIAR_LLM_TIMEOUT', () => {
      expect(service.isRetryable('FAMILIAR_LLM_TIMEOUT')).toBe(true);
    });

    it('should return true for MEDIA_PROCESSOR_SCAN_FAILED', () => {
      expect(service.isRetryable('MEDIA_PROCESSOR_SCAN_FAILED')).toBe(true);
    });

    it('should return true for ANALYTICS_EXPORT_FAILED', () => {
      expect(service.isRetryable('ANALYTICS_EXPORT_FAILED')).toBe(true);
    });

    it('should return false for a non-retryable known code', () => {
      expect(service.isRetryable('ATOM_NOT_FOUND')).toBe(false);
    });

    it('should return false for an unknown code', () => {
      expect(service.isRetryable('SOME_UNKNOWN_CODE')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(service.isRetryable('')).toBe(false);
    });
  });

  describe('mapErrorCode additional domain coverage', () => {
    it('should map FAMILIAR_SAFETY_BLOCKED to i18n key', () => {
      expect(service.mapErrorCode('FAMILIAR_SAFETY_BLOCKED')).toBe(
        'errors.familiar.safety_blocked',
      );
    });

    it('should map CIRCLE_CONNECTION_SELF_REQUEST to i18n key', () => {
      expect(service.mapErrorCode('CIRCLE_CONNECTION_SELF_REQUEST')).toBe(
        'errors.circle.connection_self_request',
      );
    });

    it('should map GAMIFICATION_INSUFFICIENT_BALANCE to i18n key', () => {
      expect(service.mapErrorCode('GAMIFICATION_INSUFFICIENT_BALANCE')).toBe(
        'errors.gamification.insufficient_balance',
      );
    });

    it('should map A2A_GATEWAY_CONSENT_MISSING to i18n key', () => {
      expect(service.mapErrorCode('A2A_GATEWAY_CONSENT_MISSING')).toBe(
        'errors.a2a_gateway.consent_missing',
      );
    });

    it('should map SUPPORT_TICKET_NOT_FOUND to i18n key', () => {
      expect(service.mapErrorCode('SUPPORT_TICKET_NOT_FOUND')).toBe(
        'errors.support.ticket_not_found',
      );
    });

    it('should map EXAM_ADMIN_SITTING_FULL to i18n key', () => {
      expect(service.mapErrorCode('EXAM_ADMIN_SITTING_FULL')).toBe(
        'errors.exam_admin.sitting_full',
      );
    });

    it('should map PARENT_CONSENT_NOT_GRANTED to i18n key', () => {
      expect(service.mapErrorCode('PARENT_CONSENT_NOT_GRANTED')).toBe(
        'errors.parent.consent_not_granted',
      );
    });

    it('should map WBL_INTERNSHIP_FULL to i18n key', () => {
      expect(service.mapErrorCode('WBL_INTERNSHIP_FULL')).toBe('errors.wbl.internship_full');
    });

    it('should map CLASSROOM_QUIZ_ALREADY_STARTED to i18n key', () => {
      expect(service.mapErrorCode('CLASSROOM_QUIZ_ALREADY_STARTED')).toBe(
        'errors.classroom.quiz_already_started',
      );
    });

    it('should map SURVEY_ALREADY_RESPONDED to i18n key', () => {
      expect(service.mapErrorCode('SURVEY_ALREADY_RESPONDED')).toBe(
        'errors.survey.already_responded',
      );
    });

    it('should map TRAINING_SESSION_FULL to i18n key', () => {
      expect(service.mapErrorCode('TRAINING_SESSION_FULL')).toBe('errors.training.session_full');
    });

    it('should map CAMPUS_BOOKING_CONFLICT to i18n key', () => {
      expect(service.mapErrorCode('CAMPUS_BOOKING_CONFLICT')).toBe(
        'errors.campus.booking_conflict',
      );
    });
  });
});
