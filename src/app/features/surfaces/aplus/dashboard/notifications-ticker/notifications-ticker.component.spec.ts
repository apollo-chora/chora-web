import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { NotificationsTickerComponent } from './notifications-ticker.component';
import { GoalService } from '../goal/goal.service';
import { GrowthEdgesService, type GrowthEdge } from '../../growth-edges/growth-edges.service';
import { GrownEdgeTrackerService } from '../../../../../core/services/grown-edge-tracker.service';
import { GraduatedGoalTrackerService } from '../../../../../core/services/graduated-goal-tracker.service';
import { DailyDoseService } from '../../daily-dose/daily-dose.service';
import type { GoalDTO } from '../goal/goal.model';
import type { DailyDose } from '../../daily-dose/daily-dose.model';

/**
 * NotificationsTickerComponent spec (SP2.7) — the A+ dashboard-as-hub
 * CONDITIONAL ticker that surfaces celebrations (grew-edge 🌱 / goal-graduated
 * 🎓) + a due-review nudge. It renders NOTHING when it has zero items (host
 * collapses) and exposes a public `hasItems` computed the shell reads to gate
 * its own `@if`.
 *
 * The streak has MOVED to the unified header's today-strip (it is ambient, not
 * a transient nudge) — the ticker no longer reads DashboardService, and never
 * renders a streak item (that duplication is gone).
 *
 * i18n test contract (mirrors map-preview-card): the translate pipe emits RAW
 * keys in tests, so we assert on data-testid + the item's own text (counts /
 * data labels / raw i18n keys), never translated copy.
 */

// ── Fakes ────────────────────────────────────────────────────────────────
function makeGoalMock(goals: readonly GoalDTO[] = []) {
  return { goals: signal<readonly GoalDTO[]>(goals) };
}
type GoalMock = ReturnType<typeof makeGoalMock>;

function makeGrowthEdgesMock(items: GrowthEdge[] = []) {
  return { list: vi.fn((_params?: unknown) => of({ items })) };
}
type GrowthEdgesMock = ReturnType<typeof makeGrowthEdgesMock>;

function makeGrownTrackerMock(newly: GrowthEdge[] = []) {
  return { detectNewlyGrown: vi.fn((_edges: readonly GrowthEdge[]) => newly) };
}
type GrownTrackerMock = ReturnType<typeof makeGrownTrackerMock>;

function makeGraduatedTrackerMock(newly: { id: string; status: string }[] = []) {
  return {
    detectNewlyGraduated: vi.fn((_goals: readonly { id: string; status: string }[]) => newly),
  };
}
type GraduatedTrackerMock = ReturnType<typeof makeGraduatedTrackerMock>;

function makeDailyDoseMock(ebbinghaus: number | null = null) {
  const dose =
    ebbinghaus === null
      ? null
      : ({
          atom_breakdown: { ebbinghaus, weakness: 0, curiosity: 0, fresh: 0 },
        } as unknown as DailyDose);
  return { dose: signal<DailyDose | null>(dose) };
}
type DailyDoseMock = ReturnType<typeof makeDailyDoseMock>;

// ── Builders ─────────────────────────────────────────────────────────────
function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g1',
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Master fractions',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function grownEdge(over: Partial<GrowthEdge> = {}): GrowthEdge {
  return {
    id: 'e1',
    concept_key: 'fractions',
    concept_label: 'Fractions',
    tags: [],
    strength: 0.1,
    sources: [],
    descriptor: {
      headline: '',
      why_it_matters: '',
      sample_wrongs: [],
    } as unknown as GrowthEdge['descriptor'],
    cached_drill_atom_ids: [],
    status: 'grown',
    first_seen_at: '2026-07-01T00:00:00Z',
    last_evidenced_at: '2026-07-04T00:00:00Z',
    ...over,
  };
}

// ── Harness ──────────────────────────────────────────────────────────────
interface Mocks {
  goals: GoalMock;
  edges: GrowthEdgesMock;
  grownTracker: GrownTrackerMock;
  gradTracker: GraduatedTrackerMock;
  dose: DailyDoseMock;
}

function build(m: Mocks): ComponentFixture<NotificationsTickerComponent> {
  TestBed.configureTestingModule({
    imports: [NotificationsTickerComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: GoalService, useValue: m.goals },
      { provide: GrowthEdgesService, useValue: m.edges },
      { provide: GrownEdgeTrackerService, useValue: m.grownTracker },
      { provide: GraduatedGoalTrackerService, useValue: m.gradTracker },
      { provide: DailyDoseService, useValue: m.dose },
    ],
  });
  const fixture = TestBed.createComponent(NotificationsTickerComponent);
  // Two CD passes: the first flushes the constructor edge-fetch + the goals
  // detection effect (writing the celebration signals); the second renders the
  // items that now depend on them.
  fixture.detectChanges();
  fixture.detectChanges();
  return fixture;
}

function testid(
  fixture: ComponentFixture<NotificationsTickerComponent>,
  id: string,
): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

function itemEls(fixture: ComponentFixture<NotificationsTickerComponent>): HTMLElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-testid="aplus-dashboard-ticker-item"]'),
  );
}

describe('NotificationsTickerComponent', () => {
  let m: Mocks;

  beforeEach(() => {
    TestBed.resetTestingModule();
    m = {
      goals: makeGoalMock(),
      edges: makeGrowthEdgesMock(),
      grownTracker: makeGrownTrackerMock(),
      gradTracker: makeGraduatedTrackerMock(),
      dose: makeDailyDoseMock(),
    };
  });

  // ── Empty (the CONDITIONAL contract) ───────────────────────────────────
  it('renders nothing and reports hasItems()===false when there are zero items', () => {
    const fixture = build(m);
    expect(fixture.componentInstance.hasItems()).toBe(false);
    expect(fixture.componentInstance.items().length).toBe(0);
    expect(testid(fixture, 'aplus-dashboard-ticker')).toBeFalsy();
    expect(itemEls(fixture).length).toBe(0);
  });

  // ── The streak has left the ticker (moved to the header today-strip) ────
  it('never renders a streak item — that lives in the header now', () => {
    m.dose = makeDailyDoseMock(3); // a real (due) item so the ticker is shown
    const fixture = build(m);
    expect(testid(fixture, 'aplus-dashboard-ticker')).toBeTruthy();
    expect(testid(fixture, 'aplus-dashboard-ticker-streak')).toBeFalsy();
    expect(fixture.componentInstance.items().some((i) => i.kind === ('streak' as never))).toBe(
      false,
    );
  });

  // ── Celebration: grew edge 🌱 ──────────────────────────────────────────
  it('surfaces a grew-edge celebration from a newly-grown edge', () => {
    m.edges = makeGrowthEdgesMock([grownEdge({ concept_label: 'Fractions' })]);
    m.grownTracker = makeGrownTrackerMock([grownEdge({ concept_label: 'Fractions' })]);
    const fixture = build(m);
    const edge = testid(fixture, 'aplus-dashboard-ticker-celebration-edge');
    expect(edge).toBeTruthy();
    expect(edge?.textContent).toContain('Fractions');
    expect(m.edges.list).toHaveBeenCalledTimes(1);
    expect(m.grownTracker.detectNewlyGrown).toHaveBeenCalledTimes(1);
  });

  it('fetches growth edges + detects newly-grown exactly once across change detections', () => {
    m.edges = makeGrowthEdgesMock([grownEdge()]);
    m.grownTracker = makeGrownTrackerMock([grownEdge()]);
    const fixture = build(m);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(m.edges.list).toHaveBeenCalledTimes(1);
    expect(m.grownTracker.detectNewlyGrown).toHaveBeenCalledTimes(1);
  });

  it('fails soft when the growth-edges fetch errors — no crash, no edge item, other items still render', () => {
    m.edges = { list: vi.fn(() => throwError(() => new Error('boom'))) };
    m.dose = makeDailyDoseMock(3);
    const fixture = build(m);
    expect(testid(fixture, 'aplus-dashboard-ticker-celebration-edge')).toBeFalsy();
    // The due nudge is unaffected by the edge-fetch failure.
    expect(testid(fixture, 'aplus-dashboard-ticker-due')).toBeTruthy();
  });

  // ── Celebration: goal graduated 🎓 ─────────────────────────────────────
  it('surfaces a goal-graduation celebration from a newly-achieved goal', () => {
    m.goals = makeGoalMock([goal({ goalId: 'g9', status: 'achieved', choraTargetRef: 'CSPO' })]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    const fixture = build(m);
    const grad = testid(fixture, 'aplus-dashboard-ticker-celebration-goal');
    expect(grad).toBeTruthy();
    expect(grad?.textContent).toContain('CSPO');
    expect(m.gradTracker.detectNewlyGraduated).toHaveBeenCalled();
  });

  it('labels a graduated goal by its concept set when it has no target ref', () => {
    m.goals = makeGoalMock([
      goal({ goalId: 'g9', status: 'achieved', conceptSet: ['Fractions', 'Ratios'] }),
    ]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    const fixture = build(m);
    const grad = testid(fixture, 'aplus-dashboard-ticker-celebration-goal');
    expect(grad?.textContent).toContain('Fractions, Ratios');
  });

  it('detects goal graduation exactly once even as goals re-emit', () => {
    m.goals = makeGoalMock([goal({ goalId: 'g9', status: 'achieved' })]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    const fixture = build(m);
    m.goals.goals.set([goal({ goalId: 'g9', status: 'achieved' })]);
    fixture.detectChanges();
    expect(m.gradTracker.detectNewlyGraduated).toHaveBeenCalledTimes(1);
  });

  // ── Due-review nudge ───────────────────────────────────────────────────
  it('surfaces a due-review nudge "N concepts due" from the dose ebbinghaus bucket', () => {
    m.dose = makeDailyDoseMock(5);
    const fixture = build(m);
    const due = testid(fixture, 'aplus-dashboard-ticker-due');
    expect(due).toBeTruthy();
    expect(due?.textContent).toContain('5');
    expect(due?.textContent).toContain('aplus.dashboard.ticker.concepts_due');
  });

  it('shows no due item when there are zero atoms due for review', () => {
    m.dose = makeDailyDoseMock(0);
    const fixture = build(m);
    expect(testid(fixture, 'aplus-dashboard-ticker-due')).toBeFalsy();
  });

  it('shows no due item when no dose is loaded (signal null)', () => {
    m.dose = makeDailyDoseMock(null);
    const fixture = build(m);
    expect(testid(fixture, 'aplus-dashboard-ticker-due')).toBeFalsy();
  });

  // ── Ordering ───────────────────────────────────────────────────────────
  it('orders items celebration-edge → celebration-goal → due', () => {
    m.edges = makeGrowthEdgesMock([grownEdge()]);
    m.grownTracker = makeGrownTrackerMock([grownEdge()]);
    m.goals = makeGoalMock([goal({ goalId: 'g9', status: 'achieved' })]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    m.dose = makeDailyDoseMock(2);
    const fixture = build(m);
    expect(fixture.componentInstance.items().map((i) => i.kind)).toEqual([
      'celebration-edge',
      'celebration-goal',
      'due',
    ]);
    expect(itemEls(fixture).length).toBe(3);
  });

  // ── Per-item dismissal (non-persistent) ────────────────────────────────
  it('dismisses a single item and recomputes hasItems', () => {
    m.dose = makeDailyDoseMock(6);
    const fixture = build(m);
    expect(fixture.componentInstance.hasItems()).toBe(true);
    const id = fixture.componentInstance.items()[0].id;
    fixture.componentInstance.dismiss(id);
    fixture.detectChanges();
    expect(fixture.componentInstance.hasItems()).toBe(false);
    expect(testid(fixture, 'aplus-dashboard-ticker')).toBeFalsy();
  });

  it('renders a dismiss control per item', () => {
    m.goals = makeGoalMock([goal({ goalId: 'g9', status: 'achieved', choraTargetRef: 'CSPO' })]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    m.dose = makeDailyDoseMock(3);
    const fixture = build(m);
    const dismissBtns = fixture.nativeElement.querySelectorAll(
      '[data-testid="aplus-dashboard-ticker-dismiss"]',
    );
    expect(dismissBtns.length).toBe(2);
  });

  // ── Accessibility ──────────────────────────────────────────────────────
  it('has no critical/serious accessibility violations (populated)', async () => {
    m.dose = makeDailyDoseMock(2);
    m.goals = makeGoalMock([goal({ goalId: 'g9', status: 'achieved', choraTargetRef: 'CSPO' })]);
    m.gradTracker = makeGraduatedTrackerMock([{ id: 'g9', status: 'achieved' }]);
    const fixture = build(m);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
