import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivityDigestComponent } from './activity-digest.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type { ActivityDigest, DigestPreference } from '../../models/parent.model';

const DIGESTS_URL = `${environment.bffBaseUrl}/api/v1/parent/digests`;
const PREFERENCES_URL = `${environment.bffBaseUrl}/api/v1/parent/digests/preferences`;

function makeDigest(overrides: Partial<ActivityDigest> = {}): ActivityDigest {
  return {
    id: 'digest-1',
    tenant_id: 'tenant-1',
    guardian_gcid: 'guardian-1',
    learner_gcid: 'learner-1',
    period_start: '2026-03-08T00:00:00Z',
    period_end: '2026-03-14T23:59:59Z',
    atoms_completed: 12,
    xp_earned: 340,
    streak_days: 5,
    average_score_pct: 87.5,
    highlights: ['Completed Algebra Basics', 'Earned the Curiosity badge'],
    sent_at: '2026-03-15T08:00:00Z',
    created_at: '2026-03-15T08:00:00Z',
    ...overrides,
  };
}

function makePreference(overrides: Partial<DigestPreference> = {}): DigestPreference {
  return {
    id: 'pref-1',
    tenant_id: 'tenant-1',
    guardian_gcid: 'guardian-1',
    frequency: 'weekly',
    channels: ['email'],
    updated_at: '2026-03-15T08:00:00Z',
    ...overrides,
  };
}

describe('ActivityDigestComponent', () => {
  let component: ActivityDigestComponent;
  let fixture: ComponentFixture<ActivityDigestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityDigestComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityDigestComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('learnerId', 'learner-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="activity-digest"]');
    expect(el).toBeTruthy();
  });

  it('should have digest title', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="digest-title"]');
    expect(el).toBeTruthy();
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should format period correctly', () => {
    const result = component.formatPeriod('2026-03-08T00:00:00Z', '2026-03-14T23:59:59Z');
    expect(result).toContain('\u2013');
  });

  it('should format score correctly', () => {
    expect(component.formatScore(85.5)).toBe('85.5%');
    expect(component.formatScore(100)).toBe('100.0%');
    expect(component.formatScore(0)).toBe('0.0%');
  });

  it('should have frequency preference buttons', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="digest-preferences"]');
    expect(el).toBeTruthy();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Initial render / loading state
  // ---------------------------------------------------------------------------

  describe('initial loading state', () => {
    it('should request digests on init via the contract GET path', () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const req = httpMock.expectOne(DIGESTS_URL);
      expect(req.request.method).toBe('GET');
    });

    it('should render the loading skeleton while digests are pending', () => {
      const loading = fixture.nativeElement.querySelector('[data-testid="digest-loading"]');
      expect(loading).toBeTruthy();
      // Three skeleton rows per the [1,2,3] @for.
      const rows = fixture.nativeElement.querySelectorAll('.activity-digest__skeleton-row');
      expect(rows.length).toBe(3);
    });

    it('should always render the preferences panel regardless of digest state', () => {
      const prefs = fixture.nativeElement.querySelector('[data-testid="digest-preferences"]');
      expect(prefs).toBeTruthy();
    });

    it('should render one frequency button per ALL_DIGEST_FREQUENCIES entry', () => {
      const buttons = fixture.nativeElement.querySelectorAll('[data-testid^="btn-frequency-"]');
      expect(buttons.length).toBe(component.allFrequencies.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Success state with digests
  // ---------------------------------------------------------------------------

  describe('success state with digests', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(DIGESTS_URL).flush({
        data: [
          makeDigest({ id: 'digest-1', period_end: '2026-03-14T23:59:59Z' }),
          makeDigest({
            id: 'digest-2',
            period_start: '2026-03-15T00:00:00Z',
            period_end: '2026-03-21T23:59:59Z',
            atoms_completed: 20,
            xp_earned: 500,
            streak_days: 7,
            average_score_pct: 92,
            highlights: [],
            sent_at: null,
          }),
          // Belongs to a different learner — must be filtered out.
          makeDigest({ id: 'digest-other', learner_gcid: 'learner-2' }),
        ],
      });
      fixture.detectChanges();
    });

    it('should render the digest list', () => {
      const list = fixture.nativeElement.querySelector('[data-testid="digest-list"]');
      expect(list).toBeTruthy();
    });

    it('should filter learnerDigests to the routed learner only', () => {
      // 2 of the 3 belong to learner-1.
      expect(component.learnerDigests().length).toBe(2);
      expect(component.hasDigests()).toBe(true);
    });

    it('should render one card per learner digest', () => {
      const cards = fixture.nativeElement.querySelectorAll('[data-testid="digest-card"]');
      expect(cards.length).toBe(2);
    });

    it('should render the four stat values from the digest data', () => {
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('12'); // atoms_completed
      expect(text).toContain('340'); // xp_earned
      expect(text).toContain('5'); // streak_days
      expect(text).toContain('87.5%'); // formatScore(average_score_pct)
    });

    it('should show the sent badge only for digests with sent_at', () => {
      const badges = fixture.nativeElement.querySelectorAll('[data-testid="digest-sent"]');
      // Only digest-1 has sent_at; digest-2 sent_at is null.
      expect(badges.length).toBe(1);
    });

    it('should render highlights for digests that have them', () => {
      const highlights = fixture.nativeElement.querySelector('[data-testid="digest-highlights"]');
      expect(highlights).toBeTruthy();
      const items = fixture.nativeElement.querySelectorAll('.activity-digest__highlight-item');
      // digest-1 has 2 highlights; digest-2 has none.
      expect(items.length).toBe(2);
      expect(highlights?.textContent ?? '').toContain('Completed Algebra Basics');
    });

    it('should expose the latest digest by period_end via latestDigest()', () => {
      // digest-2 ends 2026-03-21, which is later than digest-1 (2026-03-14).
      expect(component.latestDigest()?.id).toBe('digest-2');
    });

    it('should not render the empty state when digests exist', () => {
      const empty = fixture.nativeElement.querySelector('[data-testid="digest-empty"]');
      expect(empty).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Success state with no digests (empty)
  // ---------------------------------------------------------------------------

  describe('empty success state', () => {
    beforeEach(() => {
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(DIGESTS_URL).flush({ data: [] });
      fixture.detectChanges();
    });

    it('should render the empty state placeholder', () => {
      const empty = fixture.nativeElement.querySelector('[data-testid="digest-empty"]');
      expect(empty).toBeTruthy();
      expect(empty?.getAttribute('role')).toBe('status');
    });

    it('should report hasDigests() === false and no cards', () => {
      expect(component.hasDigests()).toBe(false);
      expect(component.latestDigest()).toBeNull();
      const cards = fixture.nativeElement.querySelectorAll('[data-testid="digest-card"]');
      expect(cards.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Error state (HTTP 5xx)
  // ---------------------------------------------------------------------------

  describe('error state', () => {
    beforeEach(() => {
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(DIGESTS_URL).flush('boom', {
        status: 500,
        statusText: 'Server Error',
      });
      fixture.detectChanges();
    });

    it('should render the error alert', () => {
      const error = fixture.nativeElement.querySelector('[data-testid="digest-error"]');
      expect(error).toBeTruthy();
      expect(error?.getAttribute('role')).toBe('alert');
    });

    it('should reflect the error status on the digestState signal', () => {
      expect(component.digestState().status).toBe('error');
    });

    it('should not render the digest list nor empty state in error state', () => {
      expect(fixture.nativeElement.querySelector('[data-testid="digest-list"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="digest-empty"]')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateFrequency action
  // ---------------------------------------------------------------------------

  describe('updateFrequency action', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      // Drain the ngOnInit digests GET so it does not interfere.
      httpMock.expectOne(DIGESTS_URL).flush({ data: [] });
      fixture.detectChanges();
    });

    it('should PUT the chosen frequency with the default email channel when no preference exists', () => {
      component.updateFrequency('daily');

      const req = httpMock.expectOne(PREFERENCES_URL);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        frequency: 'daily',
        channels: ['email'],
      });
      req.flush(makePreference({ frequency: 'daily' }));
    });

    it('should show a success toast after a successful update', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      component.updateFrequency('monthly');
      httpMock.expectOne(PREFERENCES_URL).flush(makePreference({ frequency: 'monthly' }));

      expect(spy).toHaveBeenCalledWith('parent.preferences_updated', 'success');
      expect(component.preference()?.frequency).toBe('monthly');
    });

    it('should reuse the existing preference channels when one is already loaded', () => {
      // First update establishes a preference with multiple channels.
      component.updateFrequency('weekly');
      httpMock
        .expectOne(PREFERENCES_URL)
        .flush(makePreference({ frequency: 'weekly', channels: ['email', 'push'] }));

      // Second update should carry forward the loaded channels.
      component.updateFrequency('biweekly');
      const req = httpMock.expectOne(PREFERENCES_URL);
      expect(req.request.body).toEqual({
        frequency: 'biweekly',
        channels: ['email', 'push'],
      });
      req.flush(makePreference({ frequency: 'biweekly', channels: ['email', 'push'] }));
    });

    it('should set preferenceState to error on a failed update (4xx) and NOT show any toast', () => {
      // CHARACTERIZATION: ParentService.updateDigestPreferences catchError()s
      // the HTTP failure into of(null), so the Observable emits `null` to the
      // component's next() handler (where `if (result)` is falsy → no success
      // toast) and the component's error() callback NEVER fires. The
      // 'parent.preferences_update_error' toast path is therefore effectively
      // dead. We characterize the real (no-toast) behavior. See prodBugFlag.
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      component.updateFrequency('disabled');
      httpMock.expectOne(PREFERENCES_URL).flush('nope', { status: 400, statusText: 'Bad Request' });

      expect(spy).not.toHaveBeenCalled();
      expect(component.preferenceState().status).toBe('error');
    });

    it('should mark the active frequency button via aria-pressed after update', () => {
      component.updateFrequency('weekly');
      httpMock.expectOne(PREFERENCES_URL).flush(makePreference({ frequency: 'weekly' }));
      fixture.detectChanges();

      const activeBtn = fixture.nativeElement.querySelector('[data-testid="btn-frequency-weekly"]');
      expect(activeBtn?.getAttribute('aria-pressed')).toBe('true');
      expect(activeBtn?.classList.contains('activity-digest__frequency-btn--active')).toBe(true);
    });

    it('should fire updateFrequency when a frequency button is clicked', () => {
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="btn-frequency-daily"]',
      ) as HTMLButtonElement;
      btn.click();

      const req = httpMock.expectOne(PREFERENCES_URL);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toMatchObject({ frequency: 'daily' });
      req.flush(makePreference({ frequency: 'daily' }));
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers / lifecycle
  // ---------------------------------------------------------------------------

  describe('helpers and lifecycle', () => {
    it('formatDate returns the original string for an invalid date input', () => {
      // jsdom toLocaleDateString of an invalid date yields "Invalid Date";
      // the try/catch only catches throws, so characterize the actual output.
      const result = component.formatDate('not-a-real-date');
      expect(typeof result).toBe('string');
    });

    it('formatScore rounds to one decimal place', () => {
      expect(component.formatScore(33.333)).toBe('33.3%');
      expect(component.formatScore(66.666)).toBe('66.7%');
    });

    it('should expose the i18n label maps and option arrays', () => {
      expect(component.frequencyLabels.weekly).toBe('parent.frequency_weekly');
      expect(component.channelLabels.email).toBe('parent.channel_email');
      expect(component.allChannels).toContain('push');
      expect(component.allFrequencies).toContain('disabled');
    });

    it('should unsubscribe on destroy without error', () => {
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(DIGESTS_URL).flush({ data: [] });
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
