import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { WebAuthnService } from './webauthn.service';

const BASE = 'https://api.chora.site';

describe('WebAuthnService', () => {
  let service: WebAuthnService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), WebAuthnService],
    });
    service = TestBed.inject(WebAuthnService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('isSupported', () => {
    it('should return a boolean based on PublicKeyCredential availability', () => {
      const result = service.isSupported();
      expect(typeof result).toBe('boolean');
    });

    it('should return true when window.PublicKeyCredential and navigator.credentials are present', () => {
      const winPk = window.PublicKeyCredential;
      const navCred = navigator.credentials;
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: function PublicKeyCredentialStub() {},
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'credentials', {
        value: { create: vi.fn(), get: vi.fn() },
        writable: true,
        configurable: true,
      });

      expect(service.isSupported()).toBe(true);

      // restore
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: winPk,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'credentials', {
        value: navCred,
        writable: true,
        configurable: true,
      });
    });

    it('should return false when window.PublicKeyCredential is undefined (&& short-circuit)', () => {
      const winPk = window.PublicKeyCredential;
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(service.isSupported()).toBe(false);

      Object.defineProperty(window, 'PublicKeyCredential', {
        value: winPk,
        writable: true,
        configurable: true,
      });
    });

    it('should return false when navigator.credentials is undefined (&& short-circuit)', () => {
      const winPk = window.PublicKeyCredential;
      const navCred = navigator.credentials;
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: function PublicKeyCredentialStub() {},
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'credentials', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(service.isSupported()).toBe(false);

      Object.defineProperty(window, 'PublicKeyCredential', {
        value: winPk,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'credentials', {
        value: navCred,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('bufferToBase64url', () => {
    it('should convert ArrayBuffer to base64url string', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
      const result = service.bufferToBase64url(buffer);
      expect(result).toBe('SGVsbG8');
    });

    it('should not contain +, /, or = characters', () => {
      const buffer = new Uint8Array([255, 254, 253]).buffer;
      const result = service.bufferToBase64url(buffer);
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toContain('=');
    });

    it('should handle empty buffer (empty for-of loop)', () => {
      const buffer = new Uint8Array([]).buffer;
      const result = service.bufferToBase64url(buffer);
      expect(result).toBe('');
    });
  });

  describe('base64urlToBuffer', () => {
    it('should convert base64url string to ArrayBuffer', () => {
      const result = service.base64urlToBuffer('SGVsbG8');
      const bytes = new Uint8Array(result);
      expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
    });

    it('should handle base64url roundtrip', () => {
      const original = new Uint8Array([1, 2, 3, 4]);
      const b64 = service.bufferToBase64url(original.buffer);
      const roundtrip = new Uint8Array(service.base64urlToBuffer(b64));
      expect(Array.from(roundtrip)).toEqual([1, 2, 3, 4]);
    });

    it('should handle padding correctly', () => {
      const buffer = new Uint8Array([1]).buffer;
      const b64 = service.bufferToBase64url(buffer);
      const roundtrip = new Uint8Array(service.base64urlToBuffer(b64));
      expect(Array.from(roundtrip)).toEqual([1]);
    });

    it('should handle a string requiring no padding (modulo-4 length)', () => {
      // 'AAAA' has length 4 → (4 - 0) % 4 === 0 → no '=' appended
      const result = service.base64urlToBuffer('AAAA');
      const bytes = new Uint8Array(result);
      expect(Array.from(bytes)).toEqual([0, 0, 0]);
    });
  });

  describe('register', () => {
    it('should POST to register/begin with gcid', () => {
      Object.defineProperty(navigator, 'credentials', {
        value: { create: vi.fn().mockResolvedValue(null) },
        writable: true,
        configurable: true,
      });

      service.register('gcid-123').subscribe({ error: () => { /* test ignores error */ } });

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/auth/webauthn/register/begin'),
      );
      expect(req.request.body).toEqual({ gcid: 'gcid-123' });
      req.flush({ options: { challenge: 'Y2hhbGxlbmdl', user: { id: 'dXNlci1pZA' } } });
    });

    it('should complete the full register flow with string challenge + user.id (decode true arms)', async () => {
      const created: PublicKeyCredential = {
        id: 'cred-id-1',
        rawId: new Uint8Array([1, 2, 3]).buffer,
        type: 'public-key',
        response: {
          attestationObject: new Uint8Array([10, 11]).buffer,
          clientDataJSON: new Uint8Array([20, 21]).buffer,
        } as AuthenticatorAttestationResponse,
      } as unknown as PublicKeyCredential;

      const createSpy = vi.fn().mockResolvedValue(created);
      Object.defineProperty(navigator, 'credentials', {
        value: { create: createSpy },
        writable: true,
        configurable: true,
      });

      const promise = firstValueFrom(service.register('gcid-789'));

      const beginReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/begin`);
      expect(beginReq.request.method).toBe('POST');
      // both challenge AND user.id are strings -> both decode if-branches run (true path)
      beginReq.flush({ options: { challenge: 'Y2hhbGxlbmdl', user: { id: 'dXNlci1pZA' } } });

      // allow the navigator.credentials.create promise + switchMap microtasks to flush
      await Promise.resolve();
      await Promise.resolve();

      const finishReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/finish`);
      expect(finishReq.request.method).toBe('POST');
      expect(finishReq.request.body.gcid).toBe('gcid-789');
      expect(finishReq.request.body.attestation_response.id).toBe('cred-id-1');
      expect(finishReq.request.body.attestation_response.type).toBe('public-key');
      finishReq.flush({ id: 'reg-1', gcid: 'gcid-789', created_at: '2026-06-04T00:00:00Z' });

      const result = await promise;
      expect(result.id).toBe('reg-1');

      // verify decoded options passed to create had ArrayBuffer challenge + user.id
      const decoded = createSpy.mock.calls[0][0].publicKey;
      expect(decoded.challenge).toBeInstanceOf(ArrayBuffer);
      expect(decoded.user.id).toBeInstanceOf(ArrayBuffer);
    });

    it('should leave non-string challenge and absent user untouched (decode false arms)', async () => {
      const created: PublicKeyCredential = {
        id: 'cred-id-2',
        rawId: new Uint8Array([4, 5]).buffer,
        type: 'public-key',
        response: {
          attestationObject: new Uint8Array([30]).buffer,
          clientDataJSON: new Uint8Array([31]).buffer,
        } as AuthenticatorAttestationResponse,
      } as unknown as PublicKeyCredential;

      const createSpy = vi.fn().mockResolvedValue(created);
      Object.defineProperty(navigator, 'credentials', {
        value: { create: createSpy },
        writable: true,
        configurable: true,
      });

      const promise = firstValueFrom(service.register('gcid-nostr'));

      const beginReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/begin`);
      // challenge is NOT a string (number) -> if-false; user absent -> && short-circuit (false)
      beginReq.flush({ options: { challenge: 12345, rp: { name: 'Chora' } } });

      await Promise.resolve();
      await Promise.resolve();

      const finishReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/finish`);
      finishReq.flush({ id: 'reg-2', gcid: 'gcid-nostr', created_at: '2026-06-04T00:00:00Z' });

      const result = await promise;
      expect(result.id).toBe('reg-2');

      const decoded = createSpy.mock.calls[0][0].publicKey;
      // untouched: challenge stays a number, no user key
      expect(decoded.challenge).toBe(12345);
      expect(decoded.user).toBeUndefined();
    });

    it('should pass user through untouched when user present but user.id is not a string (&& through, id false)', async () => {
      const created: PublicKeyCredential = {
        id: 'cred-id-3',
        rawId: new Uint8Array([7]).buffer,
        type: 'public-key',
        response: {
          attestationObject: new Uint8Array([40]).buffer,
          clientDataJSON: new Uint8Array([41]).buffer,
        } as AuthenticatorAttestationResponse,
      } as unknown as PublicKeyCredential;

      const createSpy = vi.fn().mockResolvedValue(created);
      Object.defineProperty(navigator, 'credentials', {
        value: { create: createSpy },
        writable: true,
        configurable: true,
      });

      const promise = firstValueFrom(service.register('gcid-uid-num'));

      const beginReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/begin`);
      // user present (&& left truthy) but user.id is a number (right false) -> inner assignment skipped
      beginReq.flush({ options: { challenge: 'Y2hhbGxlbmdl', user: { id: 999, name: 'a' } } });

      await Promise.resolve();
      await Promise.resolve();

      const finishReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/register/finish`);
      finishReq.flush({ id: 'reg-3', gcid: 'gcid-uid-num', created_at: '2026-06-04T00:00:00Z' });

      const result = await promise;
      expect(result.id).toBe('reg-3');

      const decoded = createSpy.mock.calls[0][0].publicKey;
      expect(decoded.user.id).toBe(999);
    });
  });

  describe('login', () => {
    it('should POST to login/begin with email', () => {
      Object.defineProperty(navigator, 'credentials', {
        value: { get: vi.fn().mockResolvedValue(null) },
        writable: true,
        configurable: true,
      });

      service.login('user@chora.app').subscribe({ error: () => { /* test ignores error */ } });

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/auth/webauthn/login/begin'),
      );
      expect(req.request.body).toEqual({ email: 'user@chora.app' });
      req.flush({ options: { challenge: 'Y2hhbGxlbmdl' } });
    });

    it('should POST to login/begin with undefined email when omitted (default param)', () => {
      Object.defineProperty(navigator, 'credentials', {
        value: { get: vi.fn().mockResolvedValue(null) },
        writable: true,
        configurable: true,
      });

      service.login().subscribe({ error: () => { /* test ignores error */ } });

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/auth/webauthn/login/begin'),
      );
      expect(req.request.body).toEqual({ email: undefined });
      req.flush({ options: { challenge: 'Y2hhbGxlbmdl' } });
    });

    it('should complete full login flow with userHandle present (ternary truthy) + allowCredentials decode', async () => {
      const assertion: PublicKeyCredential = {
        id: 'login-cred-1',
        rawId: new Uint8Array([1]).buffer,
        type: 'public-key',
        response: {
          authenticatorData: new Uint8Array([50]).buffer,
          clientDataJSON: new Uint8Array([51]).buffer,
          signature: new Uint8Array([52]).buffer,
          userHandle: new Uint8Array([53]).buffer,
        } as AuthenticatorAssertionResponse,
      } as unknown as PublicKeyCredential;

      const getSpy = vi.fn().mockResolvedValue(assertion);
      Object.defineProperty(navigator, 'credentials', {
        value: { get: getSpy },
        writable: true,
        configurable: true,
      });

      const promise = firstValueFrom(service.login('u@chora.app'));

      const beginReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/login/begin`);
      // challenge string (decode true) + allowCredentials array (Array.isArray true);
      // first cred.id string (ternary true), second cred.id number (ternary false)
      beginReq.flush({
        options: {
          challenge: 'Y2hhbGxlbmdl',
          allowCredentials: [
            { id: 'Y3JlZA', type: 'public-key' },
            { id: 42, type: 'public-key' },
          ],
        },
      });

      await Promise.resolve();
      await Promise.resolve();

      const finishReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/login/finish`);
      expect(finishReq.request.method).toBe('POST');
      // userHandle present -> base64url-encoded (not null)
      expect(finishReq.request.body.assertion_response.response.userHandle).not.toBeNull();
      finishReq.flush({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-x',
      });

      const result = await promise;
      expect(result.access_token).toBe('at');

      const decoded = getSpy.mock.calls[0][0].publicKey;
      expect(decoded.challenge).toBeInstanceOf(ArrayBuffer);
      expect(decoded.allowCredentials[0].id).toBeInstanceOf(ArrayBuffer);
      expect(decoded.allowCredentials[1].id).toBe(42);
    });

    it('should set userHandle null when absent (ternary falsy) + non-string challenge + no allowCredentials', async () => {
      const assertion: PublicKeyCredential = {
        id: 'login-cred-2',
        rawId: new Uint8Array([2]).buffer,
        type: 'public-key',
        response: {
          authenticatorData: new Uint8Array([60]).buffer,
          clientDataJSON: new Uint8Array([61]).buffer,
          signature: new Uint8Array([62]).buffer,
          userHandle: null,
        } as unknown as AuthenticatorAssertionResponse,
      } as unknown as PublicKeyCredential;

      const getSpy = vi.fn().mockResolvedValue(assertion);
      Object.defineProperty(navigator, 'credentials', {
        value: { get: getSpy },
        writable: true,
        configurable: true,
      });

      const promise = firstValueFrom(service.login('u2@chora.app'));

      const beginReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/login/begin`);
      // challenge NOT a string (decode if-false) + allowCredentials absent (Array.isArray false)
      beginReq.flush({ options: { challenge: 777 } });

      await Promise.resolve();
      await Promise.resolve();

      const finishReq = httpMock.expectOne(`${BASE}/api/v1/auth/webauthn/login/finish`);
      // userHandle absent -> ternary false branch -> null
      expect(finishReq.request.body.assertion_response.response.userHandle).toBeNull();
      finishReq.flush({
        access_token: 'at2',
        token_type: 'Bearer',
        expires_in: 7200,
        gcid: 'gcid-y',
      });

      const result = await promise;
      expect(result.access_token).toBe('at2');

      const decoded = getSpy.mock.calls[0][0].publicKey;
      expect(decoded.challenge).toBe(777);
      expect(decoded.allowCredentials).toBeUndefined();
    });
  });
});
