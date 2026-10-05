/**
 * C3: the party strip's two additions to the existing cast card.
 *
 * ⚠ NO NEW COMPONENT. `CastCardComponent` already IS the mockup's
 * `partyStrip`: the authoritative roster read, real breed art at real growth
 * stage, portraits linking to the profile, fail-loud loading, error and retry,
 * and a hatch-new pod pinned at the row end, which is the idle pod. Building a
 * second one would have duplicated a live component and let the two drift.
 * The measured delta was exactly two things, and this file pins both.
 *
 * 1. THE WHERE-LINE, with the same three station states as the roster card and
 *    through the same shared helper, so the two surfaces cannot answer "where
 *    is this companion" differently.
 * 2. THE WAY OUT, a trailing link to `/a/roster`, which could not exist before
 *    that route did.
 *
 * ⚠ THE MAP NAME COMES FROM THE MAPS READ, NOT THE GOALS READ. The card
 * already derives bound-state from `GoalService.goals()`, but `GoalDTO` has no
 * title: the map's evolving name is the root concept's title and only
 * `mapCardDTO` carries it. So the where-line reads maps rather than reusing
 * the bond the card already has, which also buys the failure state the goals
 * signal cannot express (`goals()` returns `[]` on loading AND on error).
 *
 * ⚠ "marching on {node}" IS NOT BUILT, and that is a loss against the mockup
 * rather than an oversight. The focus node lives on `mapGraphResp`, the
 * per-map graph read, not on `mapCardDTO`, so rendering it would cost one
 * graph call per map: the same N+1 debt #44 removed for companions. The clause
 * softens to the map name. C4 owns whether the list read should carry a focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';

import { CastCardComponent } from './cast-card.component';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../goal/goal.service';
import { DashboardService } from '../dashboard.service';
import { MapsService } from '../../my-knowledge/maps.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import type { FamiliarSummary } from '../../../../../core/familiar/familiar-growth.model';

const FID = 'f-1';

function companion(over: Partial<FamiliarSummary> = {}): FamiliarSummary {
  return {
    familiarId: FID,
    displayName: 'Ember',
    species: 'dragon',
    growthStage: 3,
    shinyVariant: false,
    expCurrent: 10,
    expNextThreshold: 100,
    isActive: true,
    ...over,
  } as FamiliarSummary;
}

function mapCard(over: Record<string, unknown> = {}) {
  return {
    goalId: 'g1',
    title: 'Fractions',
    northStarNote: '',
    kind: 'goal',
    status: 'active',
    attachedFamiliarId: FID,
    conceptCount: 1,
    shakyCount: 0,
    masteredCount: 0,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...over,
  } as never;
}

/** `maps: null` fails the maps read; `'never'` leaves it pending. */
function build(
  roster: readonly FamiliarSummary[],
  maps: readonly unknown[] | null | 'never',
) {
  TestBed.configureTestingModule({
    imports: [CastCardComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      TranslateService,
      {
        provide: FamiliarGrowthService,
        useValue: { listMyFamiliars: vi.fn(() => of(roster)) },
      },
      {
        provide: GoalService,
        useValue: { goals: signal([]), update: vi.fn(), load: vi.fn() },
      },
      { provide: DashboardService, useValue: { summary: signal(null) } },
      {
        provide: MapsService,
        useValue: {
          listMaps: vi.fn(() =>
            maps === 'never'
              ? NEVER
              : maps === null
                ? throwError(() => ({ status: 500 }))
                : of(maps),
          ),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CastCardComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('cast card station line (C3 party strip)', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());

  it('names the map a companion is stationed on', () => {
    const { el } = build([companion()], [mapCard()]);

    const where = el.querySelector(`[data-testid="aplus-cast-where-${FID}"]`);
    expect(where?.textContent).toContain('familiar_roster.stationed');
  });

  it('says a companion is on no map when the maps read found no bond', () => {
    const { el } = build([companion()], [mapCard({ attachedFamiliarId: 'other' })]);

    const where = el.querySelector(`[data-testid="aplus-cast-where-${FID}"]`);
    expect(where?.textContent).toContain('familiar_roster.unstationed');
  });

  it('does NOT claim a companion is idle when the maps read FAILED', () => {
    // The state the mockup has no words for. "Not on a map" would tell a
    // learner their companion is resting while it may be marching.
    const { el } = build([companion()], null);

    const where = el.querySelector(`[data-testid="aplus-cast-where-${FID}"]`);
    expect(where?.textContent).toContain('familiar_roster.station_unknown');
    expect(where?.textContent).not.toContain('familiar_roster.unstationed');
  });

  it('does not claim idle while the maps read is still in flight either', () => {
    // Pending is not empty. Before the read answers, the strip knows nothing,
    // and the honest render is the same unknown rather than a premature "no".
    const { el } = build([companion()], 'never');

    const where = el.querySelector(`[data-testid="aplus-cast-where-${FID}"]`);
    expect(where?.textContent).toContain('familiar_roster.station_unknown');
  });

  it('still renders the strip when the maps read fails', () => {
    // One line on a member must not cost the strip.
    const { el } = build([companion()], null);

    expect(el.querySelector(`[data-testid="aplus-cast-familiar-${FID}"]`)).toBeTruthy();
  });

  it('offers a way out to the full roster', () => {
    const { el } = build([companion()], [mapCard()]);

    const link = el.querySelector('[data-testid="aplus-cast-roster-link"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/a/roster');
  });
});
