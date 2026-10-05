import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { QuestionTypePickerComponent } from './question-type-picker.component';
import type {
  QuestionType,
  QuestionTypeOption,
} from '../atom-authoring.model';

/**
 * QuestionTypePickerComponent (Phase D) — 16-tile picker. Server-data-
 * driven from `GET /api/atoms/question-types` (registry from Phase C
 * `AtomAuthoringService.loadQuestionTypes()`). Parent passes the typed
 * array via `types` input; on selection, the component emits
 * `typeSelected: QuestionType` and visually highlights the chosen tile.
 *
 * Inputs:
 *   types         — readonly QuestionTypeRegistryEntry[] (required)
 *   selectedType  — QuestionType | null (default null) — initial selection
 *   disabled      — boolean (default false) — global lock (e.g. edit-screen
 *                   where `type` is immutable post-create per BE contract)
 *
 * Outputs:
 *   typeSelected  — emits QuestionType when an ENABLED tile is activated
 *
 * Disabled tiles render greyed-out with "Coming soon" + `aria-disabled=true`
 * and are NOT keyboard-activatable. role=radiogroup on the container, each
 * tile role=radio with aria-checked + aria-label.
 */

function buildRegistry(): readonly QuestionTypeOption[] {
  return [
    { code: 'mcq', label_en: 'Multiple Choice', label_zh: null, enabled: true, scope: 'phyllis' },
    { code: 'oe', label_en: 'Open-Ended', label_zh: null, enabled: true, scope: 'phyllis' },
    { code: 'reserved_short_answer', label_en: 'Short Answer', label_zh: null, enabled: false, scope: 'reserved' },
    { code: 'reserved_true_false', label_en: 'True / False', label_zh: null, enabled: false, scope: 'reserved' },
  ];
}

function setupHarness(
  types: readonly QuestionTypeOption[],
  selectedType: QuestionType | null = null,
  disabled = false,
): { fixture: ComponentFixture<QuestionTypePickerComponent>; element: HTMLElement } {
  const fixture = TestBed.createComponent(QuestionTypePickerComponent);
  fixture.componentRef.setInput('types', types);
  fixture.componentRef.setInput('selectedType', selectedType);
  fixture.componentRef.setInput('disabled', disabled);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

/**
 * A1 design refinement (2026-05-17) — reserved tiles now live inside a
 * "Coming soon" disclosure collapsed by default. Tests that assert on
 * reserved-tile rendering must first expand the disclosure.
 */
function expandComingSoon(
  fixture: ComponentFixture<QuestionTypePickerComponent>,
  element: HTMLElement,
): void {
  const toggle = element.querySelector(
    '[data-testid="question-type-picker-coming-soon-toggle"]',
  ) as HTMLButtonElement | null;
  if (toggle) {
    toggle.click();
    fixture.detectChanges();
  }
}

describe('QuestionTypePickerComponent (Phase D — 16-tile picker)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionTypePickerComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  describe('structure + a11y', () => {
    it('container has role=radiogroup with aria-label', () => {
      const { element } = setupHarness(buildRegistry());
      const group = element.querySelector('[data-testid="question-type-picker"]');
      expect(group).toBeTruthy();
      expect(group?.getAttribute('role')).toBe('radiogroup');
      expect(group?.getAttribute('aria-label')).toBeTruthy();
    });

    it('renders one tile per registry entry (after expanding Coming soon disclosure)', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const tiles = element.querySelectorAll('[data-testid^="question-type-picker-tile-"]');
      expect(tiles.length).toBe(4);
    });

    it('renders no tiles when types is empty (parent handles loading)', () => {
      const { element } = setupHarness([]);
      const tiles = element.querySelectorAll('[data-testid^="question-type-picker-tile-"]');
      expect(tiles.length).toBe(0);
    });

    it('each tile has role=radio + aria-label from registry label', () => {
      const { element } = setupHarness(buildRegistry());
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.getAttribute('role')).toBe('radio');
      expect(mcqTile?.getAttribute('aria-label')).toContain('Multiple Choice');
    });

    it('tiles render the registry label_en text', () => {
      const { element } = setupHarness(buildRegistry());
      const oeTile = element.querySelector('[data-testid="question-type-picker-tile-oe"]');
      expect(oeTile?.textContent).toContain('Open-Ended');
    });

    it('tiles render the question_type code as the glyph hint', () => {
      const { element } = setupHarness(buildRegistry());
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.textContent).toContain('mcq');
    });
  });

  describe('enabled / disabled tile state', () => {
    it('disabled tiles get aria-disabled=true', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const reservedTile = element.querySelector(
        '[data-testid="question-type-picker-tile-reserved_short_answer"]',
      );
      expect(reservedTile?.getAttribute('aria-disabled')).toBe('true');
    });

    it('enabled tiles get aria-disabled=false', () => {
      const { element } = setupHarness(buildRegistry());
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.getAttribute('aria-disabled')).toBe('false');
    });

    it('disabled tiles render the "Coming soon" label', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const reservedTile = element.querySelector(
        '[data-testid="question-type-picker-tile-reserved_short_answer"]',
      );
      expect(reservedTile?.textContent).toContain('core.question_type_picker.coming_soon');
    });

    it('enabled tiles do NOT render the "Coming soon" label', () => {
      const { element } = setupHarness(buildRegistry());
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.textContent).not.toContain('core.question_type_picker.coming_soon');
    });

    it('disabled tiles get tabindex=-1 (not in tab order)', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const reservedTile = element.querySelector(
        '[data-testid="question-type-picker-tile-reserved_short_answer"]',
      );
      expect(reservedTile?.getAttribute('tabindex')).toBe('-1');
    });

    it('enabled tiles are in the tab order', () => {
      const { element } = setupHarness(buildRegistry());
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      const tabindex = mcqTile?.getAttribute('tabindex');
      expect(tabindex === '0' || tabindex === null).toBe(true);
    });
  });

  describe('selection state', () => {
    it('selected tile gets aria-checked=true', () => {
      const { element } = setupHarness(buildRegistry(), 'mcq');
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.getAttribute('aria-checked')).toBe('true');
    });

    it('non-selected tiles get aria-checked=false', () => {
      const { element } = setupHarness(buildRegistry(), 'mcq');
      const oeTile = element.querySelector('[data-testid="question-type-picker-tile-oe"]');
      expect(oeTile?.getAttribute('aria-checked')).toBe('false');
    });

    it('selectedType=null → no tile aria-checked=true', () => {
      const { element } = setupHarness(buildRegistry(), null);
      const checkedTiles = element.querySelectorAll('[aria-checked="true"]');
      expect(checkedTiles.length).toBe(0);
    });

    it('selected tile gets the --selected CSS modifier class', () => {
      const { element } = setupHarness(buildRegistry(), 'mcq');
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.classList.contains('question-type-picker__tile--selected')).toBe(true);
    });
  });

  describe('output events — click activation', () => {
    it('emits typeSelected with the type when an enabled tile is clicked', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      (element.querySelector(
        '[data-testid="question-type-picker-tile-mcq"]',
      ) as HTMLElement).click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('mcq');
    });

    it('does NOT emit when a disabled tile is clicked', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      (element.querySelector(
        '[data-testid="question-type-picker-tile-reserved_short_answer"]',
      ) as HTMLElement).click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('clicking the same tile twice still emits each time (idempotent UX)', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      const tile = element.querySelector(
        '[data-testid="question-type-picker-tile-mcq"]',
      ) as HTMLElement;
      tile.click();
      tile.click();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('output events — keyboard activation', () => {
    it('Enter on an enabled tile emits typeSelected', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      const tile = element.querySelector(
        '[data-testid="question-type-picker-tile-mcq"]',
      ) as HTMLElement;
      tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(spy).toHaveBeenCalledWith('mcq');
    });

    it('Space on an enabled tile emits typeSelected', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      const tile = element.querySelector(
        '[data-testid="question-type-picker-tile-mcq"]',
      ) as HTMLElement;
      tile.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(spy).toHaveBeenCalledWith('mcq');
    });

    it('Enter on a disabled tile does NOT emit', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      expandComingSoon(fixture, element);
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      const tile = element.querySelector(
        '[data-testid="question-type-picker-tile-reserved_short_answer"]',
      ) as HTMLElement;
      tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('global disabled (edit-screen lock)', () => {
    it('disabled=true → ALL tiles get aria-disabled=true (including mcq + oe)', () => {
      const { element } = setupHarness(buildRegistry(), 'mcq', true);
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      const oeTile = element.querySelector('[data-testid="question-type-picker-tile-oe"]');
      expect(mcqTile?.getAttribute('aria-disabled')).toBe('true');
      expect(oeTile?.getAttribute('aria-disabled')).toBe('true');
    });

    it('disabled=true → click on selected tile does NOT emit (lock honoured)', () => {
      const { fixture, element } = setupHarness(buildRegistry(), 'mcq', true);
      const spy = vi.fn();
      fixture.componentInstance.typeSelected.subscribe(spy);
      (element.querySelector(
        '[data-testid="question-type-picker-tile-mcq"]',
      ) as HTMLElement).click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('disabled=true → the selected tile still shows aria-checked=true', () => {
      const { element } = setupHarness(buildRegistry(), 'mcq', true);
      const mcqTile = element.querySelector('[data-testid="question-type-picker-tile-mcq"]');
      expect(mcqTile?.getAttribute('aria-checked')).toBe('true');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // A1 design refinement (CJ#1 smoke #4) — primary tiles promoted to a
  // 2-tile row; reserved tiles collapsed into a "Coming soon" disclosure
  // that expands on click. Per docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md.
  // ═══════════════════════════════════════════════════════════════════════

  describe('A1 — primary row + Coming soon disclosure', () => {
    it('renders enabled tiles inside the primary group', () => {
      const { element } = setupHarness(buildRegistry());
      const primary = element.querySelector(
        '[data-testid="question-type-picker-primary"]',
      );
      expect(primary).not.toBeNull();
      expect(
        primary?.querySelector('[data-testid="question-type-picker-tile-mcq"]'),
      ).not.toBeNull();
      expect(
        primary?.querySelector('[data-testid="question-type-picker-tile-oe"]'),
      ).not.toBeNull();
    });

    it('reserved tiles live INSIDE the Coming soon disclosure (not in primary)', () => {
      const { element } = setupHarness(buildRegistry());
      const primary = element.querySelector(
        '[data-testid="question-type-picker-primary"]',
      );
      expect(
        primary?.querySelector(
          '[data-testid="question-type-picker-tile-reserved_short_answer"]',
        ),
      ).toBeNull();
    });

    it('disclosure toggle button is present, is a real <button>, and is collapsed by default', () => {
      const { element } = setupHarness(buildRegistry());
      const toggle = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-toggle"]',
      );
      expect(toggle).not.toBeNull();
      expect(toggle?.tagName).toBe('BUTTON');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    });

    it('disclosure panel is NOT in the DOM when collapsed', () => {
      const { element } = setupHarness(buildRegistry());
      const panel = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-panel"]',
      );
      expect(panel).toBeNull();
    });

    it('disclosure toggle aria-controls references the panel id', () => {
      const { element } = setupHarness(buildRegistry());
      const toggle = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-toggle"]',
      );
      const controls = toggle?.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
    });

    it('clicking the toggle expands the panel and exposes reserved tiles', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const toggle = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-toggle"]',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const panel = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-panel"]',
      );
      expect(panel).not.toBeNull();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(
        panel?.querySelector(
          '[data-testid="question-type-picker-tile-reserved_short_answer"]',
        ),
      ).not.toBeNull();
      expect(
        panel?.querySelector(
          '[data-testid="question-type-picker-tile-reserved_true_false"]',
        ),
      ).not.toBeNull();
    });

    it('clicking the toggle a second time collapses the panel again', () => {
      const { fixture, element } = setupHarness(buildRegistry());
      const toggle = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-toggle"]',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(
        element.querySelector(
          '[data-testid="question-type-picker-coming-soon-panel"]',
        ),
      ).toBeNull();
    });

    it('toggle shows a count of reserved tiles for affordance', () => {
      const { element } = setupHarness(buildRegistry());
      const toggle = element.querySelector(
        '[data-testid="question-type-picker-coming-soon-toggle"]',
      );
      expect(toggle?.textContent).toContain('2');
    });

    it('omits the disclosure entirely when there are no reserved tiles', () => {
      const enabledOnly: readonly QuestionTypeOption[] = [
        { code: 'mcq', label_en: 'Multiple Choice', label_zh: null, enabled: true, scope: 'phyllis' },
        { code: 'oe', label_en: 'Open-Ended', label_zh: null, enabled: true, scope: 'phyllis' },
      ];
      const { element } = setupHarness(enabledOnly);
      expect(
        element.querySelector('[data-testid="question-type-picker-coming-soon-toggle"]'),
      ).toBeNull();
    });
  });
});
