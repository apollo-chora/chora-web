import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { SuspensionPageComponent } from './suspension-page.component';
import { AuthService } from '../../../core/auth/auth.service';

describe('SuspensionPageComponent', () => {
  let fixture: ComponentFixture<SuspensionPageComponent>;
  let component: SuspensionPageComponent;

  const mockUser = signal({
    displayName: 'Alice Smith',
    email: 'alice@example.com',
    roles: ['learner'],
  });

  const mockAuthService = {
    user: mockUser.asReadonly(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuspensionPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuspensionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute user display name', () => {
    expect(component.userDisplayName()).toBe('Alice Smith');
  });

  it('should compute reason label from suspension info', () => {
    expect(component.reasonLabel()).toBe('identity.suspension.reason_policy_violation');
  });

  it('should detect permanent suspension', () => {
    component.suspensionInfo.set({
      reason: 'policy_violation',
      suspended_at: new Date().toISOString(),
      duration: 'permanent',
      expires_at: null,
    });
    expect(component.isPermanent()).toBe(true);
  });

  it('should compute countdown for timed suspension', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    component.suspensionInfo.set({
      reason: 'suspicious_activity',
      suspended_at: new Date().toISOString(),
      duration: '30_days',
      expires_at: futureDate,
    });
    component.now.set(Date.now());

    const countdown = component.countdown();
    expect(countdown.days).toBeGreaterThanOrEqual(0);
    expect(component.isExpired()).toBe(false);
  });

  it('should pad numbers to 2 digits', () => {
    expect(component.padNumber(5)).toBe('05');
    expect(component.padNumber(12)).toBe('12');
  });

  // -------------------------------------------------------------------------
  // Shell render
  // -------------------------------------------------------------------------

  describe('shell render', () => {
    let element: HTMLElement;

    beforeEach(() => {
      element = fixture.nativeElement as HTMLElement;
    });

    it('should render the suspension page container', () => {
      expect(element.querySelector('[data-testid="suspension-page"]')).toBeTruthy();
    });

    it('should render the Chora brand name', () => {
      const brand = element.querySelector('.suspension-page__brand-name');
      expect(brand?.textContent?.trim()).toBe('Chora');
    });

    it('should render the heading', () => {
      // en.json isn't loaded in tests, so | translate emits the raw key (prod humanizes).
      const heading = element.querySelector('#suspension-heading');
      expect(heading?.textContent?.trim()).toBe('identity.suspension.heading');
    });

    it('should render the details list', () => {
      expect(element.querySelector('[data-testid="suspension-details"]')).toBeTruthy();
    });

    it('should render the appeal button routed to the appeal page', () => {
      const appeal = element.querySelector('[data-testid="suspension-appeal-btn"]');
      expect(appeal).toBeTruthy();
      expect(appeal?.getAttribute('href')).toContain('/settings/account/appeal');
    });

    it('should render the support mailto link', () => {
      const support = element.querySelector('[data-testid="suspension-support-link"]');
      expect(support?.getAttribute('href')).toBe('mailto:support@chora.site');
    });

    it('should render the footer', () => {
      const footer = element.querySelector('.suspension-page__footer-text');
      expect(footer?.textContent?.trim()).toBe('identity.suspension.footer');
    });

    it('should render the reason value translated in the DOM', () => {
      const reason = element.querySelector('[data-testid="suspension-reason"]');
      expect(reason?.textContent?.trim()).toBe('identity.suspension.reason_policy_violation');
    });
  });

  // -------------------------------------------------------------------------
  // userDisplayName
  // -------------------------------------------------------------------------

  describe('userDisplayName', () => {
    it('should return empty string when no user present', async () => {
      const noUser = signal<{ displayName: string } | null>(null);
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [SuspensionPageComponent],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: { user: noUser.asReadonly() } },
        ],
      }).compileComponents();
      const f = TestBed.createComponent(SuspensionPageComponent);
      f.detectChanges();
      expect(f.componentInstance.userDisplayName()).toBe('');
      f.componentInstance.ngOnDestroy();
    });
  });

  // -------------------------------------------------------------------------
  // reasonLabel — all mapped reasons + fallback
  // -------------------------------------------------------------------------

  describe('reasonLabel', () => {
    const cases: [string, string][] = [
      ['policy_violation', 'identity.suspension.reason_policy_violation'],
      ['suspicious_activity', 'identity.suspension.reason_suspicious_activity'],
      ['payment_fraud', 'identity.suspension.reason_payment_fraud'],
      ['harassment', 'identity.suspension.reason_harassment'],
      ['content_abuse', 'identity.suspension.reason_content_abuse'],
      ['other', 'identity.suspension.reason_other'],
    ];

    for (const [reason, key] of cases) {
      it(`should map reason "${reason}" to "${key}"`, () => {
        component.suspensionInfo.set({
          reason,
          suspended_at: new Date().toISOString(),
          duration: '30_days',
          expires_at: null,
        });
        expect(component.reasonLabel()).toBe(key);
      });
    }

    it('should fall back to reason_other for an unknown reason', () => {
      component.suspensionInfo.set({
        reason: 'totally_unknown_reason',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: null,
      });
      expect(component.reasonLabel()).toBe('identity.suspension.reason_other');
    });
  });

  // -------------------------------------------------------------------------
  // durationLabel — all mapped durations + fallback
  // -------------------------------------------------------------------------

  describe('durationLabel', () => {
    const cases: [string, string][] = [
      ['7_days', 'identity.suspension.duration_7_days'],
      ['30_days', 'identity.suspension.duration_30_days'],
      ['90_days', 'identity.suspension.duration_90_days'],
      ['permanent', 'identity.suspension.duration_permanent'],
    ];

    for (const [duration, key] of cases) {
      it(`should map duration "${duration}" to "${key}"`, () => {
        component.suspensionInfo.set({
          reason: 'policy_violation',
          suspended_at: new Date().toISOString(),
          duration,
          expires_at: null,
        });
        expect(component.durationLabel()).toBe(key);
      });
    }

    it('should fall back to duration_unknown for an unknown duration', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'fortnight',
        expires_at: null,
      });
      expect(component.durationLabel()).toBe('identity.suspension.duration_unknown');
    });
  });

  // -------------------------------------------------------------------------
  // suspendedDate / expiryDate formatting
  // -------------------------------------------------------------------------

  describe('date formatting', () => {
    it('should format a valid suspended_at into a localized date string', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: '2026-01-15T10:00:00.000Z',
        duration: '30_days',
        expires_at: null,
      });
      const formatted = component.suspendedDate();
      expect(formatted).toContain('2026');
      expect(formatted).not.toBe('2026-01-15T10:00:00.000Z');
    });

    it('should return null expiryDate when no expiry set', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'permanent',
        expires_at: null,
      });
      expect(component.expiryDate()).toBeNull();
    });

    it('should format a valid expires_at into a localized date-time string', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: '2026-02-20T14:30:00.000Z',
      });
      const formatted = component.expiryDate();
      expect(formatted).toContain('2026');
    });
  });

  // -------------------------------------------------------------------------
  // isPermanent / expiresAt
  // -------------------------------------------------------------------------

  describe('isPermanent', () => {
    it('should be permanent when duration is permanent even with an expiry', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'permanent',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(component.isPermanent()).toBe(true);
    });

    it('should be permanent when no expiry is provided', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: null,
      });
      expect(component.isPermanent()).toBe(true);
    });

    it('should NOT be permanent when timed with a future expiry', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(component.isPermanent()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // remainingMs / countdown / isExpired
  // -------------------------------------------------------------------------

  describe('countdown math', () => {
    it('should compute remainingMs as 0 when no expiry', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'permanent',
        expires_at: null,
      });
      expect(component.remainingMs()).toBe(0);
    });

    it('should clamp remainingMs to 0 once expiry is in the past', () => {
      const past = new Date(Date.now() - 10000).toISOString();
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: past,
      });
      component.now.set(Date.now());
      expect(component.remainingMs()).toBe(0);
    });

    it('should break down remaining time into days/hours/minutes/seconds', () => {
      const base = 1_700_000_000_000;
      // 1 day, 2 hours, 3 minutes, 4 seconds ahead
      const deltaMs =
        1 * 86400000 + 2 * 3600000 + 3 * 60000 + 4 * 1000;
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: new Date(base + deltaMs).toISOString(),
      });
      component.now.set(base);

      const cd = component.countdown();
      expect(cd.days).toBe(1);
      expect(cd.hours).toBe(2);
      expect(cd.minutes).toBe(3);
      expect(cd.seconds).toBe(4);
    });

    it('should return all-zero countdown when expired', () => {
      const past = new Date(Date.now() - 60000).toISOString();
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: past,
      });
      component.now.set(Date.now());

      const cd = component.countdown();
      expect(cd).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    });

    it('should report isExpired true for a past timed expiry', () => {
      const past = new Date(Date.now() - 60000).toISOString();
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '30_days',
        expires_at: past,
      });
      component.now.set(Date.now());
      expect(component.isExpired()).toBe(true);
    });

    it('should report isExpired false for a permanent suspension', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'permanent',
        expires_at: null,
      });
      expect(component.isExpired()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Conditional DOM blocks driven by state
  // -------------------------------------------------------------------------

  describe('conditional banners', () => {
    let element: HTMLElement;

    beforeEach(() => {
      element = fixture.nativeElement as HTMLElement;
    });

    it('should render the permanent banner for a permanent suspension', () => {
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: 'permanent',
        expires_at: null,
      });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="suspension-permanent"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="suspension-countdown"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="suspension-expired"]'),
      ).toBeNull();
    });

    it('should render the countdown timer for an active timed suspension', () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString();
      component.suspensionInfo.set({
        reason: 'suspicious_activity',
        suspended_at: new Date().toISOString(),
        duration: '7_days',
        expires_at: future,
      });
      component.now.set(Date.now());
      fixture.detectChanges();

      const countdown = element.querySelector(
        '[data-testid="suspension-countdown"]',
      );
      expect(countdown).toBeTruthy();
      expect(countdown?.getAttribute('role')).toBe('timer');
      expect(
        element.querySelector('[data-testid="countdown-days"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="suspension-permanent"]'),
      ).toBeNull();
    });

    it('should render the expiry detail row for an active timed suspension', () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString();
      component.suspensionInfo.set({
        reason: 'harassment',
        suspended_at: new Date().toISOString(),
        duration: '7_days',
        expires_at: future,
      });
      component.now.set(Date.now());
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="suspension-expiry"]'),
      ).toBeTruthy();
    });

    it('should render the expired banner for a past timed suspension', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      component.suspensionInfo.set({
        reason: 'content_abuse',
        suspended_at: new Date().toISOString(),
        duration: '7_days',
        expires_at: past,
      });
      component.now.set(Date.now());
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="suspension-expired"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="suspension-countdown"]'),
      ).toBeNull();
    });

    it('should render padded countdown values via padNumber in the DOM', () => {
      // NOTE: the constructor effect calls startCountdown() on detectChanges,
      // which resets `now` to Date.now(). So we must use a real future expiry
      // and assert the rendered values are 2-digit padded (padNumber output).
      const future = new Date(Date.now() + 2 * 86400000 + 7 * 3600000).toISOString();
      component.suspensionInfo.set({
        reason: 'policy_violation',
        suspended_at: new Date().toISOString(),
        duration: '7_days',
        expires_at: future,
      });
      fixture.detectChanges();

      const days = element.querySelector('[data-testid="countdown-days"]');
      const seconds = element.querySelector('[data-testid="countdown-seconds"]');
      // All countdown values rendered through padNumber -> always 2 chars.
      expect(days?.textContent?.trim()).toMatch(/^\d{2}$/);
      expect(seconds?.textContent?.trim()).toMatch(/^\d{2}$/);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should be safe to call ngOnDestroy multiple times', () => {
      expect(() => {
        component.ngOnDestroy();
        component.ngOnDestroy();
      }).not.toThrow();
    });
  });
});
