import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { CplusLeaderboardsComponent } from './cplus-leaderboards.component';
import type { LeaderboardEntry } from '../../models/cplus-leaderboards.model';

const ENTRIES: readonly LeaderboardEntry[] = [
  { gcid: 'gcid-aria', score: 247, rank: 1 },
  { gcid: 'gcid-jonas', score: 231, rank: 2 },
  { gcid: 'gcid-priya', score: 218, rank: 3 },
  { gcid: 'gcid-liam', score: 198, rank: 4 },
  { gcid: 'gcid-sarah', score: 185, rank: 5 },
];

describe('CplusLeaderboardsComponent', () => {
  let fixture: ComponentFixture<CplusLeaderboardsComponent>;
  let component: CplusLeaderboardsComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusLeaderboardsComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusLeaderboardsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Flush the auto-triggered ngOnInit request (drains without data). */
  function drainInitRequest(): void {
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/leaderboard'));
    req.flush({ entries: [], computed_at: '' });
  }

  /** Drive detectChanges (triggers ngOnInit), flush a board, return entries. */
  async function flushBoard(entries: readonly LeaderboardEntry[]): Promise<void> {
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/leaderboard'));
    req.flush({ entries, computed_at: '2026-06-19T10:00:00Z' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders scope/metric/period filter tabs', async () => {
    fixture.detectChanges();
    drainInitRequest();
    await fixture.whenStable();
    fixture.detectChanges();
    const tablists = element.querySelectorAll('chora-cplus-tabs');
    expect(tablists.length).toBe(3);
  });

  it('shows loading state on init', () => {
    fixture.detectChanges();
    expect(component.state().status).toBe('loading');
    drainInitRequest();
  });

  it('renders podium stat cards for top 3', async () => {
    await flushBoard(ENTRIES);
    const podium = element.querySelector('.cplus-leaderboards__podium');
    expect(podium).not.toBeNull();
    const statCards = podium?.querySelectorAll('chora-cplus-stat-card');
    expect(statCards?.length).toBe(3);
  });

  it('renders ranked rows for entries 4+', async () => {
    await flushBoard(ENTRIES);
    const rows = element.querySelectorAll('.cplus-leaderboards-row');
    expect(rows.length).toBe(2);
  });

  it('shows empty state when no entries', async () => {
    await flushBoard([]);
    const empty = element.querySelector('chora-cplus-empty-state');
    expect(empty).not.toBeNull();
  });

  it('shows error message on failure', async () => {
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/leaderboard'));
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const err = element.querySelector('.cplus-leaderboards__status--error');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('cplus.leaderboards.');
  });

  it('reloads when scope changes', async () => {
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith('/v1/leaderboard'))
      .flush({ entries: [], computed_at: '' });
    await fixture.whenStable();

    component.onScopeChange('tenant');
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/leaderboard'));
    expect(req.request.params.get('scope')).toBe('tenant');
    req.flush({ entries: [], computed_at: '' });
  });

  it('has 0 axe critical/serious violations', async () => {
    await flushBoard(ENTRIES);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(element);
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
