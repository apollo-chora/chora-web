import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { CertificateVerificationComponent } from './certificate-verification.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('CertificateVerificationComponent', () => {
  let fixture: ComponentFixture<CertificateVerificationComponent>;
  let component: CertificateVerificationComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const validCert = {
    certificate_id: 'cert-abc-123',
    holder_name: 'Jane Doe',
    program_name: 'Advanced Go',
    issued_at: '2026-01-15T00:00:00Z',
    expires_at: null,
    verification_status: 'valid' as const,
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(validCert)) };

    await TestBed.configureTestingModule({
      imports: [CertificateVerificationComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'cert-abc-123' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CertificateVerificationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display certificate details on success', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="cert-holder"]')?.textContent?.trim()).toBe('Jane Doe');
    expect(element.querySelector('[data-testid="cert-program"]')?.textContent?.trim()).toBe('Advanced Go');
    expect(element.querySelector('[data-testid="cert-id"]')?.textContent?.trim()).toBe('cert-abc-123');
  });

  it('does NOT render a fake QR placeholder on the public verification page', () => {
    fixture.detectChanges();
    // The dashed box literally containing the text "QR" was trust-eroding fakery
    // on a public verification surface — it must be gone (no QR lib is bundled).
    expect(element.querySelector('[data-testid="cert-qr-badge"]')).toBeNull();
    expect(element.querySelector('.cert-verify__qr-placeholder')).toBeNull();
    // The real, server-derived verification content still renders.
    expect(element.querySelector('[data-testid="cert-status-badge"]')).toBeTruthy();
  });

  it('should show error when certificate not found', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Not found')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="cert-error"]')).toBeTruthy();
  });

  it('should call BFF with the URL-encoded certId path', () => {
    fixture.detectChanges();
    expect(bffMock.get).toHaveBeenCalledWith(
      '/api/v1/certificates/cert-abc-123/verify',
    );
  });

  describe('when no certId is present in the route', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      bffMock = { get: vi.fn().mockReturnValue(of(validCert)) };
      await TestBed.configureTestingModule({
        imports: [CertificateVerificationComponent],
        providers: [
          provideRouter([]),
          { provide: BffClientService, useValue: bffMock },
          {
            // paramMap.get returns null -> the `!certId` guard is TRUE
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => null } } },
          },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(CertificateVerificationComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement;
    });

    it('should set an error state and NOT call the BFF (guard true path)', () => {
      fixture.detectChanges();

      expect(bffMock.get).not.toHaveBeenCalled();
      expect(component.state().status).toBe('error');
      expect(component.errorMessage()).toBe('No certificate ID provided');
      expect(element.querySelector('[data-testid="cert-error"]')).toBeTruthy();
    });
  });

  describe('null-certificate computed branches (non-success states)', () => {
    it('certificate()/statusLabel()/statusClass() return null/empty defaults while loading', () => {
      // Keep the request pending (NEVER calls next/error) so state stays 'loading'.
      bffMock.get.mockReturnValue(NEVER);
      fixture.detectChanges();

      expect(component.state().status).toBe('loading');
      expect(component.certificate()).toBeNull();
      // statusLabel cert-null arm -> ''
      expect(component.statusLabel()).toBe('');
      // statusClass cert-null arm -> base class only
      expect(component.statusClass()).toBe('cert-verify__badge');
      // errorMessage non-error arm -> ''
      expect(component.errorMessage()).toBe('');
      expect(element.querySelector('[data-testid="cert-loading"]')).toBeTruthy();
    });
  });

  describe('verification_status template + label branches', () => {
    function renderWithStatus(status: 'valid' | 'invalid' | 'expired'): void {
      bffMock.get.mockReturnValue(of({ ...validCert, verification_status: status }));
      fixture.detectChanges();
    }

    it('renders the expired badge label + class (expired arm)', () => {
      renderWithStatus('expired');
      expect(component.statusLabel()).toBe('Expired');
      expect(component.statusClass()).toContain('cert-verify__badge--expired');
      const label = element.querySelector('.cert-verify__badge-label');
      expect(label?.textContent?.trim()).toBe('Expired');
    });

    it('renders the invalid badge label + class (else/invalid arm)', () => {
      renderWithStatus('invalid');
      expect(component.statusLabel()).toBe('Invalid');
      expect(component.statusClass()).toContain('cert-verify__badge--invalid');
      const label = element.querySelector('.cert-verify__badge-label');
      expect(label?.textContent?.trim()).toBe('Invalid');
    });
  });

  describe('formatDate', () => {
    it('formats a valid ISO date string (try branch)', () => {
      fixture.detectChanges();
      const out = component.formatDate('2026-01-15T00:00:00Z');
      // Locale-independent assertions: year + month name present.
      expect(out).toContain('2026');
      expect(out).toMatch(/January/i);
    });

    it('returns a string for an unparseable input without throwing (characterization)', () => {
      fixture.detectChanges();
      // toLocaleDateString does not throw on an invalid Date in jsdom; it yields
      // "Invalid Date", so the catch arm is a defensive guard. Characterize the
      // actual (non-throwing) output rather than the unreachable catch.
      const out = component.formatDate('not-a-real-date');
      expect(typeof out).toBe('string');
      expect(() => component.formatDate('not-a-real-date')).not.toThrow();
    });
  });

  it('unsubscribes on destroy without error', () => {
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
