/**
 * The loadout's keyboard path and its two counters (D1 / S2).
 *
 * ⚠ WHY THERE IS NO REORDER HERE. The plan put S2 and S3 "on ONE shared
 * drag-and-drop component". S3 gets it. S2 does NOT, and that is a finding
 * rather than a shortfall: the loadout has no order a learner can change.
 * `listGrantsSQL` carries no ORDER BY and no position column exists
 * (`companion_loadout.go:39-46`); the order the learner sees is minted at
 * serialisation time by `sort.Slice(detail, ... SkillKey < SkillKey)`
 * (`companion_skill_grant_handler.go:136`). A drag handle here would move a row
 * that the next GET puts straight back, which is a fabricated affordance, and
 * the orchestrator's R-a ruling is explicit: mount the keyboard path only where
 * an order exists. The equipped SET is what matters, and it is a set.
 *
 * What the loadout does owe the keyboard, it already pays: every affordance is
 * a native <button>, so activation is the browser's, not ours. The last two
 * tests pin that, because it is the kind of guarantee a later template edit
 * removes silently by reaching for a <div (click)>.
 *
 * The counters are the real S2 debt (ruling R-b). "Skills active X of Y" mixes
 * units: the cap binds the SUM OF SLOT COSTS (`EquippedSlotCost`, and a Skill
 * may cost 2), while "skills active" is a COUNT. They are different numbers and
 * the profile currently has only one of them, so any wording built on it is
 * wrong for anyone holding a 2-cost Skill. D3 phrases them; S2 ships both
 * values, separately named, so the phrasing cannot silently pick the wrong one.
 */
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

const FAM = '00000000-0000-7000-8000-00000000e1a0';
const base = environment.bffBaseUrl;

/**
 * A loadout where the two counters DISAGREE: two active Skills are equipped but
 * one of them costs 2 slots, so "2 skills" sits against "3 of 4 slots". A craft
 * Skill is equipped as well and must inflate neither, being always-on and
 * slot-free by construction (`loadout.go:76-86`).
 */
function twoUnitView(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    familiarId: FAM,
    skillGrants: ['progress_mirror', 'socratic_drill', 'recap_scribe', 'steady_hand'],
    // The server's own ACTIVE equipped set (craft is excluded there too).
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
        skillKey: 'recap_scribe',
        skillKind: 'active',
        slotCost: 1,
        equipped: false,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
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
    // EquippedSlotCost: 1 + 2, craft excluded.
    slotsUsed: 3,
    evolutionTier: 'adept',
    growthStage: 3,
    ...over,
  };
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
  return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, httpMock };
}

function flush(httpMock: HttpTestingController, body: Record<string, unknown>): void {
  httpMock.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`).flush(body);
}

describe('FamiliarLoadoutComponent counters (S2, ruling R-b)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('exposes skills-active as a COUNT and slots-used as a SLOT-COST SUM', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView());
    s.fixture.detectChanges();

    // The whole point: these are not the same number, and a single "X of Y"
    // built from either one misreports the other.
    expect(s.cmp.skillsActive()).toBe(2);
    expect(s.cmp.slotsUsed()).toBe(3);
    expect(s.cmp.slotCap()).toBe(4);
    expect(s.cmp.skillsActive()).not.toBe(s.cmp.slotsUsed());
  });

  it('counts an equipped CRAFT Skill in neither counter', () => {
    // steady_hand is equipped and always-on, but it is slot-free and is not an
    // "active skill" in the server's sense, so it belongs to neither number.
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView());
    s.fixture.detectChanges();

    const equippedCraft = s.cmp
      .view()!
      .grants.filter((g) => g.equipped && g.skillKind === 'craft');
    expect(equippedCraft).toHaveLength(1);
    expect(s.cmp.skillsActive()).toBe(2);
    expect(s.cmp.slotsUsed()).toBe(3);
  });

  it('takes skills-active from the SERVER set, not from a client-side recount', () => {
    // The server owns which Skills are active-equipped
    // (`Loadout.EquippedActiveSkillKeys`). If the grant rows and that set ever
    // disagree, the set wins here, so the SPA cannot invent a different answer
    // from the same payload. A recount would have said 2.
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView({ equippedSkills: ['progress_mirror'] }));
    s.fixture.detectChanges();

    expect(s.cmp.skillsActive()).toBe(1);
  });

  it('gives the slot number its own hook without inventing D3 s wording', () => {
    // S2 ships the VALUES; D3 slice 3 phrases them in one keyed string carrying
    // both units. So the count is deliberately NOT rendered here: a bare "2"
    // beside "3 / 4" with no label would be a worse line than the one that
    // ships today, and inventing the label would take the decision off the
    // session that owns the copy. What S2 owes the template is a stable hook on
    // the number that already renders, and both values on the component.
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView());
    s.fixture.detectChanges();

    const used = s.el.querySelector('[data-testid="familiar-loadout-slots-used"]');
    expect(used?.textContent?.trim()).toBe('3');
    // D3 slice 3 has since phrased them: the container now holds ONE keyed
    // sentence whose numbers are interpolation params, and this suite loads no
    // bundle, so only the branch is visible here. The cap no longer appears as
    // a bare number, which is the point: it is inside the sentence now.
    // familiar-loadout.copy.spec.ts asserts the arithmetic against the real
    // shipped en bundle.
    const box = s.el.querySelector('[data-testid="familiar-loadout-slots"]');
    expect(box?.textContent ?? '').toContain('familiar_loadout.slots_summary_other');
    expect(s.cmp.slotCap()).toBe(4);
  });
});

describe('FamiliarLoadoutComponent keyboard path (S2)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('makes every grant affordance a native button, so activation is the browser s', () => {
    // Regression pin, not a RED: this already holds. It is here because the way
    // it breaks is silent. A <div (click)> or an <a> with no href renders
    // identically, passes every behavioural test that calls .click(), and is
    // simply unreachable by keyboard. Asserting the TAG is the only assertion
    // that catches that, because it is the tag that carries the semantics.
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView());
    s.fixture.detectChanges();

    const actionable = Array.from(
      s.el.querySelectorAll('.familiar-loadout__grant-actions *'),
    ).filter((n) => n.hasAttribute('data-testid') || n.tagName === 'BUTTON');
    expect(actionable.length).toBeGreaterThan(0);
    for (const node of actionable) {
      expect(node.tagName).toBe('BUTTON');
      expect(node.getAttribute('type')).toBe('button');
      // A negative tabindex would remove it from the tab order while leaving it
      // clickable: keyboard-dead but pointer-alive, the exact asymmetry S2 is
      // supposed to prevent.
      expect(node.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('equips through the focused control alone, with no pointer path involved', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flush(httpMock, twoUnitView());
    s.fixture.detectChanges();

    const equip = s.el.querySelector<HTMLButtonElement>(
      '[data-testid="familiar-loadout-equip-recap_scribe"]',
    )!;
    expect(equip.disabled).toBe(false);

    // Focus it the way a Tab would, then activate it the way Enter does on a
    // native button. jsdom does not synthesise the click from the keydown, so
    // this asserts what the component owns: a focused, enabled control whose
    // activation issues the equip.
    equip.focus();
    expect(document.activeElement).toBe(equip);
    equip.click();

    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/recap_scribe/equip`)
      .flush({});
    // The post-mutation reload, which the component fires on success.
    flush(httpMock, twoUnitView());
  });
});
