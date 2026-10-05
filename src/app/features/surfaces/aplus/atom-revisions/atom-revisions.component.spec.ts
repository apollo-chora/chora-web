/**
 * AtomRevisionsComponent spec — WS-7 revision timeline view.
 *
 * Tests cover:
 * - Timeline renders most-recent-first revision cards
 * - Empty state is rendered when revisions array is empty
 * - Loading state (aria-busy)
 * - Error state (role="alert") + retry CTA fires service.load()
 * - Contract-gap banner for not-found / generic error
 * - Diff toggle expand/collapse per revision
 * - Accessibility: h1 present, buttons have accessible names, role=alert on errors
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AtomRevisionsComponent } from './atom-revisions.component';
import { AtomRevisionsService } from './atom-revisions.service';
import { TranslateService } from '../../../../core/services/translate.service';

/** Proves real copy reached the DOM, not just that the key vanished. */
const TRANSLATED_MARKER = '«translated»';

/**
 * The real TranslateService echoes the raw KEY back when no translations are
 * loaded — the very defect under test — so a pass-through double would let the
 * bug pass. This returns a marker instead.
 */
class StubTranslateService {
  instant(_key: string, params?: Record<string, string | number>): string {
    const p = params ? ` ${Object.values(params).join(' ')}` : '';
    return `${TRANSLATED_MARKER}${p}`;
  }
}
import type { AtomRevision, AtomRevisionListState, AtomRevisionPage } from './models';

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';

function buildRevision(overrides: Partial<AtomRevision> = {}): AtomRevision {
  return {
    revision_id: '019e0001-0000-7000-8000-000000000001',
    atom_id: ATOM_ID,
    revision_number: 1,
    content: { title: 'A+ Atomic Learning Primitives', body: 'The smallest unit.' },
    content_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    validation_rule_type: 'STANDARD',
    published_by_gcid: '00000000-0000-7000-8000-000000001999',
    published_at: '2026-05-26T10:00:00.000Z',
    summary: 'Initial revision',
    ...overrides,
  };
}

function buildPage(revisions: AtomRevision[]): AtomRevisionPage {
  return { revisions };
}

class StubAtomRevisionsService {
  readonly _state: WritableSignal<AtomRevisionListState> = signal<AtomRevisionListState>({
    status: 'loading',
  });
  readonly state: Signal<AtomRevisionListState> = this._state.asReadonly();

  readonly page = computed<AtomRevisionPage | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.page : null;
  });
  readonly revisions = computed<readonly AtomRevision[]>(() => this.page()?.revisions ?? []);

  loadCalls: string[] = [];
  load(id: string): void {
    this.loadCalls.push(id);
  }
}

function setup(): {
  fixture: ComponentFixture<AtomRevisionsComponent>;
  component: AtomRevisionsComponent;
  element: HTMLElement;
  service: StubAtomRevisionsService;
} {
  const service = new StubAtomRevisionsService();
  TestBed.configureTestingModule({
    imports: [AtomRevisionsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AtomRevisionsService, useValue: service },
      { provide: TranslateService, useClass: StubTranslateService },
    ],
  });
  const fixture = TestBed.createComponent(AtomRevisionsComponent);
  // Set required signal input via componentRef
  fixture.componentRef.setInput('atomId', ATOM_ID);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

describe('AtomRevisionsComponent (WS-7 revision timeline)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init', () => {
    it('creates and renders the root section', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="atom-revisions"]')).toBeTruthy();
    });

    it('calls service.load() with atomId on init', () => {
      const { service } = setup();
      expect(service.loadCalls).toContain(ATOM_ID);
    });

    it('renders the atom id in the header subtitle', () => {
      const { element } = setup();
      const subtitle = element.querySelector('[data-testid="atom-revisions-atom-id"]');
      expect(subtitle?.textContent).toContain(ATOM_ID);
    });

    it('renders surface-aplus class on the root', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="atom-revisions"]')?.classList.contains('surface-aplus'),
      ).toBe(true);
    });
  });

  describe('loading branch', () => {
    it('renders loading panel with aria-busy while state is loading', () => {
      const { element } = setup();
      const panel = element.querySelector('[data-testid="atom-revisions-loading"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
      expect(panel?.getAttribute('role')).toBe('status');
    });

    it('does NOT render the timeline while loading', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="atom-revisions-timeline"]')).toBeNull();
    });
  });

  describe('error branch (fail-loud)', () => {
    it('renders role=alert error banner for upstream errors', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="atom-revisions-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    // 🔴 This test was named "shows the error key in the banner" and asserted
    // `toContain('aplus.atom_revisions.error_upstream')` — it certified the
    // DEFECT as the feature. The banner printed `{{ errorKey() }}` unpiped, so
    // an author whose revision history failed to load read the literal string
    // "aplus.atom_revisions.error_upstream". A green test can BE the bug.
    // Only these two reach the error banner: `error_generic` and
    // `error_not_found` are routed by `isContractGap()` to the separate
    // "not yet available" arm (WS-7-BE-A1), which renders hardcoded copy and
    // therefore leaks no key. Asserting all four here would fail on an EMPTY
    // node — and `not.toContain(key)` passes for free on empty, which is why
    // the paired `toContain(TRANSLATED_MARKER)` below is load-bearing.
    it.each([
      'aplus.atom_revisions.error_upstream',
      'aplus.atom_revisions.error_unauthorised',
    ])('TRANSLATES %s — the author never reads a raw i18n key', (key) => {
      const { service, fixture, element } = setup();
      service._state.set({ status: 'error', error: key });
      fixture.detectChanges();
      const msg =
        element.querySelector('[data-testid="atom-revisions-error-msg"]')?.textContent ?? '';
      expect(msg).not.toContain(key);
      expect(msg).not.toContain('aplus.atom_revisions.');
      // Paired positive: an empty node would satisfy the negative for free.
      expect(msg).toContain(TRANSLATED_MARKER);
    });

    it('retry CTA re-fires service.load()', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_upstream',
      });
      fixture.detectChanges();
      const before = service.loadCalls.length;
      (element.querySelector('[data-testid="atom-revisions-retry"]') as HTMLButtonElement).click();
      expect(service.loadCalls.length).toBe(before + 1);
      expect(service.loadCalls.at(-1)).toBe(ATOM_ID);
    });

    it('renders the contract-gap banner for error_generic (WS-7-BE-A1)', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_generic',
      });
      fixture.detectChanges();
      const gap = element.querySelector('[data-testid="atom-revisions-contract-gap"]');
      expect(gap).toBeTruthy();
      expect(gap?.getAttribute('role')).toBe('alert');
      // No retry CTA for contract-gap (it's a known BE gap, not a transient error)
      expect(element.querySelector('[data-testid="atom-revisions-retry"]')).toBeNull();
    });

    it('renders the contract-gap banner for error_not_found', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_not_found',
      });
      fixture.detectChanges();
      const gap = element.querySelector('[data-testid="atom-revisions-contract-gap"]');
      expect(gap).toBeTruthy();
    });

    it('does NOT render the error-error banner when contract-gap is shown', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_generic',
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atom-revisions-error"]')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders the empty state when success but revisions is empty', () => {
      const { service, fixture, element } = setup();
      service._state.set({ status: 'success', page: buildPage([]) });
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="atom-revisions-empty"]');
      expect(empty).toBeTruthy();
      expect(element.querySelector('[data-testid="atom-revisions-timeline"]')).toBeNull();
    });
  });

  describe('success branch: timeline', () => {
    function setupSuccess(revisions: AtomRevision[] = [buildRevision()]) {
      const ctx = setup();
      ctx.service._state.set({ status: 'success', page: buildPage(revisions) });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the timeline with one card for a single revision', () => {
      const { element } = setupSuccess([buildRevision({ revision_number: 1 })]);
      const timeline = element.querySelector('[data-testid="atom-revisions-timeline"]');
      expect(timeline).toBeTruthy();
      const cards = timeline?.querySelectorAll('li');
      expect(cards?.length).toBe(1);
    });

    it('renders multiple cards for multiple revisions (most-recent first)', () => {
      const { element } = setupSuccess([
        buildRevision({ revision_id: 'id-2', revision_number: 2 }),
        buildRevision({ revision_id: 'id-1', revision_number: 1 }),
      ]);
      const cards = element.querySelectorAll('[data-testid^="atom-revisions-card-"]');
      expect(cards.length).toBe(2);
      // First card = newest (rev 2)
      expect(cards[0].getAttribute('data-testid')).toBe('atom-revisions-card-2');
      // Second card = older (rev 1)
      expect(cards[1].getAttribute('data-testid')).toBe('atom-revisions-card-1');
    });

    it('renders the revision number badge', () => {
      const { element } = setupSuccess();
      const num = element.querySelector('[data-testid="atom-revisions-rev-number"]');
      expect(num?.textContent).toContain('#1');
    });

    it('renders the author GCID short form', () => {
      const { element } = setupSuccess([buildRevision({ published_by_gcid: 'abcdef01-0000-7000-8000-000000001999' })]);
      const author = element.querySelector('[data-testid="atom-revisions-author-1"]');
      expect(author?.textContent).toContain('abcdef01');
      expect(author?.textContent).toContain('…');
    });

    it('renders the content hash truncated', () => {
      const { element } = setupSuccess([buildRevision({ content_hash: 'deadbeef1234567890abcdef' })]);
      const hash = element.querySelector('[data-testid="atom-revisions-hash-1"]');
      expect(hash?.textContent).toContain('deadbeef1234');
    });

    it('renders the optional summary when present', () => {
      const { element } = setupSuccess([buildRevision({ summary: 'Added MCQ payload' })]);
      const summary = element.querySelector('[data-testid="atom-revisions-summary-1"]');
      expect(summary?.textContent).toContain('Added MCQ payload');
    });

    it('omits the summary when absent', () => {
      const { element } = setupSuccess([buildRevision({ summary: undefined })]);
      expect(element.querySelector('[data-testid="atom-revisions-summary-1"]')).toBeNull();
    });

    it('renders a "Current" badge on the first (most recent) revision card', () => {
      const { element } = setupSuccess([
        buildRevision({ revision_id: 'id-3', revision_number: 3 }),
        buildRevision({ revision_id: 'id-2', revision_number: 2 }),
      ]);
      // The badge-current element should exist only once and inside card-3
      const currentBadges = element.querySelectorAll('.atom-revisions__badge-current');
      expect(currentBadges.length).toBe(1);
      // It should be inside the first card (revision 3)
      const firstCard = element.querySelector('[data-testid="atom-revisions-card-3"]');
      expect(firstCard?.querySelector('.atom-revisions__badge-current')).toBeTruthy();
    });
  });

  describe('diff expand / collapse', () => {
    function setupWithRevisions() {
      const ctx = setup();
      ctx.service._state.set({
        status: 'success',
        page: buildPage([
          buildRevision({ revision_id: 'rev-2', revision_number: 2, content: { v: 2 } }),
          buildRevision({ revision_id: 'rev-1', revision_number: 1, content: { v: 1 } }),
        ]),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('diff panel is collapsed initially (no diff content visible)', () => {
      const { element } = setupWithRevisions();
      expect(element.querySelector('[data-testid="atom-revisions-diff-2"]')).toBeNull();
    });

    it('toggle button expands the diff panel', () => {
      const { fixture, element } = setupWithRevisions();
      const toggleBtn = element.querySelector(
        '[data-testid="atom-revisions-diff-toggle-2"]',
      ) as HTMLButtonElement;
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
      toggleBtn.click();
      fixture.detectChanges();
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
      expect(element.querySelector('[data-testid="atom-revisions-diff-2"]')).toBeTruthy();
    });

    it('toggle button collapses the diff panel on second click', () => {
      const { fixture, element } = setupWithRevisions();
      const toggleBtn = element.querySelector(
        '[data-testid="atom-revisions-diff-toggle-2"]',
      ) as HTMLButtonElement;
      toggleBtn.click();
      fixture.detectChanges();
      toggleBtn.click();
      fixture.detectChanges();
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
      expect(element.querySelector('[data-testid="atom-revisions-diff-2"]')).toBeNull();
    });

    it('diff panel shows before and after content panels', () => {
      const { fixture, element } = setupWithRevisions();
      (
        element.querySelector('[data-testid="atom-revisions-diff-toggle-2"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atom-revisions-diff-before-2"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="atom-revisions-diff-after-2"]')).toBeTruthy();
    });

    it('first revision "before" panel shows the no-prior-state message', () => {
      const { fixture, element } = setupWithRevisions();
      // Toggle the second card (revision 1 — the oldest)
      (
        element.querySelector('[data-testid="atom-revisions-diff-toggle-1"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const before = element.querySelector('[data-testid="atom-revisions-diff-before-1"]');
      expect(before?.textContent).toContain('first revision');
    });
  });

  describe('buildDiff content-serialisation branches', () => {
    function setupWith(revisions: AtomRevision[]) {
      const ctx = setup();
      ctx.service._state.set({ status: 'success', page: buildPage(revisions) });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('after-text uses the null-content fallback when this revision has no content (contentToString content==null arm)', () => {
      // Single revision with content omitted → contentToString(undefined) true-arm.
      const { component } = setupWith([
        buildRevision({ revision_id: 'nc-1', revision_number: 1, content: undefined }),
      ]);
      const diff = component.buildDiff(component.revisions()[0], 0);
      expect(diff.after).toBe('(content not included in listing response)');
      // No older revision → before uses the "first revision" ternary-falsy arm.
      expect(diff.before).toBe('(first revision: no prior state)');
    });

    it('before-text uses the null-content fallback when the previous revision has no content', () => {
      // Newest has content; older one omits content → before (prev.content undefined) → null-arm.
      const { component } = setupWith([
        buildRevision({ revision_id: 'nc-2', revision_number: 2, content: { v: 'new' } }),
        buildRevision({ revision_id: 'nc-1', revision_number: 1, content: undefined }),
      ]);
      const diff = component.buildDiff(component.revisions()[0], 0);
      expect(diff.before).toBe('(content not included in listing response)');
      // after serialises the present content (contentToString non-null arm).
      expect(diff.after).toBe(JSON.stringify({ v: 'new' }, null, 2));
    });

    it('after-text uses the serialise-failure fallback for circular content (contentToString catch arm)', () => {
      const circular: Record<string, unknown> = { name: 'loop' };
      circular['self'] = circular;
      const { component } = setupWith([
        buildRevision({ revision_id: 'circ-1', revision_number: 1, content: circular }),
      ]);
      const diff = component.buildDiff(component.revisions()[0], 0);
      // JSON.stringify throws on the circular ref → caught → fallback string.
      expect(diff.after).toBe('(unable to serialise content)');
    });

    it('before-text uses the serialise-failure fallback when the previous revision content is circular', () => {
      const circular: Record<string, unknown> = { tag: 'prev' };
      circular['ring'] = circular;
      const { component } = setupWith([
        buildRevision({ revision_id: 'circ-2', revision_number: 2, content: { v: 'ok' } }),
        buildRevision({ revision_id: 'circ-1', revision_number: 1, content: circular }),
      ]);
      const diff = component.buildDiff(component.revisions()[0], 0);
      expect(diff.before).toBe('(unable to serialise content)');
      expect(diff.after).toBe(JSON.stringify({ v: 'ok' }, null, 2));
    });
  });

  describe('component-derived computed signals', () => {
    it('isLoading=true / isError=false / isEmpty=false / isContractGap=false / errorKey="" while loading', () => {
      // Default stub state is loading.
      const { component } = setup();
      expect(component.isLoading()).toBe(true);
      expect(component.isError()).toBe(false);
      expect(component.isEmpty()).toBe(false);
      expect(component.isContractGap()).toBe(false);
      // errorKey ternary falsy arm (status !== 'error') → empty string.
      expect(component.errorKey()).toBe('');
    });

    it('isContractGap returns false in a success (non-error) state (early-return guard)', () => {
      const { component, service, fixture } = setup();
      service._state.set({ status: 'success', page: buildPage([buildRevision()]) });
      fixture.detectChanges();
      // status !== 'error' → isContractGap early-return false arm.
      expect(component.isContractGap()).toBe(false);
      // isEmpty: status success true AND length 0 false → second && operand false.
      expect(component.isEmpty()).toBe(false);
    });

    it('errorKey returns the error string and isError=true in an error state (ternary truthy arm)', () => {
      const { component, service, fixture } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_unauthorised',
      });
      fixture.detectChanges();
      expect(component.isError()).toBe(true);
      expect(component.errorKey()).toBe('aplus.atom_revisions.error_unauthorised');
      expect(component.isLoading()).toBe(false);
    });

    it('isContractGap=false for a non-gap error key (both || operands false)', () => {
      const { component, service, fixture } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.atom_revisions.error_unauthorised',
      });
      fixture.detectChanges();
      expect(component.isContractGap()).toBe(false);
    });

    it('isExpanded is false for an unknown revision id (has() false arm)', () => {
      const { component } = setup();
      expect(component.isExpanded('never-toggled')).toBe(false);
    });

    it('toggleDiff adds then removes a revision id (both has() arms)', () => {
      const { component } = setup();
      component.toggleDiff('r1');
      expect(component.isExpanded('r1')).toBe(true);
      component.toggleDiff('r1');
      expect(component.isExpanded('r1')).toBe(false);
    });

    it('gcidShort truncates to first 8 chars plus ellipsis', () => {
      const { component } = setup();
      expect(component.gcidShort('0189abcd-ef01-2345')).toBe('0189abcd…');
    });
  });

  describe('accessibility', () => {
    it('renders a single h1', () => {
      const { element } = setup();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });

    it('all buttons have accessible text or aria-label (success branch)', () => {
      const ctx = setup();
      ctx.service._state.set({
        status: 'success',
        page: buildPage([buildRevision()]),
      });
      ctx.fixture.detectChanges();
      const buttons = Array.from(ctx.element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });

    it('timeline has aria-label', () => {
      const ctx = setup();
      ctx.service._state.set({ status: 'success', page: buildPage([buildRevision()]) });
      ctx.fixture.detectChanges();
      const timeline = ctx.element.querySelector('[data-testid="atom-revisions-timeline"]');
      expect(timeline?.getAttribute('aria-label')).toBeTruthy();
    });
  });
});
