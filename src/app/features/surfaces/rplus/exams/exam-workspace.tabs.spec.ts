import { describe, expect, it } from 'vitest';
import {
  examTabLabelKey,
  examWorkspaceTabs,
  type ExamTabId,
} from './exam-workspace.tabs';

const ids = (roles: { isExamAdmin: boolean; isProctor: boolean }): ExamTabId[] =>
  examWorkspaceTabs(roles).map((t) => t.id);

describe('examWorkspaceTabs', () => {
  it('gives an exam admin the full ordered set', () => {
    expect(ids({ isExamAdmin: true, isProctor: false })).toEqual([
      'overview',
      'form',
      'candidates',
      'proctors',
      'incidents',
      'results',
    ]);
  });

  it('embargoes form + results from a PROCTOR (ADR-191 — people not paper)', () => {
    const proctorTabs = ids({ isExamAdmin: false, isProctor: true });
    expect(proctorTabs).toEqual(['overview', 'candidates', 'proctors', 'incidents']);
    expect(proctorTabs).not.toContain('form');
    expect(proctorTabs).not.toContain('results');
  });

  it('admin wins when a viewer is both admin and proctor (sees the full set)', () => {
    expect(ids({ isExamAdmin: true, isProctor: true })).toContain('form');
    expect(ids({ isExamAdmin: true, isProctor: true })).toContain('results');
  });

  it('returns an EMPTY set for a viewer with neither capability (no data leak)', () => {
    expect(ids({ isExamAdmin: false, isProctor: false })).toEqual([]);
  });

  it('marks every admin tab available (slice 2 wired Proctors/Incidents/Results)', () => {
    const byId = new Map(
      examWorkspaceTabs({ isExamAdmin: true, isProctor: false }).map((t) => [t.id, t.available]),
    );
    for (const id of ['overview', 'form', 'candidates', 'proctors', 'incidents', 'results'] as const) {
      expect(byId.get(id)).toBe(true);
    }
  });

  it('derives a stable i18n label key per tab', () => {
    expect(examTabLabelKey('candidates')).toBe('rplus.exams.workspace.tab.candidates');
  });
});

/**
 * R6 D3: the placeholder branch is DEAD and must not be re-added.
 *
 * `isPlaceholderActive` existed for tabs whose panels were not yet wired, and
 * its docstring still named proctors, incidents and results. W4 slice 2 wired
 * all three, so `AVAILABLE_TABS` now holds every id and no tab can be
 * unavailable. The computed could never be true and its template branch could
 * never render: dead code behind a stale comment.
 *
 * This guards the invariant the deletion rests on, rather than the deletion
 * itself. If a future tab ships unavailable, this goes red and whoever adds it
 * has to decide deliberately what an unwired tab should show, instead of
 * inheriting a branch nobody could see.
 */
describe('exam workspace tab availability (R6 D3)', () => {
  it('marks EVERY tab available, for both personas', () => {
    for (const roles of [
      { isExamAdmin: true, isProctor: false },
      { isExamAdmin: false, isProctor: true },
    ]) {
      const tabs = examWorkspaceTabs(roles);
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.every((t) => t.available)).toBe(true);
    }
  });

  it('exposes no unavailable tab to render a placeholder for', () => {
    const everyTab = [
      ...examWorkspaceTabs({ isExamAdmin: true, isProctor: false }),
      ...examWorkspaceTabs({ isExamAdmin: false, isProctor: true }),
    ];
    expect(everyTab.filter((t) => !t.available)).toEqual([]);
  });
});
