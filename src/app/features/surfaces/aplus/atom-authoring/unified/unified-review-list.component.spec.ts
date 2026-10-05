/**
 * UnifiedReviewListComponent spec — A+ unified authoring canvas (CHO-1826 U4.3).
 *
 * Presentational-only: NO service, NO HTTP orchestration. Inputs are set via
 * `fixture.componentRef.setInput()`; interactions are asserted through the
 * `output()` emitter refs. `provideHttpClient()` satisfies the transitive
 * TranslateService → HttpClient dependency pulled in by the `| translate` pipe
 * (the pipe falls back to the i18n key when no translations are loaded).
 *
 * Harness mirrors batch/unified-atom-authoring specs (TestBed + jsdom).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { UnifiedReviewListComponent } from './unified-review-list.component';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type {
  QuestionCitation,
  QuestionDraftCandidate,
} from '../atom-authoring.model';
import type {
  ManaPreview,
  UnifiedReviewItem,
  UnifiedTestSetConfig,
} from './unified-review.model';

// ── Fixtures ────────────────────────────────────────────────────────
function editableMcq(prompt: string): EditableQuestion {
  return {
    question_type: 'mcq',
    prompt,
    options: [
      { option_id: 'o1', label: 'A', is_correct: true, explainer: 'right' },
      { option_id: 'o2', label: 'B', is_correct: false, explainer: 'wrong' },
    ],
    model_answer: '',
  };
}

function aiItem(
  draftId: string,
  prompt: string,
  candidateOver?: Partial<QuestionDraftCandidate>,
): UnifiedReviewItem {
  return {
    kind: 'ai',
    draftId,
    candidate: { draft_id: draftId, type: 'mcq', prompt, ...candidateOver },
    edit: editableMcq(prompt),
    selected: true,
    edited: false,
  };
}

function manualItem(tempId: string, prompt: string): UnifiedReviewItem {
  return { kind: 'manual', tempId, edit: editableMcq(prompt), selected: true };
}

function manaPreview(over?: Partial<ManaPreview>): ManaPreview {
  return { textCount: 2, imageCount: 1, manualCount: 1, total: 40, ...over };
}

interface SetupOver {
  items?: readonly UnifiedReviewItem[];
  mana?: ManaPreview;
  busy?: boolean;
  testSet?: UnifiedTestSetConfig;
  canAccept?: boolean;
  acceptError?: string | null;
  canAssembleTestSet?: boolean;
  regenState?: Readonly<
    Record<string, { regenerating: boolean; error: string | null }>
  >;
  manualOnly?: boolean;
}

async function setup(over: SetupOver = {}): Promise<{
  fixture: ComponentFixture<UnifiedReviewListComponent>;
  component: UnifiedReviewListComponent;
  el: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [UnifiedReviewListComponent],
    providers: [provideHttpClient()],
  }).compileComponents();

  const fixture = TestBed.createComponent(UnifiedReviewListComponent);
  const component = fixture.componentInstance;
  // Required inputs MUST be set before the first detectChanges().
  fixture.componentRef.setInput(
    'items',
    over.items ?? [aiItem('d-1', 'AI question'), manualItem('m-1', 'Manual question')],
  );
  fixture.componentRef.setInput('manaPreview', over.mana ?? manaPreview());
  fixture.componentRef.setInput('busy', over.busy ?? false);
  fixture.componentRef.setInput(
    'testSet',
    over.testSet ?? { enabled: false, title: '' },
  );
  fixture.componentRef.setInput('canAccept', over.canAccept ?? false);
  fixture.componentRef.setInput('acceptError', over.acceptError ?? null);
  fixture.componentRef.setInput(
    'canAssembleTestSet',
    over.canAssembleTestSet ?? true,
  );
  fixture.componentRef.setInput('regenState', over.regenState ?? {});
  fixture.componentRef.setInput('manualOnly', over.manualOnly ?? false);
  fixture.detectChanges();
  return { fixture, component, el: fixture.nativeElement as HTMLElement };
}

describe('UnifiedReviewListComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ── Rendering ─────────────────────────────────────────────────────
  it('renders one row per item with AI + manual interleaved', async () => {
    const { el } = await setup({
      items: [aiItem('d-1', 'AI Q'), manualItem('m-1', 'Manual Q'), aiItem('d-2', 'AI Q2')],
    });
    const rows = el.querySelectorAll('[data-testid^="unified-review-row-"]');
    expect(rows.length).toBe(3);
    expect(el.querySelector('[data-testid="unified-review-row-d-1"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="unified-review-row-m-1"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="unified-review-row-d-2"]')).toBeTruthy();
    // Origin badges distinguish AI vs manual rows.
    expect(
      el.querySelector('[data-testid="unified-review-badge-d-1"]')?.textContent,
    ).toContain('badge_ai');
    expect(
      el.querySelector('[data-testid="unified-review-badge-m-1"]')?.textContent,
    ).toContain('badge_manual');
  });

  it('renders the empty hint when there are no items', async () => {
    const { el } = await setup({ items: [] });
    expect(el.querySelector('[data-testid="unified-review-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="unified-review-rows"]')).toBeNull();
    // The add/mana/test-set/accept affordances still render with an empty list.
    expect(el.querySelector('[data-testid="unified-review-add-mcq"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="unified-review-accept"]')).toBeTruthy();
  });

  // ── Selection ─────────────────────────────────────────────────────
  it('emits toggleSelect with the row key (draftId for AI, tempId for manual)', async () => {
    const { el, component } = await setup({
      items: [aiItem('d-1', 'AI Q'), manualItem('m-7', 'Manual Q')],
    });
    const keys: string[] = [];
    component.toggleSelect.subscribe((k) => keys.push(k));

    el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-select-d-1"]',
    )!.dispatchEvent(new Event('change'));
    el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-select-m-7"]',
    )!.dispatchEvent(new Event('change'));

    expect(keys).toEqual(['d-1', 'm-7']);
  });

  // ── Inline editor binding (questionChange → editItem) ─────────────
  it('emits editItem with the row key + edited question when the inline editor changes', async () => {
    const { el, fixture, component } = await setup({ items: [aiItem('d-9', 'Original')] });
    const events: { key: string; edit: EditableQuestion }[] = [];
    component.editItem.subscribe((e) => events.push(e));

    const prompt = el.querySelector<HTMLTextAreaElement>(
      '[data-testid="unified-review-d-9-prompt"]',
    );
    expect(prompt).toBeTruthy();
    prompt!.value = 'Edited prompt';
    prompt!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].key).toBe('d-9');
    expect(events[events.length - 1].edit.prompt).toBe('Edited prompt');
  });

  // ── Per-row title override ────────────────────────────────────────
  it('emits titleChange with the row key + new title', async () => {
    const { el, component } = await setup({ items: [aiItem('d-3', 'Q')] });
    let evt: { key: string; title: string } | null = null;
    component.titleChange.subscribe((e) => (evt = e));

    const input = el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-title-d-3"]',
    );
    input!.value = 'Catalog label';
    input!.dispatchEvent(new Event('input'));

    expect(evt).toEqual({ key: 'd-3', title: 'Catalog label' });
  });

  // ── Add manual ────────────────────────────────────────────────────
  it('emits addManual("mcq") and addManual("oe") from the add buttons', async () => {
    const { el, component } = await setup();
    const emitted: ('mcq' | 'oe')[] = [];
    component.addManual.subscribe((t) => emitted.push(t));

    el.querySelector<HTMLButtonElement>('[data-testid="unified-review-add-mcq"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-testid="unified-review-add-oe"]')!.click();

    expect(emitted).toEqual(['mcq', 'oe']);
  });

  // ── Remove manual (AI rows have NO remove button) ─────────────────
  it('emits removeManual with the tempId from a manual row and AI rows have no remove', async () => {
    const { el, component } = await setup({
      items: [aiItem('d-1', 'AI Q'), manualItem('m-42', 'Manual Q')],
    });
    let removed: string | null = null;
    component.removeManual.subscribe((id) => (removed = id));

    expect(el.querySelector('[data-testid="unified-review-remove-d-1"]')).toBeNull();
    el.querySelector<HTMLButtonElement>(
      '[data-testid="unified-review-remove-m-42"]',
    )!.click();

    expect(removed).toBe('m-42');
  });

  // ── Image regenerate (AI row with a stem image) ───────────────────
  it('emits regenImage with draftId + placement + prompt for an AI stem image', async () => {
    const { el, component } = await setup({
      items: [aiItem('d-1', 'Q', { image_url: 'https://cdn.example/x.png' })],
    });
    let evt: { draftId: string; placement: string; prompt: string } | null = null;
    component.regenImage.subscribe((e) => (evt = e));

    const input = el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-d-1-stem-image-regen-input"]',
    );
    expect(input).toBeTruthy();
    input!.value = 'make it blue';
    input!.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>(
      '[data-testid="unified-review-d-1-stem-image-regen-button"]',
    )!.click();

    expect(evt).toEqual({
      draftId: 'd-1',
      placement: 'stem',
      prompt: 'make it blue',
    });
  });

  // ── Image regenerate state (regenState input drives the control) ──
  it('drives the stem regen control busy state from the regenState input', async () => {
    const { el, component } = await setup({
      items: [aiItem('d-1', 'Q', { image_url: 'https://cdn.example/x.png' })],
      regenState: { 'd-1|stem': { regenerating: true, error: null } },
    });

    // Public helper resolves the per-(draftId|placement) sub-state.
    expect(component.regenInfo('d-1', 'stem').regenerating).toBe(true);
    // The shared control reflects it: the prompt input is disabled while busy.
    const input = el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-d-1-stem-image-regen-input"]',
    );
    expect(input).toBeTruthy();
    expect(input!.disabled).toBe(true);
  });

  it('surfaces a regenState error to the matching control', async () => {
    const { el, component } = await setup({
      items: [aiItem('d-1', 'Q', { image_url: 'https://cdn.example/x.png' })],
      regenState: {
        'd-1|stem': {
          regenerating: false,
          error: 'aplus.unified_authoring.error_failed',
        },
      },
    });

    expect(component.regenInfo('d-1', 'stem').error).toBe(
      'aplus.unified_authoring.error_failed',
    );
    expect(
      el.querySelector('[data-testid="unified-review-d-1-stem-image-regen-error"]'),
    ).toBeTruthy();
  });

  it('regenInfo defaults to idle / no-error for an absent key', async () => {
    const { component } = await setup({
      items: [aiItem('d-1', 'Q', { image_url: 'https://cdn.example/x.png' })],
    });
    expect(component.regenInfo('d-1', 'stem')).toEqual({
      regenerating: false,
      error: null,
    });
  });

  // ── Mana-preview chip ─────────────────────────────────────────────
  it('renders the mana-preview chip from the manaPreview input', async () => {
    const { el } = await setup({
      mana: { textCount: 3, imageCount: 2, manualCount: 1, total: 70 },
    });
    expect(
      el.querySelector('[data-testid="unified-review-mana-total"]')?.textContent,
    ).toContain('70');
    const breakdown = el.querySelector(
      '[data-testid="unified-review-mana-breakdown"]',
    )?.textContent;
    expect(breakdown).toContain('3×10');
    expect(breakdown).toContain('2×20');
  });

  // ── Test-set section ──────────────────────────────────────────────
  it('hides the title input when the test-set is disabled and emits setTestSetEnabled on toggle', async () => {
    const { el, component } = await setup({ testSet: { enabled: false, title: '' } });
    let enabled: boolean | null = null;
    component.setTestSetEnabled.subscribe((v) => (enabled = v));

    expect(el.querySelector('[data-testid="unified-review-test-set-title"]')).toBeNull();
    const toggle = el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-test-set-toggle"]',
    );
    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change'));

    expect(enabled).toBe(true);
  });

  it('shows + wires the test-set title input when enabled', async () => {
    const { el, component } = await setup({
      testSet: { enabled: true, title: 'Quiz 1' },
    });
    let title: string | null = null;
    component.setTestSetTitle.subscribe((t) => (title = t));

    const input = el.querySelector<HTMLInputElement>(
      '[data-testid="unified-review-test-set-title"]',
    );
    expect(input).toBeTruthy();
    expect(input!.value).toBe('Quiz 1');
    input!.value = 'Quiz 2';
    input!.dispatchEvent(new Event('input'));

    expect(title).toBe('Quiz 2');
  });

  // ── Accept gating + emission ──────────────────────────────────────
  it('disables Accept when busy', async () => {
    const { el } = await setup({ busy: true, canAccept: true });
    const btn = el.querySelector<HTMLButtonElement>('[data-testid="unified-review-accept"]');
    expect(btn?.disabled).toBe(true);
  });

  it('disables Accept when canAccept is false', async () => {
    const { el } = await setup({ busy: false, canAccept: false });
    const btn = el.querySelector<HTMLButtonElement>('[data-testid="unified-review-accept"]');
    expect(btn?.disabled).toBe(true);
  });

  it('enables Accept and emits accept() when canAccept && !busy', async () => {
    const { el, component } = await setup({ busy: false, canAccept: true });
    let accepted = false;
    component.accept.subscribe(() => (accepted = true));

    const btn = el.querySelector<HTMLButtonElement>('[data-testid="unified-review-accept"]');
    expect(btn?.disabled).toBe(false);
    btn!.click();

    expect(accepted).toBe(true);
  });

  // ── FE-1 (#3) — accept-error alert (review preserved on failure) ──────
  describe('accept-error alert (FE-1 #3)', () => {
    it('renders a role="alert" near the Accept CTA when acceptError is set', async () => {
      const { el } = await setup({
        acceptError: 'aplus.unified_authoring.error_insufficient_mana',
        canAccept: true,
      });
      const alert = el.querySelector(
        '[data-testid="unified-review-accept-error"]',
      );
      expect(alert).toBeTruthy();
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.getAttribute('aria-live')).toBe('polite');
      expect(alert?.textContent).toContain(
        'aplus.unified_authoring.error_insufficient_mana',
      );
    });

    it('omits the accept-error alert when acceptError is null', async () => {
      const { el } = await setup({ acceptError: null });
      expect(
        el.querySelector('[data-testid="unified-review-accept-error"]'),
      ).toBeNull();
    });
  });

  // ── FE-2 (#2) — test-set toggle gate to ≥2 candidates ─────────────────
  describe('test-set ≥2 gate (FE-2 #2)', () => {
    it('disables the toggle + shows the hint when canAssembleTestSet is false', async () => {
      const { el } = await setup({ canAssembleTestSet: false });
      const toggle = el.querySelector<HTMLInputElement>(
        '[data-testid="unified-review-test-set-toggle"]',
      );
      expect(toggle?.disabled).toBe(true);
      expect(
        el.querySelector('[data-testid="unified-review-test-set-needs-two"]'),
      ).toBeTruthy();
    });

    it('enables the toggle + hides the hint when canAssembleTestSet is true', async () => {
      const { el } = await setup({ canAssembleTestSet: true });
      const toggle = el.querySelector<HTMLInputElement>(
        '[data-testid="unified-review-test-set-toggle"]',
      );
      expect(toggle?.disabled).toBe(false);
      expect(
        el.querySelector('[data-testid="unified-review-test-set-needs-two"]'),
      ).toBeNull();
    });

    it('keeps the toggle interactive when already enabled with <2 (escape hatch)', async () => {
      const { el } = await setup({
        canAssembleTestSet: false,
        testSet: { enabled: true, title: 'Q' },
      });
      const toggle = el.querySelector<HTMLInputElement>(
        '[data-testid="unified-review-test-set-toggle"]',
      );
      // An already-ON toggle stays interactive so the author can switch it OFF.
      expect(toggle?.disabled).toBe(false);
      // The hint still explains why accept is blocked.
      expect(
        el.querySelector('[data-testid="unified-review-test-set-needs-two"]'),
      ).toBeTruthy();
    });
  });

  // ── U5 Group C — review-phase display parity (CHO-1826) ────────────
  describe('U5 Group C review display', () => {
    // GAP #10 — select-all / deselect-all review bar
    it('renders the review bar with total + selected counts and emits toggleAll', async () => {
      const { el, component } = await setup({
        items: [aiItem('d-1', 'Q'), aiItem('d-2', 'Q2')],
      });
      const bar = el.querySelector('[data-testid="unified-review-bar"]');
      expect(bar).toBeTruthy();
      expect(bar?.textContent).toContain('2');
      let toggled = false;
      component.toggleAll.subscribe(() => (toggled = true));
      el.querySelector<HTMLButtonElement>(
        '[data-testid="unified-review-select-all"]',
      )!.click();
      expect(toggled).toBe(true);
    });

    it('derives selectedCount + allSelected from items', async () => {
      const { component } = await setup({
        items: [aiItem('d-1', 'Q'), { ...aiItem('d-2', 'Q2'), selected: false }],
      });
      expect(component.selectedCount()).toBe(1);
      expect(component.allSelected()).toBe(false);
    });

    // GAP #9 — citations collapse/expand + verification badges
    it('collapses citations by default and expands with a verification chip', async () => {
      const { el, component, fixture } = await setup({
        items: [
          aiItem('d-1', 'Q', {
            citations: [
              { source_file: 'src/a.pdf', page: 2, excerpt: 'grounded', verified: true },
            ],
          }),
        ],
      });
      // The toggle renders; the list is collapsed (absent) until expanded.
      expect(
        el.querySelector('[data-testid="unified-review-citations-toggle-d-1"]'),
      ).toBeTruthy();
      expect(el.querySelector('[data-testid="unified-review-citations-d-1"]')).toBeNull();

      component.toggleCitations('d-1');
      fixture.detectChanges();

      const list = el.querySelector('[data-testid="unified-review-citations-d-1"]');
      expect(list).toBeTruthy();
      expect(list?.textContent).toContain('citation_verified');
    });

    it('maps citationState verified/unverified/ai-reported', async () => {
      const { component } = await setup();
      const v: QuestionCitation = { source_file: 'a', excerpt: 'x', verified: true };
      const u: QuestionCitation = { source_file: 'a', excerpt: 'x', verified: false };
      const r: QuestionCitation = { source_file: 'a', excerpt: 'x' };
      expect(component.citationState(v)).toBe('verified');
      expect(component.citationState(u)).toBe('unverified');
      expect(component.citationState(r)).toBe('ai-reported');
    });

    it('hides the citations toggle when a candidate has no citations', async () => {
      const { el } = await setup({ items: [aiItem('d-1', 'Q')] });
      expect(
        el.querySelector('[data-testid="unified-review-citations-toggle-d-1"]'),
      ).toBeNull();
    });

    // GAP #7 — per-candidate quality warning
    it('renders the quality warning when quality_warning is set', async () => {
      const { el } = await setup({
        items: [aiItem('d-1', 'Q', { quality_warning: true })],
      });
      expect(
        el.querySelector('[data-testid="unified-review-quality-warning-d-1"]'),
      ).toBeTruthy();
    });

    it('renders the quality warning (with the note) when critic_notes is set', async () => {
      const { el } = await setup({
        items: [aiItem('d-1', 'Q', { critic_notes: 'shaky distractor' })],
      });
      const warn = el.querySelector(
        '[data-testid="unified-review-quality-warning-d-1"]',
      );
      expect(warn).toBeTruthy();
      expect(warn?.textContent).toContain('shaky distractor');
    });

    it('hasQualityWarning is false for a clean candidate', async () => {
      const { component } = await setup();
      const clean: QuestionDraftCandidate = { draft_id: 'x', type: 'mcq', prompt: '' };
      expect(component.hasQualityWarning(clean)).toBe(false);
    });

    // GAP #8 — OE rubric preview (read-only)
    it('renders the OE rubric criteria for an OE candidate', async () => {
      const { el } = await setup({
        items: [
          aiItem('d-1', 'Q', {
            type: 'oe',
            oe_payload: {
              model_answer: 'A',
              rubric: [
                { criterion_id: 'c1', title: 'Clarity', weight: 0.5 },
                { criterion_id: 'c2', title: 'Evidence', weight: 0.5 },
              ],
            },
          }),
        ],
      });
      const rubric = el.querySelector('[data-testid="unified-review-oe-rubric-d-1"]');
      expect(rubric).toBeTruthy();
      expect(rubric?.textContent).toContain('Clarity');
      expect(rubric?.textContent).toContain('Evidence');
    });

    // GAP #11 — drag handle visibility (CDK reorder, selected rows only)
    it('shows a drag handle on selected rows only', async () => {
      const { el } = await setup({
        items: [aiItem('d-1', 'Q'), { ...aiItem('d-2', 'Q2'), selected: false }],
      });
      expect(el.querySelector('[data-testid="unified-review-drag-d-1"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="unified-review-drag-d-2"]')).toBeNull();
    });
  });

  // ── U5 Group D — test-set points + description (CHO-1826) ──────────
  describe('U5 Group D test-set polish', () => {
    // GAP #12 — points-per-question (test-set + selected AI rows only)
    it('renders a points input for selected AI rows when the test-set is on', async () => {
      const { el } = await setup({
        items: [aiItem('d-1', 'Q')],
        testSet: { enabled: true, title: 'Q1', pointsByKey: { 'd-1': 5 } },
      });
      const input = el.querySelector<HTMLInputElement>(
        '[data-testid="unified-review-points-d-1"]',
      );
      expect(input).toBeTruthy();
      expect(input!.value).toBe('5');
    });

    it('hides points when the test-set is disabled', async () => {
      const { el } = await setup({
        items: [aiItem('d-1', 'Q')],
        testSet: { enabled: false, title: '' },
      });
      expect(el.querySelector('[data-testid="unified-review-points-d-1"]')).toBeNull();
    });

    it('hides points for manual rows (no draft_id ⇒ never test-set scoped)', async () => {
      const { el } = await setup({
        items: [manualItem('m-1', 'Manual Q')],
        testSet: { enabled: true, title: 'Q1' },
      });
      expect(el.querySelector('[data-testid="unified-review-points-m-1"]')).toBeNull();
    });

    it('emits pointsChange on a points input change', async () => {
      const { el, component } = await setup({
        items: [aiItem('d-1', 'Q')],
        testSet: { enabled: true, title: 'Q1' },
      });
      let evt: { key: string; points: number } | null = null;
      component.pointsChange.subscribe((e) => (evt = e));
      const input = el.querySelector<HTMLInputElement>(
        '[data-testid="unified-review-points-d-1"]',
      );
      input!.value = '12';
      input!.dispatchEvent(new Event('change'));
      expect(evt).toEqual({ key: 'd-1', points: 12 });
    });

    it('pointsFor returns the mapped value or the default of 1', async () => {
      const { component } = await setup({
        testSet: { enabled: true, title: '', pointsByKey: { 'd-9': 8 } },
      });
      expect(component.pointsFor('d-9')).toBe(8);
      expect(component.pointsFor('missing')).toBe(1);
    });

    // GAP #13 — test-set description textarea
    it('renders the description textarea when enabled and emits setTestSetDescription', async () => {
      const { el, component } = await setup({
        testSet: { enabled: true, title: 'Q1', description: 'Existing copy' },
      });
      const ta = el.querySelector<HTMLTextAreaElement>(
        '[data-testid="unified-review-test-set-description"]',
      );
      expect(ta).toBeTruthy();
      expect(ta!.value).toBe('Existing copy');
      let desc: string | null = null;
      component.setTestSetDescription.subscribe((d) => (desc = d));
      ta!.value = 'Updated copy';
      ta!.dispatchEvent(new Event('input'));
      expect(desc).toBe('Updated copy');
    });

    it('hides the description textarea when the test-set is disabled', async () => {
      const { el } = await setup({ testSet: { enabled: false, title: '' } });
      expect(
        el.querySelector('[data-testid="unified-review-test-set-description"]'),
      ).toBeNull();
    });
  });

  // ── U5 review-polish (post-review fixes, CHO-1826) ─────────────────
  describe('U5 review polish', () => {
    it('onPointsInput ignores blank / whitespace input (keeps the prior value)', async () => {
      const { component } = await setup();
      let count = 0;
      component.pointsChange.subscribe(() => (count += 1));
      component.onPointsInput('d-1', '');
      component.onPointsInput('d-1', '   ');
      expect(count).toBe(0);
      component.onPointsInput('d-1', '42');
      expect(count).toBe(1);
    });

    it('onHandleKeydown emits reorder up/down for arrow keys and ignores others', async () => {
      const { component } = await setup();
      const events: { from: number; to: number }[] = [];
      component.reorder.subscribe((e) => events.push(e));
      component.onHandleKeydown(
        new KeyboardEvent('keydown', { key: 'ArrowUp' }),
        2,
      );
      component.onHandleKeydown(
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
        0,
      );
      component.onHandleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }), 1);
      expect(events).toEqual([
        { from: 2, to: 1 },
        { from: 0, to: 1 },
      ]);
    });
  });

  // ── manual-only mode (CHO-1826 review B — standalone "By hand" surface) ──
  describe('manualOnly mode', () => {
    it('hides the AI review bar, test-set section, and mana chip', async () => {
      const { el } = await setup({
        items: [manualItem('m-1', 'Q1'), manualItem('m-2', 'Q2')],
        manualOnly: true,
      });
      expect(el.querySelector('[data-testid="unified-review-bar"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="unified-review-test-set"]'),
      ).toBeNull();
      // Hand-authoring never consumes mana — the AI-pricing chip is hidden.
      expect(
        el.querySelector('[data-testid="unified-review-mana-chip"]'),
      ).toBeNull();
    });

    it('keeps the AI review bar, test-set section, and mana chip in the default (AI) mode', async () => {
      const { el } = await setup({
        items: [manualItem('m-1', 'Q1'), manualItem('m-2', 'Q2')],
      });
      expect(el.querySelector('[data-testid="unified-review-bar"]')).toBeTruthy();
      expect(
        el.querySelector('[data-testid="unified-review-test-set"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="unified-review-mana-chip"]'),
      ).toBeTruthy();
    });

    it('still renders the add-row buttons + accept CTA in manual-only mode', async () => {
      const { el } = await setup({ items: [], manualOnly: true });
      expect(el.querySelector('[data-testid="unified-review-add-mcq"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="unified-review-add-oe"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="unified-review-accept"]')).toBeTruthy();
    });
  });
});
