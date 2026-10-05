import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FamiliarLoadoutComponent } from './familiar-loadout.component';
import { TranslateService } from '../../../core/services/translate.service';
import { environment } from '../../../../environments/environment';

/**
 * Slot-counter COPY (D3 slice 3).
 *
 * WHAT WAS WRONG
 * The panel rendered `Skills active: {{slotsUsed}} / {{slotCap}}`. The label
 * names a COUNT of skills and the number is a SUM OF SLOT COSTS, and those are
 * different numbers the moment a 2-cost Skill is equipped. `Loadout.Equip`
 * budgets `slot_cost` and five of the 27 catalogue Skills cost 2, so a learner
 * holding one 1-cost and one 2-cost Skill was shown "Skills active: 3 / 4"
 * while two skills were active. The number was right and the label lied about
 * which quantity it was.
 *
 * WHAT SHIPS
 * One line carrying BOTH units, "2 skills active, 3 of 4 slots used", plus a
 * tooltip saying some Skills take two slots, which is the only thing that makes
 * the two numbers legible to a learner.
 *
 * WHY THIS SPEC FLUSHES THE REAL BUNDLE
 * The rest of the suite runs with NO translations loaded, so `| translate` is a
 * passthrough that returns the key and DROPS interpolation params. A spec
 * written that way could assert the branch but never the sentence, and the
 * whole defect here is arithmetic INSIDE the sentence. So this one loads the
 * shipped `en.json` off disk and flushes it through the same HTTP path the app
 * uses. The assertions therefore run against the string that actually ships,
 * not a fixture that can only agree with me.
 */

const FAM = '00000000-0000-7000-8000-00000000e1a0';
const base = environment.bffBaseUrl;

/** Locate chora-web root (holds public/assets/i18n/en.json). Fails loud. */
function findWebRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, 'public', 'assets', 'i18n', 'en.json'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `familiar-loadout.copy.spec: could not locate public/assets/i18n/en.json from ${process.cwd()}`,
  );
}

function shippedEnBundle(): Record<string, unknown> {
  const raw = readFileSync(
    join(findWebRoot(), 'public', 'assets', 'i18n', 'en.json'),
    'utf8',
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * One 1-cost and one 2-cost active Skill equipped, plus an equipped CRAFT Skill
 * that is slot-free and belongs to neither number. Two skills active, three
 * slot-cost units used, cap four: the case the old single number misreported.
 */
function twoUnitView(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    familiarId: FAM,
    skillGrants: ['progress_mirror', 'socratic_drill', 'steady_hand'],
    equippedSkills: ['progress_mirror', 'socratic_drill'],
    grants: [
      {
        skillKey: 'progress_mirror',
        skillKind: 'active',
        slotCost: 1,
        equipped: true,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: true,
      },
      {
        skillKey: 'socratic_drill',
        skillKind: 'active',
        slotCost: 2,
        equipped: true,
        unlockedVia: 'species_path',
        unlockedAtStage: 3,
        catalogueActive: true,
      },
      {
        skillKey: 'steady_hand',
        skillKind: 'craft',
        slotCost: 0,
        equipped: true,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: true,
      },
    ],
    skillSlotsUnlocked: 4,
    slotsUsed: 3,
    evolutionTier: 'adept',
    growthStage: 3,
    ...over,
  };
}

/** One 1-cost Skill equipped: the singular branch. */
function oneSkillView(): Record<string, unknown> {
  return twoUnitView({
    skillGrants: ['progress_mirror'],
    equippedSkills: ['progress_mirror'],
    grants: [
      {
        skillKey: 'progress_mirror',
        skillKind: 'active',
        slotCost: 1,
        equipped: true,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: true,
      },
    ],
    slotsUsed: 1,
    skillSlotsUnlocked: 4,
  });
}

function setup() {
  TestBed.configureTestingModule({
    imports: [FamiliarLoadoutComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(FamiliarLoadoutComponent);
  fixture.componentRef.setInput('familiarId', FAM);
  const httpMock = TestBed.inject(HttpTestingController);
  const translate = TestBed.inject(TranslateService);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    httpMock,
    translate,
  };
}

/** Load the SHIPPED en bundle through the service's own HTTP path. */
async function loadRealEn(
  httpMock: HttpTestingController,
  translate: TranslateService,
): Promise<void> {
  const done = translate.loadTranslations('en');
  httpMock.expectOne('/assets/i18n/en.json').flush(shippedEnBundle());
  await done;
}

function slotsText(el: HTMLElement): string {
  return (
    el.querySelector('[data-testid="familiar-loadout-slots"]')?.textContent ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

describe('FamiliarLoadoutComponent slot counter copy (D3 slice 3)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('names BOTH units when a 2-cost Skill is equipped', async () => {
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(twoUnitView());
    s.fixture.detectChanges();

    // The whole defect in one assertion: two skills, three slots, one line.
    expect(slotsText(s.el)).toContain('2 skills active');
    expect(slotsText(s.el)).toContain('3 of 4 slots used');
  });

  it('never reports the slot sum as a skill count', async () => {
    // The shipped regression: "Skills active: 3 / 4" with two skills active.
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(twoUnitView());
    s.fixture.detectChanges();

    expect(
      slotsText(s.el),
      'the slot-cost sum is being presented as a count of skills, which is the ' +
        'defect this slice exists to remove',
    ).not.toContain('3 skills active');
  });

  it('says "1 skill" and not "1 skills" for a single equipped Skill', async () => {
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(oneSkillView());
    s.fixture.detectChanges();

    expect(slotsText(s.el)).toContain('1 skill active');
    expect(slotsText(s.el)).not.toContain('1 skills active');
    expect(slotsText(s.el)).toContain('1 of 4 slots used');
  });

  it('offers the two-slot tooltip, which is what makes the two numbers legible', async () => {
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(twoUnitView());
    s.fixture.detectChanges();

    const box = s.el.querySelector('[data-testid="familiar-loadout-slots"]');
    expect(box?.getAttribute('title') ?? '').toContain('two slots');
  });

  it('keeps the slots-used hook on the raw number for the D1 suite', async () => {
    // subagent3's S2 hook. The sentence carries the number for the learner; the
    // hook carries it for the machine, and both must keep working.
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(twoUnitView());
    s.fixture.detectChanges();

    const used = s.el.querySelector('[data-testid="familiar-loadout-slots-used"]');
    expect(used?.textContent?.trim()).toBe('3');
  });
});

/**
 * Reading order (D3 tail, coordinator-approved).
 *
 * The server mints grant order with `sort.Slice` on `SkillKey`
 * (`companion_skill_grant_handler.go:136`). That was invisible while the panel
 * showed machine keys, and became a defect the moment slice 3 resolved display
 * names: the list now reads as alphabetical and is not. `web_research` renders
 * as "Far Sight" and sorts LAST by key, so it lands after "Progress Mirror"
 * with nothing on screen explaining why.
 *
 * Sorted on the client, deliberately. The order is a presentation concern of
 * the resolved NAME, which is locale-dependent: the same grants sort
 * differently in Tamil, and the server has no business knowing that. The
 * handler is untouched.
 *
 * These assertions need the real bundle. With no translations loaded every
 * name resolves to its own key, so sorting by name would equal sorting by key
 * and the test would pass without the feature existing at all.
 */
function unsortedView(): Record<string, unknown> {
  const grant = (skillKey: string, slotCost: number) => ({
    skillKey,
    skillKind: 'active',
    slotCost,
    equipped: false,
    unlockedVia: 'species_path',
    unlockedAtStage: 2,
    catalogueActive: true,
  });
  return twoUnitView({
    // Server order: sorted by SkillKey, so web_research is last.
    skillGrants: ['explain_anew', 'progress_mirror', 'web_research'],
    equippedSkills: [],
    grants: [grant('explain_anew', 1), grant('progress_mirror', 1), grant('web_research', 2)],
    slotsUsed: 0,
    skillSlotsUnlocked: 4,
  });
}

describe('FamiliarLoadoutComponent reading order (D3 tail)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('lists skills by their RESOLVED NAME, not by the machine key', async () => {
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(unsortedView());
    s.fixture.detectChanges();

    const keys = [...s.el.querySelectorAll('[data-testid^="familiar-loadout-grant-"]')].map(
      (el) => (el.getAttribute('data-testid') ?? '').replace('familiar-loadout-grant-', ''),
    );
    // "Explain It Differently" < "Far Sight" < "Progress Mirror".
    expect(keys).toEqual(['explain_anew', 'web_research', 'progress_mirror']);
    // The server's own order, which must NOT be what renders.
    expect(keys).not.toEqual(['explain_anew', 'progress_mirror', 'web_research']);
  });

  it('renders every grant it was given, losing none to the sort', async () => {
    const s = setup();
    httpMock = s.httpMock;
    await loadRealEn(httpMock, s.translate);
    s.fixture.detectChanges();
    httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(unsortedView());
    s.fixture.detectChanges();

    expect(
      s.el.querySelectorAll('[data-testid^="familiar-loadout-grant-"]').length,
    ).toBe(3);
  });
});
