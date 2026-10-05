import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { MeTranscriptComponent } from './me-transcript.component';
import { MeTranscriptService } from './me-transcript.service';
import type {
  MeTranscriptState,
  TranscriptEntry,
} from './me-transcript.model';

/**
 * MeTranscriptComponent spec — A+ per-learner transcript list.
 */

function buildEntry(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    entryId: '01985e7f-1234-7abc-8def-000000000c01',
    gcid: '00000000-0000-7000-8000-000000001999',
    kind: 'assessment',
    sourceRef: '01985e7f-1234-7abc-8def-000000000a01',
    title: 'Agile Estimation — Cohort May 2026',
    scoreEarned: 40,
    scorePossible: 50,
    scorePercent: 80,
    passed: true,
    courseId: null,
    occurredAt: '2026-05-20T16:00:00Z',
    ...overrides,
  };
}

class StubMeTranscriptService {
  readonly _state: WritableSignal<MeTranscriptState> =
    signal<MeTranscriptState>({ status: 'loading' });
  readonly state = this._state.asReadonly();
  readonly items = computed<readonly TranscriptEntry[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.items : [];
  });
  loadCalls = 0;
  lastLimit: number | undefined;
  loadTranscript(limit?: number): void {
    this.loadCalls++;
    this.lastLimit = limit;
  }
}

function setup(): {
  fixture: ComponentFixture<MeTranscriptComponent>;
  component: MeTranscriptComponent;
  element: HTMLElement;
  service: StubMeTranscriptService;
} {
  const service = new StubMeTranscriptService();
  TestBed.configureTestingModule({
    imports: [MeTranscriptComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: MeTranscriptService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(MeTranscriptComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

function rowSel(entryId: string): string {
  return `[data-testid="me-transcript-row-${entryId}"]`;
}

describe('MeTranscriptComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load wiring', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('renders the shared Courses sub-nav strip (CHO-2318, re-pointed C2 slice 3)', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="courses-sub-nav"]')).toBeTruthy();
    });

    it('fires service.loadTranscript() on init', () => {
      const { service } = setup();
      expect(service.loadCalls).toBe(1);
    });

    it('renders surface-aplus class on root', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="me-transcript"]',
      ) as HTMLElement;
      expect(root.classList.contains('surface-aplus')).toBe(true);
    });
  });

  describe('loading branch', () => {
    it('renders the loading indicator while loading', () => {
      const { element } = setup();
      const loading = element.querySelector(
        '[data-testid="me-transcript-loading"]',
      );
      expect(loading).toBeTruthy();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
    });

    it('does NOT render rows or empty-state while loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="me-transcript-rows"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="me-transcript-empty"]'),
      ).toBeNull();
    });
  });

  describe('success branch — rows', () => {
    it('renders one row per entry, preserving BE order', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [
          buildEntry({ entryId: 'newest', title: 'Newest' }),
          buildEntry({ entryId: 'oldest', title: 'Oldest' }),
        ],
      });
      fixture.detectChanges();
      const rows = element.querySelectorAll(
        'li[data-testid^="me-transcript-row-"]',
      );
      expect(rows.length).toBe(2);
      expect(rows[0].getAttribute('data-testid')).toBe(
        'me-transcript-row-newest',
      );
      expect(rows[1].getAttribute('data-testid')).toBe(
        'me-transcript-row-oldest',
      );
    });

    it('renders the entry title', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', title: 'Real Title — Cohort' })],
      });
      fixture.detectChanges();
      const title = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-title"]`,
      );
      expect(title?.textContent).toContain('Real Title — Cohort');
    });

    it('renders an assessment kind chip', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', kind: 'assessment' })],
      });
      fixture.detectChanges();
      const chip = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-kind"]`,
      );
      expect(chip?.getAttribute('data-kind')).toBe('assessment');
    });

    it('renders a certification kind chip', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'c1', kind: 'certification' })],
      });
      fixture.detectChanges();
      const chip = element.querySelector(
        `${rowSel('c1')} [data-testid="me-transcript-row-kind"]`,
      );
      expect(chip?.getAttribute('data-kind')).toBe('certification');
    });

    it('renders the score percent for a scored row', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', scorePercent: 80 })],
      });
      fixture.detectChanges();
      const score = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-score"]`,
      );
      expect(score?.textContent).toContain('80');
      expect(score?.textContent).toContain('%');
    });

    it('renders a real 0% score (not the null placeholder)', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', scorePercent: 0, passed: false })],
      });
      fixture.detectChanges();
      const score = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-score"]`,
      );
      expect(score?.textContent).toContain('0');
      expect(score?.textContent).not.toContain('-');
    });

    it('renders a hyphen "-" for a null score (NEVER 0%)', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [
          buildEntry({
            entryId: 'c1',
            kind: 'certification',
            scorePercent: null,
            passed: null,
          }),
        ],
      });
      fixture.detectChanges();
      const score = element.querySelector(
        `${rowSel('c1')} [data-testid="me-transcript-row-score"]`,
      );
      expect(score?.textContent).toContain('-');
      expect(score?.textContent).not.toContain('0%');
    });

    it('renders a pass chip for a passed row', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', passed: true })],
      });
      fixture.detectChanges();
      const chip = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-pass"]`,
      );
      expect(chip?.getAttribute('data-pass')).toBe('pass');
    });

    it('renders a fail chip for a failed row', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', passed: false })],
      });
      fixture.detectChanges();
      const chip = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-pass"]`,
      );
      expect(chip?.getAttribute('data-pass')).toBe('fail');
    });

    it('renders NO pass chip when passed is null (certification)', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [
          buildEntry({ entryId: 'c1', kind: 'certification', passed: null }),
        ],
      });
      fixture.detectChanges();
      const chip = element.querySelector(
        `${rowSel('c1')} [data-testid="me-transcript-row-pass"]`,
      );
      expect(chip).toBeNull();
    });

    it('renders a formatted date', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'success',
        items: [buildEntry({ entryId: 'a1', occurredAt: '2026-05-20T16:00:00Z' })],
      });
      fixture.detectChanges();
      const date = element.querySelector(
        `${rowSel('a1')} [data-testid="me-transcript-row-date"]`,
      );
      expect(date?.textContent).toContain('2026');
    });
  });

  describe('empty branch', () => {
    it('renders an honest empty-state when items[] is empty', () => {
      const { service, fixture, element } = setup();
      service._state.set({ status: 'success', items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-transcript-empty"]'),
      ).toBeTruthy();
    });

    it('does NOT render any rows when empty', () => {
      const { service, fixture, element } = setup();
      service._state.set({ status: 'success', items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-transcript-rows"]'),
      ).toBeNull();
      expect(
        element.querySelectorAll('li[data-testid^="me-transcript-row-"]').length,
      ).toBe(0);
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders a role=alert error banner with the translated key', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.me_transcript.list.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="me-transcript-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires service.loadTranscript()', () => {
      const { service, fixture, element } = setup();
      service._state.set({
        status: 'error',
        error: 'aplus.me_transcript.list.error_generic',
      });
      fixture.detectChanges();
      const before = service.loadCalls;
      (
        element.querySelector(
          '[data-testid="me-transcript-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.loadCalls).toBe(before + 1);
    });
  });

  describe('a11y', () => {
    it('uses a single h1 for the page heading', () => {
      const { element } = setup();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });
  });
});
