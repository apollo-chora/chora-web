import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  RUN_POLL_INTERVAL_MS,
  RUN_POLL_MAX_ATTEMPTS,
  RoutinesTabComponent,
} from './routines-tab.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import { environment } from '../../../../../../environments/environment';
import { RITUAL_SINKS } from '../../../../../core/familiar/familiar-ritual.model';
import type {
  LoadoutGrant,
  SkillParamsSchema,
} from '../../../../../core/familiar/familiar-growth.model';
import type { Ritual, RitualRun } from '../../../../../core/familiar/familiar-ritual.model';

const FID = '00000000-0000-7000-8000-00000000e1a0';
const base = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}`;

function grant(over: Partial<LoadoutGrant> = {}): LoadoutGrant {
  return {
    skillKey: 'weakness_sight',
    skillKind: 'active',
    slotCost: 1,
    equipped: true,
    unlockedVia: 'species_path',
    unlockedAtStage: 4,
    catalogueActive: true,
    ...over,
  };
}

function loadoutView(grants: LoadoutGrant[]): Record<string, unknown> {
  return {
    familiarId: FID,
    skillGrants: grants.map((g) => g.skillKey),
    equippedSkills: grants.filter((g) => g.equipped).map((g) => g.skillKey),
    grants,
    skillSlotsUnlocked: 7,
    slotsUsed: grants.filter((g) => g.equipped).length,
    evolutionTier: 'adept',
    growthStage: 4,
  };
}

function ritual(over: Partial<Ritual> = {}): Ritual {
  return {
    ritualId: 'r1',
    familiarId: FID,
    name: 'Warm-up',
    trigger: 'manual',
    sink: 'chat',
    enabled: false,
    publishedPriceUnits: 20,
    currentRevision: 0,
    steps: [],
    createdAt: '2026-07-09T00:00:00Z',
    updatedAt: '2026-07-09T00:00:00Z',
    ...over,
  };
}

/** A run record as the BFF projects it (`ritualRunDTO`). */
function runRecord(over: Partial<RitualRun> = {}): RitualRun {
  return {
    runId: 'run-1',
    ritualId: 'r1',
    revisionNo: 1,
    status: 'running',
    manaCharged: 20,
    startedAt: '2026-07-09T01:00:00Z',
    ...over,
  };
}

/** Create the component, set the id, and flush the two init GETs (rituals + loadout). */
function setup(opts: { rituals?: Ritual[]; grants?: LoadoutGrant[];
    wiredSinks?: readonly string[];
  } = {}) {
  TestBed.configureTestingModule({
    imports: [RoutinesTabComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
  });
  const fixture = TestBed.createComponent(RoutinesTabComponent);
  fixture.componentRef.setInput('familiarId', FID);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  // Mirrors the live server, which builds the sink router with nil writers
  // (B3b): chat is registered, the other five are not. Tests that want a
  // different deployment flush their own list.
  httpMock
    .expectOne(`${base}/rituals`)
    .flush(
      // `wiredSinks: undefined` in opts means OMIT the key, which is the
      // absent-field case; a passed [] means the server answered "none".
      'wiredSinks' in opts
        ? { rituals: opts.rituals ?? [], ...(opts.wiredSinks ? { wiredSinks: opts.wiredSinks } : {}) }
        : { rituals: opts.rituals ?? [], wiredSinks: ['chat'] },
    );
  httpMock.expectOne(`${base}/skills`).flush(loadoutView(opts.grants ?? []));
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, httpMock, el: fixture.nativeElement as HTMLElement };
}

describe('RoutinesTabComponent', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('lists rituals loaded from the BFF', () => {
    const s = setup({ rituals: [ritual({ name: 'Morning' })] });
    httpMock = s.httpMock;
    expect(s.cmp.rituals().length).toBe(1);
    expect(s.el.textContent).toContain('Morning');
  });

  it('derives the palette from equipped-active-released grants only', () => {
    const s = setup({
      grants: [
        grant({ skillKey: 'weakness_sight' }),
        grant({ skillKey: 'not_equipped', equipped: false }),
        grant({ skillKey: 'dormant', catalogueActive: false }),
        grant({ skillKey: 'long_weaving', skillKind: 'craft' }),
      ],
    });
    httpMock = s.httpMock;
    const keys = s.cmp.palette().map((g) => g.skillKey);
    expect(keys).toEqual(['weakness_sight']);
  });

  it('lifts the step cap to 8 when long_weaving is owned', () => {
    const s = setup({ grants: [grant({ skillKey: 'long_weaving', skillKind: 'craft' })] });
    httpMock = s.httpMock;
    expect(s.cmp.stepCap()).toBe(8);
  });

  it('addStepFromPalette appends up to the cap, then blocks', () => {
    const s = setup();
    httpMock = s.httpMock;
    for (let i = 0; i < 5; i++) s.cmp.addStepFromPalette(grant({ skillKey: `k${i}` }));
    expect(s.cmp.draftSteps().length).toBe(5);
    expect(s.cmp.atStepCap()).toBe(true);
    s.cmp.addStepFromPalette(grant({ skillKey: 'overflow' }));
    expect(s.cmp.draftSteps().length).toBe(5); // capped — no 6th
  });

  it('removeStep drops the step and clears its selection', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.addStepFromPalette(grant({ skillKey: 'a' }));
    s.cmp.addStepFromPalette(grant({ skillKey: 'b' }));
    s.cmp.selectStep(1);
    s.cmp.removeStep(1);
    expect(s.cmp.draftSteps().map((x) => x.skillKey)).toEqual(['a']);
    expect(s.cmp.selectedStepIndex()).toBeNull();
  });

  it('reorders steps on drop', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.addStepFromPalette(grant({ skillKey: 'a' }));
    s.cmp.addStepFromPalette(grant({ skillKey: 'b' }));
    s.cmp.onStepDrop({ previousIndex: 0, currentIndex: 1 } as never);
    expect(s.cmp.draftSteps().map((x) => x.skillKey)).toEqual(['b', 'a']);
  });

  it('canPublish requires 1..cap steps', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.selected.set(ritual());
    expect(s.cmp.canPublish()).toBe(false);
    s.cmp.addStepFromPalette(grant());
    expect(s.cmp.canPublish()).toBe(true);
  });

  it('submitCreate POSTs the draft and opens the composer', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.startCreate();
    s.cmp.newName.set('Evening review');
    s.cmp.submitCreate();
    const create = httpMock.expectOne(`${base}/rituals`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      name: 'Evening review',
      trigger: 'manual',
      sink: 'chat',
    });
    create.flush(ritual({ name: 'Evening review' }));
    // opening a ritual reloads the list + loads its runs
    httpMock.expectOne(`${base}/rituals`).flush({ rituals: [] });
    httpMock.expectOne(`${base}/rituals/r1/runs`).flush({ runs: [] });
    expect(s.cmp.mode()).toBe('compose');
    expect(s.cmp.selected()?.name).toBe('Evening review');
  });

  it('publish POSTs the current steps to /publish', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.selected.set(ritual());
    s.cmp.addStepFromPalette(grant({ skillKey: 'weakness_sight' }));
    s.cmp.publish();
    const pub = httpMock.expectOne(`${base}/rituals/r1/publish`);
    expect(pub.request.method).toBe('POST');
    expect(pub.request.body).toEqual({ steps: [{ skillKey: 'weakness_sight' }] });
    pub.flush(ritual({ currentRevision: 1 }));
    httpMock.expectOne(`${base}/rituals`).flush({ rituals: [] }); // reload
    expect(s.cmp.selected()?.currentRevision).toBe(1);
  });

  it('run is gated on a published revision and POSTs to /run', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.selected.set(ritual({ currentRevision: 0 }));
    expect(s.cmp.canRun()).toBe(false);
    s.cmp.selected.set(ritual({ currentRevision: 1 }));
    expect(s.cmp.canRun()).toBe(true);
    s.cmp.run();
    const run = httpMock.expectOne(`${base}/rituals/r1/run`);
    expect(run.request.method).toBe('POST');
    run.flush({
      runId: 'run-1',
      ritualId: 'r1',
      revisionNo: 1,
      status: 'completed',
      manaCharged: 20,
      startedAt: '2026-07-09T01:00:00Z',
    });
    httpMock.expectOne(`${base}/rituals/r1/runs`).flush({ runs: [] });
    expect(s.cmp.lastRun()?.status).toBe('completed');
  });

  it('maps a RITUALS_LOCKED create failure to the locked toast (fail-loud)', () => {
    const s = setup();
    httpMock = s.httpMock;
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');
    s.cmp.startCreate();
    s.cmp.newName.set('Nope');
    s.cmp.submitCreate();
    httpMock
      .expectOne(`${base}/rituals`)
      .flush({ code: 'RITUALS_LOCKED' }, { status: 403, statusText: 'Forbidden' });
    expect(s.cmp.saving()).toBe(false);
    expect(spy).toHaveBeenCalledWith('familiar_grimoire.error.locked', 'error');
  });

  it('maps a 402 run failure to the mana toast (fail-loud)', () => {
    const s = setup();
    httpMock = s.httpMock;
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');
    s.cmp.selected.set(ritual({ currentRevision: 1 }));
    s.cmp.run();
    httpMock
      .expectOne(`${base}/rituals/r1/run`)
      .flush({ error: { code: 'INSUFFICIENT_MANA' } }, { status: 402, statusText: 'Payment Required' });
    expect(s.cmp.running()).toBe(false);
    expect(spy).toHaveBeenCalledWith('familiar_grimoire.error.mana', 'error');
  });

  // ── CHO-2145: async 202 + poll ─────────────────────────────────────────────
  // The run POST now acks 202 with a 'running' record and the steps finish
  // server-side (~30s — longer than the gateway's 5s route budget, which is why
  // the old synchronous run surfaced a false "Something went wrong"). The tab
  // must render a calm running state and poll Run history until the terminal.

  it('renders a non-error running state on the 202 ack — no error toast', () => {
    const s = setup();
    httpMock = s.httpMock;
    const spy = vi.spyOn(TestBed.inject(ToastService), 'show');
    s.cmp.selected.set(ritual({ currentRevision: 1 }));

    s.cmp.run();
    httpMock.expectOne(`${base}/rituals/r1/run`).flush(runRecord({ status: 'running' }), {
      status: 202,
      statusText: 'Accepted',
    });

    expect(s.cmp.running()).toBe(true);
    expect(s.cmp.lastRun()?.status).toBe('running');
    expect(spy).not.toHaveBeenCalled(); // a healthy run NEVER toasts
    s.cmp.stopPoll(); // release the in-flight poll timer
  });

  it('polls run history after the 202 and settles on the terminal outcome', () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      httpMock = s.httpMock;
      const spy = vi.spyOn(TestBed.inject(ToastService), 'show');
      s.cmp.selected.set(ritual({ currentRevision: 1 }));

      s.cmp.run();
      httpMock
        .expectOne(`${base}/rituals/r1/run`)
        .flush(runRecord({ status: 'running' }), { status: 202, statusText: 'Accepted' });

      // Poll 1 — still running server-side: hold the running state, keep polling.
      vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS);
      httpMock
        .expectOne(`${base}/rituals/r1/runs`)
        .flush({ runs: [runRecord({ status: 'running' })] });
      expect(s.cmp.running()).toBe(true);

      // Poll 2 — the run has landed: settle on the terminal, stop polling.
      vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS);
      httpMock.expectOne(`${base}/rituals/r1/runs`).flush({
        runs: [runRecord({ status: 'completed', manaCharged: 20, completedAt: '2026-07-09T01:00:31Z' })],
      });

      expect(s.cmp.running()).toBe(false);
      expect(s.cmp.lastRun()?.status).toBe('completed');
      expect(s.cmp.runs().length).toBe(1);
      expect(spy).not.toHaveBeenCalled();

      // Terminal reached ⇒ the poll must be OFF (no further requests).
      vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS * 3);
      httpMock.expectNone(`${base}/rituals/r1/runs`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders skipped_budget from the 200 ack directly — terminal, no poll', () => {
    const s = setup();
    httpMock = s.httpMock;
    const spy = vi.spyOn(TestBed.inject(ToastService), 'show');
    s.cmp.selected.set(ritual({ currentRevision: 1 }));

    s.cmp.run();
    // Insufficient mana is terminal AT ACK: a designed pause, a 200, never a poll.
    httpMock
      .expectOne(`${base}/rituals/r1/run`)
      .flush(runRecord({ status: 'skipped_budget', manaCharged: 0 }));
    httpMock.expectOne(`${base}/rituals/r1/runs`).flush({ runs: [] }); // history refresh

    expect(s.cmp.running()).toBe(false);
    expect(s.cmp.lastRun()?.status).toBe('skipped_budget');
    expect(spy).not.toHaveBeenCalled(); // a designed pause is not an error
  });

  it('gives up polling after the cap WITHOUT an error toast (the run lands in history)', () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      httpMock = s.httpMock;
      const spy = vi.spyOn(TestBed.inject(ToastService), 'show');
      s.cmp.selected.set(ritual({ currentRevision: 1 }));

      s.cmp.run();
      httpMock
        .expectOne(`${base}/rituals/r1/run`)
        .flush(runRecord({ status: 'running' }), { status: 202, statusText: 'Accepted' });

      for (let i = 0; i < RUN_POLL_MAX_ATTEMPTS; i++) {
        vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS);
        httpMock
          .expectOne(`${base}/rituals/r1/runs`)
          .flush({ runs: [runRecord({ status: 'running' })] });
      }

      expect(s.cmp.running()).toBe(false);
      expect(s.cmp.runSlow()).toBe(true); // an honest "still running" note…
      expect(spy).not.toHaveBeenCalled(); // …never a "went wrong" toast
      vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS * 2);
      httpMock.expectNone(`${base}/rituals/r1/runs`); // capped — stopped polling
    } finally {
      vi.useRealTimers();
    }
  });

  it('opening another ritual cancels an in-flight poll', () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      httpMock = s.httpMock;
      s.cmp.selected.set(ritual({ currentRevision: 1 }));
      s.cmp.run();
      httpMock
        .expectOne(`${base}/rituals/r1/run`)
        .flush(runRecord({ status: 'running' }), { status: 202, statusText: 'Accepted' });

      s.cmp.openRitual(ritual({ ritualId: 'r2', currentRevision: 1 }));
      httpMock.expectOne(`${base}/rituals/r2/runs`).flush({ runs: [] }); // openRitual's own load

      vi.advanceTimersByTime(RUN_POLL_INTERVAL_MS * 2);
      httpMock.expectNone(`${base}/rituals/r1/runs`); // the r1 poll is dead
      expect(s.cmp.running()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelCreate and backToList return to the list', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.cmp.startCreate();
    expect(s.cmp.mode()).toBe('create');
    s.cmp.cancelCreate();
    expect(s.cmp.mode()).toBe('list');
    s.cmp.selected.set(ritual());
    s.cmp.mode.set('compose');
    s.cmp.backToList();
    expect(s.cmp.mode()).toBe('list');
    expect(s.cmp.selected()).toBeNull();
  });

  it('surfaces a fail-loud error state when the list load fails', () => {
    TestBed.configureTestingModule({
      imports: [RoutinesTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
    });
    const fixture = TestBed.createComponent(RoutinesTabComponent);
    fixture.componentRef.setInput('familiarId', FID);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne(`${base}/rituals`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    httpMock.expectOne(`${base}/skills`).flush(loadoutView([]));
    fixture.detectChanges();
    expect(fixture.componentInstance.errored()).toBe(true);
  });
});

// ── CHO-2362: schema-driven per-step Skill params ────────────────────────────
// The loadout grants now carry `paramsSchema` (BE `params_schema`, camelised by
// the FamiliarBridge). The inspector renders real controls from it, learner
// values ride the publish payload as STRINGS, and `required` is a nudge only
// (the server deliberately never blocks publish on it).

const conceptGraphUrl = `${environment.bffBaseUrl}/api/v1/me/concept-graph`;
const growthEdgesUrl = `${environment.bffBaseUrl}/api/v1/me/growth-edges`;

const WINDOW_ENUM_SCHEMA: SkillParamsSchema = {
  window: { type: 'enum', values: ['week', 'month', 'all'], default: 'all' },
};
const COUNT_INT_SCHEMA: SkillParamsSchema = {
  count: { type: 'int', min: 3, max: 5, default: '3' },
};
const CLAIM_TEXT_SCHEMA: SkillParamsSchema = {
  claim: { type: 'text', maxLen: 200, required: true },
};
const FOCUS_CONCEPT_SCHEMA: SkillParamsSchema = {
  focus: { type: 'concept_ref' },
};
const TARGET_REQUIRED_SCHEMA: SkillParamsSchema = {
  target: { type: 'concept_ref', required: true },
  style: { type: 'enum', values: ['analogy', 'story', 'eli5'], default: 'analogy' },
};
const EDGE_REF_SCHEMA: SkillParamsSchema = {
  edge: { type: 'growth_edge_ref' },
};

/** A minimal concept-graph wire body (only id + title are consumed). */
function conceptGraph(
  concepts: readonly { conceptId: string; title: string }[],
): Record<string, unknown> {
  return {
    concepts: concepts.map((c) => ({ ...c, atomRefs: [] })),
    edges: [],
  };
}

describe('RoutinesTabComponent - per-step Skill params (CHO-2362)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  /** Enter compose mode on a fresh draft and add one step per given grant. */
  function compose(s: ReturnType<typeof setup>, ...grants: LoadoutGrant[]): void {
    s.cmp.selected.set(ritual());
    s.cmp.mode.set('compose');
    for (const g of grants) s.cmp.addStepFromPalette(g);
    s.fixture.detectChanges();
  }

  it('renders an enum select with the default preselected until the learner picks', () => {
    const g = grant({ skillKey: 'progress_mirror', paramsSchema: WINDOW_ENUM_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    const label = s.el.querySelector('label[for="param-window"]');
    expect(label).toBeTruthy();
    const select = s.el.querySelector('#param-window') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select!.querySelectorAll('option').length).toBe(3);
    // No explicit value on the step: the control sits on the schema default.
    expect(s.cmp.paramControlValue('window')).toBe('all');

    select!.value = 'week';
    select!.dispatchEvent(new Event('change'));
    expect(s.cmp.draftSteps()[0].params).toEqual({ window: 'week' });
  });

  it('renders a bounded number input for an int param and stores the value as a string', () => {
    const g = grant({ skillKey: 'fog_scout', paramsSchema: COUNT_INT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    const input = s.el.querySelector('#param-count') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input!.type).toBe('number');
    expect(input!.getAttribute('min')).toBe('3');
    expect(input!.getAttribute('max')).toBe('5');
    expect(s.cmp.paramControlValue('count')).toBe('3'); // schema default

    input!.value = '4';
    input!.dispatchEvent(new Event('input'));
    expect(s.cmp.draftSteps()[0].params).toEqual({ count: '4' });
  });

  it('renders a bounded text control with a live character counter', () => {
    const g = grant({ skillKey: 'fact_check', paramsSchema: CLAIM_TEXT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    const area = s.el.querySelector('#param-claim') as HTMLTextAreaElement | null;
    expect(area).toBeTruthy();
    expect(area!.getAttribute('maxlength')).toBe('200');
    expect(s.el.querySelector('.params__counter')).toBeTruthy();
    expect(s.cmp.paramRuneCount('claim')).toBe(0);

    area!.value = 'Bumblebees can fly';
    area!.dispatchEvent(new Event('input'));
    expect(s.cmp.paramRuneCount('claim')).toBe(18);
    expect(s.cmp.draftSteps()[0].params).toEqual({ claim: 'Bumblebees can fly' });
  });

  it('shows the honest no-editable-parameters state for a schema-less Skill', () => {
    const g = grant({ skillKey: 'recap_scribe' }); // no paramsSchema on the row
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    expect(s.el.textContent).toContain('familiar_grimoire.params.none');
    expect(s.el.querySelector('.params__field')).toBeNull();
  });

  it('learner-set params ride the publish payload as strings; untouched steps stay bare', () => {
    const mirror = grant({ skillKey: 'progress_mirror', paramsSchema: WINDOW_ENUM_SCHEMA });
    const scout = grant({ skillKey: 'fog_scout', paramsSchema: COUNT_INT_SCHEMA });
    const s = setup({ grants: [mirror, scout] });
    httpMock = s.httpMock;
    compose(s, mirror, scout);

    s.cmp.selectStep(0);
    s.cmp.setStepParam('window', 'week');
    s.cmp.publish();

    const pub = httpMock.expectOne(`${base}/rituals/r1/publish`);
    expect(pub.request.body).toEqual({
      steps: [
        { skillKey: 'progress_mirror', params: { window: 'week' } },
        { skillKey: 'fog_scout' },
      ],
    });
    pub.flush(ritual({ currentRevision: 1 }));
    httpMock.expectOne(`${base}/rituals`).flush({ rituals: [] }); // reload
  });

  it('clearing a param removes it from the step (absent means the Skill default)', () => {
    const g = grant({ skillKey: 'progress_mirror', paramsSchema: WINDOW_ENUM_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    s.cmp.setStepParam('window', 'week');
    expect(s.cmp.draftSteps()[0].params).toEqual({ window: 'week' });
    s.cmp.setStepParam('window', '');
    expect(s.cmp.draftSteps()[0]).toEqual({ skillKey: 'progress_mirror' });
  });

  it('lazily loads the concept graph the first time a concept_ref param is shown', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    httpMock.expectNone(conceptGraphUrl); // nothing loaded before a ref param shows

    compose(s, g);
    httpMock.expectOne(conceptGraphUrl).flush(
      conceptGraph([
        { conceptId: 'c-1', title: 'Fractions' },
        { conceptId: 'c-2', title: 'Decimals' },
      ]),
    );
    s.fixture.detectChanges();

    const select = s.el.querySelector('#param-focus') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    const texts = Array.from(select!.querySelectorAll('option')).map((o) => o.textContent?.trim());
    expect(texts).toContain('Fractions');
    expect(texts).toContain('Decimals');
    // Optional ref: an explicit Auto (unset) option is offered.
    expect(s.el.textContent).toContain('familiar_grimoire.params.concept_auto');

    select!.value = 'c-1';
    select!.dispatchEvent(new Event('change'));
    expect(s.cmp.draftSteps()[0].params).toEqual({ focus: 'c-1' });

    // Loaded once: showing another concept_ref param never refetches.
    s.cmp.addStepFromPalette(g);
    s.fixture.detectChanges();
    httpMock.expectNone(conceptGraphUrl);
  });

  it('concept picker: honest empty state disables the control', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    httpMock.expectOne(conceptGraphUrl).flush(conceptGraph([]));
    s.fixture.detectChanges();

    expect(s.el.textContent).toContain('familiar_grimoire.params.concept_empty');
    const select = s.el.querySelector('#param-focus') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select!.disabled).toBe(true);
  });

  it('concept picker: load failure shows an honest error with a working retry', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    httpMock
      .expectOne(conceptGraphUrl)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    s.fixture.detectChanges();

    expect(s.el.textContent).toContain('familiar_grimoire.params.concept_error');
    const retry = s.el.querySelector('.params__ref-retry') as HTMLButtonElement | null;
    expect(retry).toBeTruthy();

    retry!.click();
    s.fixture.detectChanges();
    httpMock
      .expectOne(conceptGraphUrl)
      .flush(conceptGraph([{ conceptId: 'c-9', title: 'Photosynthesis' }]));
    s.fixture.detectChanges();
    expect(s.el.textContent).toContain('Photosynthesis');
  });

  it('optional concept_ref: picking Auto clears the param back to absent', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    httpMock
      .expectOne(conceptGraphUrl)
      .flush(conceptGraph([{ conceptId: 'c-1', title: 'Fractions' }]));
    s.fixture.detectChanges();

    s.cmp.setStepParam('focus', 'c-1');
    expect(s.cmp.draftSteps()[0].params).toEqual({ focus: 'c-1' });

    const select = s.el.querySelector('#param-focus') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(s.cmp.draftSteps()[0]).toEqual({ skillKey: 'map_sight' });
  });

  it('growth_edge_ref feeds from the growth-edges list with an Auto top-edge option', () => {
    const g = grant({ skillKey: 'weakness_sight', paramsSchema: EDGE_REF_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    httpMock
      .expectOne(growthEdgesUrl)
      .flush({ items: [{ id: 'ge-1', concept_label: 'Algebra' }] });
    s.fixture.detectChanges();

    expect(s.el.textContent).toContain('familiar_grimoire.params.edge_auto');
    const select = s.el.querySelector('#param-edge') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    const texts = Array.from(select!.querySelectorAll('option')).map((o) => o.textContent?.trim());
    expect(texts).toContain('Algebra');

    select!.value = 'ge-1';
    select!.dispatchEvent(new Event('change'));
    expect(s.cmp.draftSteps()[0].params).toEqual({ edge: 'ge-1' });
  });

  it('filters concept options by title and keeps the picked one visible', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    httpMock.expectOne(conceptGraphUrl).flush(
      conceptGraph([
        { conceptId: 'c-1', title: 'Fractions' },
        { conceptId: 'c-2', title: 'Decimals' },
        { conceptId: 'c-3', title: 'Photosynthesis' },
      ]),
    );
    s.fixture.detectChanges();

    s.cmp.setStepParam('focus', 'c-1'); // pick Fractions, then filter it away
    s.cmp.setRefFilter('concept_ref', 'photo');
    const visible = s.cmp.refOptionsFor('concept_ref', 'c-1');
    expect(visible.map((o) => o.title)).toEqual(['Photosynthesis', 'Fractions']);
    expect(s.cmp.refFilterValue('concept_ref')).toBe('photo');
  });

  it('a cleared number input unsets the int param', () => {
    const g = grant({ skillKey: 'fog_scout', paramsSchema: COUNT_INT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    s.cmp.setStepParamFromNumber('count', 4);
    expect(s.cmp.draftSteps()[0].params).toEqual({ count: '4' });
    s.cmp.setStepParamFromNumber('count', null); // learner clears the box
    expect(s.cmp.draftSteps()[0]).toEqual({ skillKey: 'fog_scout' });
  });

  it('summaries truncate long text params instead of flooding the chip', () => {
    const g = grant({ skillKey: 'fact_check', paramsSchema: CLAIM_TEXT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    s.cmp.setStepParam('claim', 'The Great Wall of China is visible from the Moon');
    const summary = s.cmp.stepSummaries()[0];
    expect(summary.startsWith('claim: The Great Wall of Chin')).toBe(true);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThan('claim: '.length + 30);
  });

  it('required is a nudge: the Recommended marker renders and publish is never blocked', () => {
    const g = grant({ skillKey: 'explain_anew', paramsSchema: TARGET_REQUIRED_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);
    // target is a concept_ref: the picker source loads lazily.
    httpMock.expectOne(conceptGraphUrl).flush(conceptGraph([]));
    s.fixture.detectChanges();

    expect(s.el.textContent).toContain('familiar_grimoire.params.recommended');
    expect(s.el.textContent).toContain('familiar_grimoire.params.recommended_help');
    // The required target is unset, yet publish stays available (server nudge contract).
    expect(s.cmp.canPublish()).toBe(true);

    s.cmp.publish();
    const pub = httpMock.expectOne(`${base}/rituals/r1/publish`);
    expect(pub.request.body).toEqual({ steps: [{ skillKey: 'explain_anew' }] });
    pub.flush(ritual({ currentRevision: 1 }));
    httpMock.expectOne(`${base}/rituals`).flush({ rituals: [] }); // reload
  });

  it('surfaces the 422 RITUAL_INVALID server detail through the composer error strip', () => {
    const g = grant({ skillKey: 'fog_scout', paramsSchema: COUNT_INT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    const spy = vi.spyOn(TestBed.inject(ToastService), 'show');
    compose(s, g);

    s.cmp.setStepParam('count', '9');
    s.cmp.publish();
    const detail =
      'familiar.ritual: step params invalid: param "count" of skill "fog_scout" must be between 3 and 5';
    httpMock
      .expectOne(`${base}/rituals/r1/publish`)
      .flush({ code: 'RITUAL_INVALID', message: detail }, { status: 422, statusText: 'Unprocessable' });
    s.fixture.detectChanges();

    expect(s.cmp.publishErrorDetail()).toBe(detail);
    const strip = s.el.querySelector('.composer__invalid');
    expect(strip).toBeTruthy();
    expect(strip!.getAttribute('role')).toBe('alert');
    expect(strip!.textContent).toContain(detail);
    expect(spy).toHaveBeenCalledWith('familiar_grimoire.error.invalid', 'error');
  });

  it('step chips show a compact params summary', () => {
    const g = grant({ skillKey: 'progress_mirror', paramsSchema: WINDOW_ENUM_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;
    compose(s, g);

    s.cmp.setStepParam('window', 'week');
    s.fixture.detectChanges();
    expect(s.cmp.stepSummaries()[0]).toBe('window: week');
    expect(s.el.querySelector('.step__params')?.textContent).toContain('window: week');
  });

  it('revision steps resolve a picked concept to its title in the summary', () => {
    const g = grant({ skillKey: 'map_sight', paramsSchema: FOCUS_CONCEPT_SCHEMA });
    const s = setup({ grants: [g] });
    httpMock = s.httpMock;

    s.cmp.openRitual(
      ritual({ currentRevision: 1, steps: [{ skillKey: 'map_sight', params: { focus: 'c-1' } }] }),
    );
    httpMock.expectOne(`${base}/rituals/r1/runs`).flush({ runs: [] });
    s.fixture.detectChanges();
    // The saved step carries an explicit concept ref: the title source loads.
    httpMock
      .expectOne(conceptGraphUrl)
      .flush(conceptGraph([{ conceptId: 'c-1', title: 'Fractions' }]));
    s.fixture.detectChanges();

    expect(s.cmp.stepSummaries()[0]).toBe('focus: Fractions');
    expect(s.el.querySelector('.step__params')?.textContent).toContain('Fractions');
  });

  describe('sink availability and display names (N5, N6)', () => {
    it('reports only the wired sinks as available', () => {
      const s = setup();
      httpMock = s.httpMock;
      // chat has a registered writer at boot; the other five do not, so a
      // ritual declaring one publishes and then fails EVERY run with a refund.
      expect(s.cmp.sinkWired('chat')).toBe(true);
      for (const sink of [
        'memory_note',
        'suggestion_inbox',
        'question_bank',
        'notification',
        'calendar_artifact',
      ]) {
        expect(s.cmp.sinkWired(sink)).toBe(false);
      }
    });

    it('offers every closed sink but disables the unwired ones', () => {
      const s = setup();
      httpMock = s.httpMock;
      s.cmp.startCreate();
      s.fixture.detectChanges();

      const options = Array.from(
        s.el.querySelectorAll('select[name="ritualSink"] option'),
      ) as HTMLOptionElement[];
      // Greyed, NOT hidden: the capability should read as "not yet", not absent.
      expect(options.length).toBe(6);
      const byValue = new Map(options.map((o) => [o.value, o]));
      expect(byValue.get('chat')!.disabled).toBe(false);
      expect(byValue.get('memory_note')!.disabled).toBe(true);
      expect(byValue.get('question_bank')!.disabled).toBe(true);
    });

    it('gives every greyed sink a reason', () => {
      const s = setup();
      httpMock = s.httpMock;
      s.cmp.startCreate();
      s.fixture.detectChanges();

      const disabled = Array.from(
        s.el.querySelectorAll('select[name="ritualSink"] option'),
      ).filter((o) => (o as HTMLOptionElement).disabled) as HTMLOptionElement[];
      expect(disabled.length).toBe(5);
      for (const o of disabled) {
        // A greyed control with no reason reads as a bug.
        expect(o.textContent).toContain('familiar_grimoire.sink_not_available');
      }
    });

    it('greys from the SERVER answer, not a client constant (B3b)', () => {
      // A deployment that has registered the memory_note writer must offer it,
      // with no FE change. This is the whole point of serving the set.
      const s = setup({ wiredSinks: ['chat', 'memory_note'] });
      httpMock = s.httpMock;
      expect(s.cmp.sinkWired('memory_note')).toBe(true);
      expect(s.cmp.sinkWired('question_bank')).toBe(false);
    });

    it('greys every sink when the server serves none', () => {
      // Fail closed: a server that has not answered is not one we may make
      // availability claims for, and publish would 422 all six anyway.
      const s = setup({ wiredSinks: [] });
      httpMock = s.httpMock;
      for (const sink of RITUAL_SINKS) {
        expect(s.cmp.sinkWired(sink)).toBe(false);
      }
      s.cmp.startCreate();
      s.fixture.detectChanges();
      const enabled = Array.from(
        s.el.querySelectorAll('select[name="ritualSink"] option'),
      ).filter((o) => !(o as HTMLOptionElement).disabled);
      expect(enabled.length).toBe(0);
    });

    it('reports the absent case and names it as unconfirmed', () => {
      // TestBed allows ONE setup per test, so the two halves of the ruling are
      // asserted in sibling tests against named keys rather than by standing up
      // two components and comparing.
      const s = setup({ wiredSinks: undefined });
      httpMock = s.httpMock;
      expect(s.cmp.sinksReported()).toBe(false);
      expect(s.cmp.sinkUnavailableKey()).toBe('familiar_grimoire.sink_not_reported');
      expect(s.cmp.sinkAvailabilityHintKey()).toBe(
        'familiar_grimoire.sink_availability_unknown_hint',
      );
      // Fail-closed survives the split: the ruling kept it.
      for (const sink of RITUAL_SINKS) {
        expect(s.cmp.sinkWired(sink)).toBe(false);
      }
    });

    it('reports a served-empty case and names it differently', () => {
      const s = setup({ wiredSinks: [] });
      httpMock = s.httpMock;
      expect(s.cmp.sinksReported()).toBe(true);
      // The two keys must differ: an absence distinguished by the MESSAGE, not
      // by an empty result. Collapsing them was the defect the ruling caught.
      expect(s.cmp.sinkUnavailableKey()).toBe('familiar_grimoire.sink_not_available');
      expect(s.cmp.sinkUnavailableKey()).not.toBe('familiar_grimoire.sink_not_reported');
      expect(s.cmp.sinkAvailabilityHintKey()).toBe('familiar_grimoire.sink_availability_hint');
      expect(s.cmp.sinkAvailabilityHintKey()).not.toBe(
        'familiar_grimoire.sink_availability_unknown_hint',
      );
      for (const sink of RITUAL_SINKS) {
        expect(s.cmp.sinkWired(sink)).toBe(false);
      }
    });

    it('carries the unreported reason onto every greyed option', () => {
      const s = setup({ wiredSinks: undefined });
      httpMock = s.httpMock;
      s.cmp.startCreate();
      s.fixture.detectChanges();
      const options = Array.from(
        s.el.querySelectorAll('select[name="ritualSink"] option'),
      ) as HTMLOptionElement[];
      expect(options.length).toBe(6);
      for (const o of options) {
        expect(o.disabled).toBe(true);
        expect(o.textContent).toContain('familiar_grimoire.sink_not_reported');
      }
    });

    it('renders a display-name key on palette and step cards, never the raw key', () => {
      // The composer used to print g.skillKey, so a learner dragged a card that
      // said "socratic_drill" while the loadout showed the proper name.
      const s = setup({ grants: [grant({ skillKey: 'socratic_drill' })] });
      httpMock = s.httpMock;
      expect(s.cmp.skillLabelKey('socratic_drill')).toBe(
        'familiar_skill.socratic_drill',
      );

      s.cmp.openRitual(
        ritual({ currentRevision: 1, steps: [{ skillKey: 'socratic_drill' }] }),
      );
      httpMock.expectOne(`${base}/rituals/r1/runs`).flush({ runs: [] });
      s.fixture.detectChanges();

      const stepKey = s.el.querySelector('.step__key');
      expect(stepKey).not.toBeNull();
      expect(stepKey!.textContent).toContain('familiar_skill.socratic_drill');
      expect(stepKey!.textContent!.trim()).not.toBe('socratic_drill');
    });
  });

});
