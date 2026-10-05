import { describe, expect, it } from 'vitest';

import { isMountedRoute } from './home-card.route-liveness';
import { APLUS_ROUTES } from '../surfaces/aplus/aplus.routes';
import { HPLUS_ROUTES } from '../surfaces/hplus/hplus.routes';
import { RPLUS_ROUTES } from '../surfaces/rplus/rplus.routes';

/**
 * Route liveness for home cards (Phase C, C1b).
 *
 * Run against the REAL route tables, not fixtures. A fixture would only prove
 * the matcher agrees with a table I wrote myself; the question worth answering
 * is whether a route the aggregator emits resolves in the app that ships.
 *
 * ⚠ Written AFTER its implementation, which is not the house order. The RED was
 * recovered by mutation instead: each assertion below was checked against a
 * deliberately broken matcher before this file was committed, so it is evidence
 * rather than decoration. Recorded here because a spec that never failed is
 * worth less than one that did, and hiding which is which helps nobody.
 */

const TABLES = { a: APLUS_ROUTES, h: HPLUS_ROUTES, r: RPLUS_ROUTES };

/**
 * Routes the aggregator emits TODAY that do not resolve (2026-09-02, slice B).
 *
 * A ratchet, not a permanent allowance. Each entry is a live defect: the card
 * renders, the viewer clicks, and `app.routes.ts`'s `{ path: '**', redirectTo:
 * 'not-found' }` catches them. Delete an entry as its route is fixed or
 * mounted. The list may only shrink, and the assertion below fails if a new
 * dead route joins it without being recorded here.
 */
const KNOWN_DEAD_CARD_ROUTES: readonly string[] = [
  // EMPTY, and it should stay that way. Five entries lived here for the length
  // of one afternoon: `/a/transcript`, `/a/today`, `/a/paths`, `/r/grading` and
  // `/h/tenants`, all emitted by slice B and all caught by
  // `app.routes.ts`'s `{ path: '**', redirectTo: 'not-found' }`. subagent5
  // corrected every one in `a2b68f97d`. Keep the list rather than deleting it:
  // a new dead route must be recorded here to pass, which is what stops the
  // next one shipping quietly.
];

describe('isMountedRoute, against the shipped route tables', () => {
  it('finds a route that is really mounted', () => {
    // The positive control. Without it every "not mounted" below could be the
    // matcher failing to match anything at all.
    expect(isMountedRoute('/a/knowledge', TABLES)).toBe(true);
    expect(isMountedRoute('/a/daily-dose', TABLES)).toBe(true);
    expect(isMountedRoute('/a/me/transcript', TABLES)).toBe(true);
    expect(isMountedRoute('/h/tenant', TABLES)).toBe(true);
    expect(isMountedRoute('/r/assessments', TABLES)).toBe(true);
  });

  it('matches a parameterised segment', () => {
    expect(isMountedRoute('/a/companion/0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33', TABLES)).toBe(true);
    expect(isMountedRoute('/r/assessments/abc/grading-queue', TABLES)).toBe(true);
  });

  it('follows a wildcard fold', () => {
    // /a/map and /a/discovery are `children: [{ path: '**', redirectTo }]`.
    // They resolve, so a card pointing into one is not broken.
    expect(isMountedRoute('/a/map/anything/at/all', TABLES)).toBe(true);
  });

  it('rejects an unknown surface prefix', () => {
    expect(isMountedRoute('/zzz/whatever', TABLES)).toBe(false);
    expect(isMountedRoute('', TABLES)).toBe(false);
  });

  it('rejects a path no route serves', () => {
    expect(isMountedRoute('/a/definitely-not-a-route', TABLES)).toBe(false);
  });
});

describe('the card routes the aggregator emits', () => {
  it.each(KNOWN_DEAD_CARD_ROUTES)(
    '%s is STILL dead, and this entry must be deleted when it is fixed',
    (route) => {
      // Deliberately asserting the defect. When the route is mounted or the
      // aggregator's string is corrected, this fails and the entry comes out of
      // the list in the same change, which is how the ratchet cannot rot.
      expect(
        isMountedRoute(route, TABLES),
        `${route} now resolves. Delete it from KNOWN_DEAD_CARD_ROUTES.`,
      ).toBe(false);
    },
  );

  it('records every dead route, so a new one cannot slip in unrecorded', () => {
    // Totality over what the aggregator emits today. The table is a hand-mirror
    // of medashboard/cards.go, which the SPA cannot import, so it is asserted
    // against the live tables rather than trusted: every route here either
    // resolves or is a recorded defect, and there is no third outcome.
    const EMITTED_TODAY: readonly string[] = [
      '/a/knowledge', // pending_diagnoses and practice_budget
      '/a/me/transcript', // unseen_results
      '/a/daily-dose', // streak_at_risk
      '/a/courses/some-course-id/learn', // continue_learning, a deep link
      '/r/catalog', // the instructor hand-off
      '/r/assessments', // grading_queue, until C1c
      '/h/ready', // tenants_needing_setup, until C1d
      '/a/knowledge', // defend_hex before a goal is chosen (C4)
      '/a/knowledge/0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33', // defend_hex, deep linked
    ];
    for (const route of EMITTED_TODAY) {
      const mounted = isMountedRoute(route, TABLES);
      const recorded = KNOWN_DEAD_CARD_ROUTES.includes(route);
      expect(
        mounted || recorded,
        `${route} neither resolves nor is recorded as a known dead route`,
      ).toBe(true);
      expect(
        mounted && recorded,
        `${route} is recorded dead but resolves; delete the entry`,
      ).toBe(false);
    }
  });
});
