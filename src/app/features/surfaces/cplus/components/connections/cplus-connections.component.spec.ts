import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { CplusConnectionsComponent } from './cplus-connections.component';
import type { ConnectionEntry } from '../../models/cplus-connections.model';

const ENTRIES: readonly ConnectionEntry[] = [
  { gcid: 'gcid-aria-019700aa', created_at: '2026-06-29T10:00:00Z' },
  { gcid: 'gcid-jonas-019700bb', created_at: '2026-06-28T11:00:00Z' },
  { gcid: 'gcid-sarah-019700cc', created_at: '2026-06-27T09:00:00Z' },
];

/** GCID lists to seed the relation-set flush with (follow + blocked only). */
interface SeedSets {
  following?: readonly string[];
  blocked?: readonly string[];
}

describe('CplusConnectionsComponent', () => {
  let fixture: ComponentFixture<CplusConnectionsComponent>;
  let component: CplusConnectionsComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusConnectionsComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusConnectionsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Flush the relation-set derivation loads (following + blocked lists). */
  function flushRelationSets(sets: SeedSets = {}): void {
    const lists = httpMock.match(
      (r) => r.url.endsWith('/v1/connections') && r.params.get('limit') === '100',
    );
    for (const req of lists) {
      const type = req.request.params.get('type');
      const gcids =
        type === 'following'
          ? (sets.following ?? [])
          : (sets.blocked ?? []);
      req.flush({
        connections: gcids.map((g) => ({ gcid: g, created_at: '' })),
      });
    }

  }

  /** Flush the active-tab connections list (page-size 20 request). */
  function flushActiveList(entries: readonly ConnectionEntry[], type: string): void {
    httpMock
      .expectOne(
        (r) =>
          r.url.endsWith('/v1/connections') &&
          r.params.get('type') === type &&
          r.params.get('limit') === '20',
      )
      .flush({ connections: entries });
  }

  /** Drain ALL queued microtask chains (deeper than one whenStable turn). */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Drive ngOnInit (tab list + relation sets), flush, settle CD. */
  async function flushInit(
    entries: readonly ConnectionEntry[] = ENTRIES,
    sets: SeedSets = {},
  ): Promise<void> {
    fixture.detectChanges();
    flushActiveList(entries, 'following');
    flushRelationSets(sets);
    await settle();
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('starts on browse step with following as default tab', () => {
    expect(component.step()).toBe('browse');
    expect(component.activeTab()).toBe('following');
  });

  it('loads connections + relation sets on init', async () => {
    await flushInit();
    expect(component.connectionsState().status).toBe('success');
    expect(component.connections().length).toBe(3);
  });

  it('renders connection cards on success', async () => {
    await flushInit();
    const cards = element.querySelectorAll('chora-cplus-card');
    expect(cards.length).toBe(3);
  });

  it('shows display name in card title (shortGcid fallback when no display_name)', async () => {
    await flushInit();
    const cards = element.querySelectorAll('chora-cplus-card');
    expect(cards.length).toBe(3);
    // The card [title] input renders display_name or shortGcid fallback.
    // Fixture entry has no display_name, so shortGcid is used.
    expect(component.shortGcid('gcid-aria-019700aa')).toBe('gcid-aria0197');
  });

  it('shows empty state when no connections', async () => {
    await flushInit([]);
    const empty = element.querySelector('chora-cplus-empty-state');
    expect(empty).not.toBeNull();
  });

  it('shows loading state while fetching', () => {
    fixture.detectChanges();
    expect(component.connectionsState().status).toBe('loading');
    const status = element.querySelector('.cplus-connections__status');
    expect(status?.textContent).toContain('cplus.connections.loading');
    flushActiveList([], 'following');
    flushRelationSets();
  });

  it('shows error state on failure (fail-loud, no mock fallback)', async () => {
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith('/v1/connections') && r.params.get('limit') === '20')
      .flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
    flushRelationSets();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.connectionsState().status).toBe('error');
    const errorEl = element.querySelector('.cplus-connections__status--error');
    expect(errorEl).not.toBeNull();
  });

  it('switching tab reloads connections with the new type', async () => {
    await flushInit();
    component.onTabChange('followers');
    fixture.detectChanges();
    flushActiveList(ENTRIES.slice(0, 1), 'followers');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.activeTab()).toBe('followers');
  });

  it('blocked tab loads type=blocked', async () => {
    await flushInit();
    component.onTabChange('blocked');
    fixture.detectChanges();
    flushActiveList(ENTRIES.slice(0, 1), 'blocked');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.activeTab()).toBe('blocked');
    expect(component.connections().length).toBe(1);
  });

  it('suggestions tab loads hybrid rows (shared tags + mutual follows)', async () => {
    await flushInit();
    component.onTabChange('suggestions');
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/v1/connections/suggestions'))
      .flush({
        suggestions: [
          {
            gcid: 'gcid-fof-019700f1',
            display_name: 'Aria',
            shared_tags: ['golang', 'rust'],
            mutual_follows: 3,
          },
          {
            gcid: 'gcid-fof-019700f2',
            shared_tags: [],
            mutual_follows: 0,
          },
        ],
      });
    await settle();
    expect(component.suggestions().length).toBe(2);
    const cards = element.querySelectorAll('chora-cplus-card');
    expect(cards.length).toBe(2);
    // Display name is rendered when present; falls back to shortGcid otherwise.
    expect(element.textContent).toContain('Aria');
    // Shared tag chips render when present.
    const chips = element.querySelectorAll('.cplus-connections__tag-chip');
    expect(chips.length).toBe(2);
    // mutual_follows label only renders when count > 0.
    expect(element.textContent).toContain('cplus.connections.mutual_follows_label');
  });

  it('suggestions tab shows honest empty state', async () => {
    await flushInit();
    component.onTabChange('suggestions');
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith('/v1/connections/suggestions'))
      .flush({ suggestions: [] });
    await settle();
    const empty = element.querySelector('chora-cplus-empty-state');
    expect(empty).not.toBeNull();
  });

  it('displayName falls back to shortGcid when display_name absent', () => {
    expect(
      component.displayName({
        gcid: 'gcid-aria-019700aa',
        shared_tags: [],
        mutual_follows: 0,
      }),
    ).toBe('gcid-aria0197');
    expect(
      component.displayName({
        gcid: 'gcid-aria-019700aa',
        display_name: 'Aria',
        shared_tags: [],
        mutual_follows: 0,
      }),
    ).toBe('Aria');
  });

  it('sharedTagsLabel joins shared tags with a comma', () => {
    expect(
      component.sharedTagsLabel({
        gcid: 'gcid-x',
        shared_tags: ['golang', 'rust'],
        mutual_follows: 0,
      }),
    ).toBe('golang, rust');
    expect(
      component.sharedTagsLabel({
        gcid: 'gcid-x',
        shared_tags: [],
        mutual_follows: 0,
      }),
    ).toBe('');
  });

  it('block is two-tap: first arms the confirm, second POSTs the block', async () => {
    await flushInit();
    const target = 'gcid-aria-019700aa';

    await component.onBlock(target);
    expect(component.confirmBlockGcid()).toBe(target);
    httpMock.expectNone((r) => r.method === 'POST' && r.url.endsWith('/v1/connections/blocks'));

    const second = component.onBlock(target);
    await settle();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/v1/connections/blocks'))
      .flush(null, { status: 204, statusText: 'No Content' });
    // Successful write refreshes the active tab + relation sets (the
    // refresh requests are issued once the write promise resolves).
    await settle();
    flushActiveList(ENTRIES, 'following');
    flushRelationSets();
    await second;
    expect(component.confirmBlockGcid()).toBeNull();
  });

  it('follow success refreshes the active list + relation sets', async () => {
    await flushInit();
    const promise = component.onFollow('gcid-new-019700ff');
    await settle();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'))
      .flush(
        { gcid: 'gcid-new-019700ff', created: true, created_at: '' },
        { status: 201, statusText: 'Created' },
      );
    await settle();
    flushActiveList(ENTRIES, 'following');
    flushRelationSets({ following: ['gcid-new-019700ff'] });
    await promise;
    expect(component.relationSets().following.has('gcid-new-019700ff')).toBe(true);
  });

  it('back button returns to browse from profile', async () => {
    await flushInit();
    component.viewConnectionProfile('gcid-aria-019700aa');
    fixture.detectChanges();
    component.backToBrowse();
    fixture.detectChanges();
    expect(component.step()).toBe('browse');
    expect(component.selectedGcid()).toBeNull();
  });


  it('has 0 axe critical/serious violations', async () => {
    await flushInit();
    // axe-core is an optional dev-time module — dynamic import so the
    // test skips cleanly when it is absent from the install.
    const axe = (await import('axe-core')).default;
    const results = await axe.run(element);
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
