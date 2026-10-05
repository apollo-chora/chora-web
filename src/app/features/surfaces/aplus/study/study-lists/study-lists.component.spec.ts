/**
 * StudyListsComponent spec — CHO-2217 (WP2 Study surface).
 *
 * Tests cover:
 * - Loading / error / empty / success states
 * - Success: a card per study list with title + atom count
 * - 🔴 ADR-233 D3: the card offers NO linear-cursor affordance. A study list is
 *   `traversal_mode: spaced` and the BE's Advance() REFUSES on it
 *   (ErrSpacedPathNoCursor), so a Continue/Resume CTA would 4xx every time. The
 *   honoured action is the Daily Dose curiosity slot.
 * - Accessibility: h1, real <a> for navigation, accessible names
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { TranslateService } from '../../../../../core/services/translate.service';
import { StudyListsComponent } from './study-lists.component';
import { StudyService } from '../study.service';
import type { MeLearningPath, StudyListState } from '../study.model';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const COLLECTION_ID = '30000000-0000-7000-8000-000000000003';
const PATH_ID = '60000000-0000-7000-8000-000000000001';

function buildStudyList(overrides: Partial<MeLearningPath> = {}): MeLearningPath {
  return {
    path_id: PATH_ID,
    title: 'OSI Model Study Guide',
    atom_ids: ['a-1', 'a-2', 'a-3'],
    source_type: 'collection',
    source_id: COLLECTION_ID,
    current_index: 0,
    total_atoms: 3,
    progress_percent: 0,
    completed: false,
    ...overrides,
  };
}

// ── Stub service ─────────────────────────────────────────────────────────────

class StubStudyService {
  loadCalls = 0;
  readonly _listState: WritableSignal<StudyListState> = signal<StudyListState>({
    status: 'loading',
  });
  readonly listState: Signal<StudyListState> = this._listState.asReadonly();
  readonly studyLists = computed<readonly MeLearningPath[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });
  loadStudyLists(): void {
    this.loadCalls += 1;
  }
}

/**
 * The real TranslateService returns the raw KEY when no translations are loaded,
 * which would silently drop every interpolated param. That matters here: the
 * "never surfaces the INERT cursor fields" test asserts `not.toContain('42')`,
 * and an assertion like that passes for FREE if no number ever reaches the DOM.
 * This double echoes params back so the paired `toContain('12')` proves numbers
 * DO render, which is what makes the negative assertion mean something.
 */
class StubTranslateService {
  instant(key: string, params?: Record<string, string | number>): string {
    return params ? `${key} ${Object.values(params).join(' ')}` : key;
  }
}

describe('StudyListsComponent', () => {
  let fixture: ComponentFixture<StudyListsComponent>;
  let stub: StubStudyService;

  beforeEach(async () => {
    stub = new StubStudyService();
    await TestBed.configureTestingModule({
      imports: [StudyListsComponent],
      providers: [
        provideRouter([]),
        { provide: StudyService, useValue: stub },
        { provide: TranslateService, useClass: StubTranslateService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudyListsComponent);
  });

  function el(testid: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  it('loads the study lists on init', () => {
    fixture.detectChanges();
    expect(stub.loadCalls).toBe(1);
  });

  it('renders the shared Courses sub-nav strip (CHO-2318, re-pointed C2 slice 3)', () => {
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="courses-sub-nav"]'),
    ).toBeTruthy();
  });

  it('renders the loading panel while loading', () => {
    fixture.detectChanges();
    expect(el('study-lists-loading')).not.toBeNull();
  });

  it('renders an error banner with role=alert on error', () => {
    stub._listState.set({ status: 'error', error: 'aplus.study.error_upstream' });
    fixture.detectChanges();
    const banner = el('study-lists-error');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('alert');
  });

  it('renders the empty state when there are no study lists', () => {
    stub._listState.set({ status: 'success', items: [] });
    fixture.detectChanges();
    expect(el('study-lists-empty')).not.toBeNull();
    expect(el('study-lists-grid')).toBeNull();
  });

  it('renders one card per study list, with title and atom count', () => {
    stub._listState.set({
      status: 'success',
      items: [
        buildStudyList(),
        buildStudyList({ path_id: 'p-2', title: 'TCP handshake', total_atoms: 7 }),
      ],
    });
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('[data-testid^="study-list-card-"]');
    expect(cards).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('OSI Model Study Guide');
    expect(fixture.nativeElement.textContent).toContain('TCP handshake');
  });

  // ── 🔴 ADR-233 D3 — the load-bearing design constraint ─────────────────────

  it('points the card CTA at the Daily Dose, the action the BE actually honours', () => {
    stub._listState.set({ status: 'success', items: [buildStudyList()] });
    fixture.detectChanges();
    const cta = el(`study-list-dose-cta-${PATH_ID}`);
    expect(cta).not.toBeNull();
    expect(cta?.tagName).toBe('A'); // real link, not a button (WCAG)
    expect(cta?.getAttribute('href')).toBe('/a/daily-dose');
  });

  it('links back to the source collection via source_id', () => {
    stub._listState.set({ status: 'success', items: [buildStudyList()] });
    fixture.detectChanges();
    const link = el(`study-list-source-${PATH_ID}`);
    expect(link?.getAttribute('href')).toBe(`/a/study/collections/${COLLECTION_ID}`);
  });

  it('offers NO linear-cursor CTA — Advance() refuses on a spaced path', () => {
    stub._listState.set({ status: 'success', items: [buildStudyList()] });
    fixture.detectChanges();
    // Assert the card's COMPLETE anchor set, not the absence of one selector: an
    // absence assertion passes vacuously if the thing was never rendered in this
    // state anyway. Enumerating every href makes an added "Continue" link fail.
    const card = el(`study-list-card-${PATH_ID}`);
    const hrefs = Array.from(card?.querySelectorAll('a') ?? []).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/a/daily-dose', `/a/study/collections/${COLLECTION_ID}`]);
    expect(hrefs.some((h) => h?.includes('/play'))).toBe(false);
  });

  it('never surfaces the INERT cursor fields, even when the wire carries values', () => {
    // Hostile fixture: the BE cannot produce these for a spaced path
    // (current_index is frozen at 0 ⇒ progress_percent 0.0, completed false).
    // Feeding them anyway proves the component IGNORES them rather than merely
    // never having been handed anything to render — the difference between a
    // real guard and a test that passes for the wrong reason.
    stub._listState.set({
      status: 'success',
      items: [
        buildStudyList({
          current_index: 5,
          progress_percent: 0.42,
          completed: true,
          total_atoms: 12,
        }),
      ],
    });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent ?? '';
    expect(text).not.toContain('42'); // no progress_percent readout
    expect(text).not.toContain('5 of'); // no "5 of 12" cursor readout
    expect(text).not.toMatch(/%/); // no progress bar percentage
    expect(el(`study-list-progress-${PATH_ID}`)).toBeNull();
    // The honest count IS rendered.
    expect(text).toContain('12');
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('renders an h1 heading', () => {
    stub._listState.set({ status: 'success', items: [buildStudyList()] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')).not.toBeNull();
  });

  it('gives every link an accessible name', () => {
    stub._listState.set({ status: 'success', items: [buildStudyList()] });
    fixture.detectChanges();
    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('a'),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const name = (a.textContent ?? '').trim() || a.getAttribute('aria-label') || '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
