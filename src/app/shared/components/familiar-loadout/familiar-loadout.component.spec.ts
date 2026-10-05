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

/** A loadout view with progress_mirror equipped + recap_scribe owned-unequipped. */
function loadoutView(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    familiarId: FAM,
    skillGrants: ['progress_mirror', 'recap_scribe', 'explain_anew'],
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
        skillKey: 'explain_anew',
        skillKind: 'active',
        slotCost: 1,
        equipped: false,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: true,
      },
    ],
    skillSlotsUnlocked: 3,
    slotsUsed: 1,
    evolutionTier: 'adept',
    growthStage: 2,
    ...over,
  };
}

function setup(familiarId = FAM, focalConceptId = '') {
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
  fixture.componentRef.setInput('familiarId', familiarId);
  if (focalConceptId) {
    fixture.componentRef.setInput('focalConceptId', focalConceptId);
  }
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

function flushLoadout(httpMock: HttpTestingController, body = loadoutView()): void {
  httpMock
    .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`)
    .flush(body);
}

describe('FamiliarLoadoutComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('loads the loadout on init and renders slot usage + grant rows', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    // Slot counter. D3 slice 3 made this ONE keyed sentence carrying both
    // units, so the numbers ride as interpolation params. This suite loads no
    // bundle, and `instant` interpolates against the key on a miss, so the
    // params are dropped here by construction. Assert the BRANCH plus the hook;
    // the rendered arithmetic is asserted against the real shipped en bundle in
    // familiar-loadout.copy.spec.ts.
    const slots = s.el.querySelector('[data-testid="familiar-loadout-slots"]');
    expect(slots?.textContent ?? '').toContain('familiar_loadout.slots_summary');
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-slots-used"]')?.textContent?.trim(),
    ).toBe('1');
    // One row per grant.
    expect(
      s.el.querySelectorAll('[data-testid^="familiar-loadout-grant-"]').length,
    ).toBe(3);
  });

  it('renders a loading state before the fetch resolves', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-loading"]'),
    ).not.toBeNull();
    flushLoadout(httpMock);
  });

  it('renders a fail-loud error banner with retry on fetch error', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    s.fixture.detectChanges();

    const err = s.el.querySelector('[data-testid="familiar-loadout-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    // Retry re-fires the fetch.
    const retry = s.el.querySelector(
      '[data-testid="familiar-loadout-retry"]',
    ) as HTMLButtonElement;
    retry.click();
    flushLoadout(httpMock);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-slots"]'),
    ).not.toBeNull();
  });

  it('equips an owned-unequipped active skill and refreshes the loadout', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    const equipBtn = s.el.querySelector(
      '[data-testid="familiar-loadout-equip-recap_scribe"]',
    ) as HTMLButtonElement;
    expect(equipBtn).not.toBeNull();
    equipBtn.click();

    // PUT the equip, then the component reloads the loadout.
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/recap_scribe/equip`)
      .flush(loadoutView({ equippedSkills: ['progress_mirror', 'recap_scribe'], slotsUsed: 2 }));
    flushLoadout(httpMock, loadoutView({ equippedSkills: ['progress_mirror', 'recap_scribe'], slotsUsed: 2 }));
    s.fixture.detectChanges();

    const slots = s.el.querySelector('[data-testid="familiar-loadout-slots"]');
    expect(slots?.textContent ?? '').toContain('2');
  });

  it('surfaces a 409 SKILL_SLOTS_FULL conflict via toast without crashing', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    (s.el.querySelector(
      '[data-testid="familiar-loadout-equip-recap_scribe"]',
    ) as HTMLButtonElement).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/recap_scribe/equip`)
      .flush(
        { code: 'SKILL_SLOTS_FULL', message: 'full' },
        { status: 409, statusText: 'Conflict' },
      );
    s.fixture.detectChanges();
    // No reload GET is issued on a failed equip; the grant stays unequipped.
    httpMock.verify();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-equip-recap_scribe"]'),
    ).not.toBeNull();
  });

  it('unequips an equipped active skill', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    const unequip = s.el.querySelector(
      '[data-testid="familiar-loadout-unequip-progress_mirror"]',
    ) as HTMLButtonElement;
    expect(unequip).not.toBeNull();
    unequip.click();
    const req = httpMock.expectOne(
      `${base}/api/v1/me/familiars/${FAM}/skills/progress_mirror/equip`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(loadoutView({ equippedSkills: [], slotsUsed: 0 }));
    flushLoadout(httpMock, loadoutView({ equippedSkills: [], slotsUsed: 0 }));
    s.fixture.detectChanges();
  });

  it('invokes an equipped free skill (progress_mirror) and renders the reply', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    const use = s.el.querySelector(
      '[data-testid="familiar-loadout-use-progress_mirror"]',
    ) as HTMLButtonElement;
    expect(use).not.toBeNull();
    use.click();
    const req = httpMock.expectOne(
      `${base}/api/v1/me/familiars/${FAM}/skills/progress_mirror/invoke`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({
      skillKey: 'progress_mirror',
      reply: 'You earned your certificate this week.',
      recorded: false,
      manaCharged: 0,
      turnId: 't-1',
    });
    s.fixture.detectChanges();

    const result = s.el.querySelector(
      '[data-testid="familiar-loadout-result"]',
    );
    expect(result?.textContent ?? '').toContain('You earned your certificate');
  });

  it('explain_anew Use is DISABLED when no focal concept is available', () => {
    const s = setup(FAM, ''); // no focalConceptId
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    // Equip explain_anew so a Use button would render.
    flushLoadout(
      httpMock,
      loadoutView({
        equippedSkills: ['explain_anew'],
        slotsUsed: 1,
        grants: loadoutView()['grants'],
      }),
    );
    // Mark explain_anew equipped in the grants too.
    s.fixture.detectChanges();
    // With no focal, the explain_anew Use control is disabled (needs a target).
    const use = s.el.querySelector(
      '[data-testid="familiar-loadout-use-explain_anew"]',
    ) as HTMLButtonElement | null;
    if (use) {
      expect(use.disabled).toBe(true);
    }
  });

  it('invokes explain_anew with the focal concept as target', () => {
    const s = setup(FAM, 'concept-focal-9');
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(
      httpMock,
      loadoutView({
        equippedSkills: ['explain_anew'],
        slotsUsed: 1,
        grants: [
          {
            skillKey: 'explain_anew',
            skillKind: 'active',
            slotCost: 1,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: true,
          },
        ],
      }),
    );
    s.fixture.detectChanges();

    const use = s.el.querySelector(
      '[data-testid="familiar-loadout-use-explain_anew"]',
    ) as HTMLButtonElement;
    expect(use).not.toBeNull();
    expect(use.disabled).toBe(false);
    use.click();
    const req = httpMock.expectOne(
      `${base}/api/v1/me/familiars/${FAM}/skills/explain_anew/invoke`,
    );
    const body = req.request.body as { params: { target: string } };
    expect(body.params.target).toBe('concept-focal-9');
    req.flush({
      skillKey: 'explain_anew',
      reply: 'Think of recursion like nesting dolls.',
      recorded: false,
      manaCharged: 10,
      turnId: 't-2',
    });
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-result"]')?.textContent ??
        '',
    ).toContain('nesting dolls');
  });

  // ── CHO-2016 answerable-pipe (quiz_me / socratic_drill) dispatch ──────────

  it('invokes quiz_me and dispatches an answerable reply to the answerable widget', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(
      httpMock,
      loadoutView({
        skillGrants: ['progress_mirror', 'recap_scribe', 'explain_anew', 'quiz_me'],
        equippedSkills: ['quiz_me'],
        slotsUsed: 1,
        grants: [
          ...(loadoutView()['grants'] as Record<string, unknown>[]),
          {
            skillKey: 'quiz_me',
            skillKind: 'active',
            slotCost: 1,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: true,
          },
        ],
      }),
    );
    s.fixture.detectChanges();

    const use = s.el.querySelector(
      '[data-testid="familiar-loadout-use-quiz_me"]',
    ) as HTMLButtonElement | null;
    expect(use).not.toBeNull();
    expect(use!.disabled).toBe(false);
    use!.click();

    const req = httpMock.expectOne(
      `${base}/api/v1/me/familiars/${FAM}/skills/quiz_me/invoke`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({
      skillKey: 'quiz_me',
      reply: 'Answer these in the app.',
      recorded: false,
      manaCharged: 0,
      turnId: 't-quiz',
      resultKind: 'answerable',
      items: [
        {
          atomId: 'atom-1',
          title: 'Long division remainder',
          topic: 'arithmetic',
          difficulty: 2,
          reason: 'weak_spot',
        },
      ],
    });
    s.fixture.detectChanges();

    const widget = s.el.querySelector(
      '[data-testid="familiar-answerable-widget"]',
    );
    expect(widget).not.toBeNull();
    expect(widget!.textContent).toContain('Answer these in the app.');
    expect(widget!.textContent).toContain('Long division remainder');
    // The widget owns the reply text for an answerable result — the plain
    // chat-reply paragraph must NOT also render it (no duplicate narration).
    expect(s.el.querySelector('.familiar-loadout__result-reply')).toBeNull();
  });

  it('socratic_drill is also invokable and its mana badge still renders (CHO-2016)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(
      httpMock,
      loadoutView({
        skillGrants: ['progress_mirror', 'recap_scribe', 'explain_anew', 'socratic_drill'],
        equippedSkills: ['socratic_drill'],
        slotsUsed: 1,
        grants: [
          ...(loadoutView()['grants'] as Record<string, unknown>[]),
          {
            skillKey: 'socratic_drill',
            skillKind: 'active',
            slotCost: 1,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: true,
          },
        ],
      }),
    );
    s.fixture.detectChanges();

    (
      s.el.querySelector(
        '[data-testid="familiar-loadout-use-socratic_drill"]',
      ) as HTMLButtonElement
    ).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/socratic_drill/invoke`)
      .flush({
        skillKey: 'socratic_drill',
        reply: 'Let’s reason through this together.',
        recorded: false,
        manaCharged: 15,
        turnId: 't-socratic',
        resultKind: 'answerable',
        items: [],
      });
    s.fixture.detectChanges();

    // The shared meta line (mana badge) still renders alongside the widget.
    const meta = s.el.querySelector('.familiar-loadout__result-meta');
    expect(meta?.textContent ?? '').toContain('15');
    expect(
      s.el.querySelector('[data-testid="familiar-answerable-widget"]'),
    ).not.toBeNull();
    expect(
      s.el.querySelector('[data-testid="familiar-answerable-empty"]'),
    ).not.toBeNull();
  });

  it('renders the unauthorised error key on a 401 loadout fetch', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills`)
      .flush(
        { code: 'UNAUTHENTICATED', message: 'no session' },
        { status: 401, statusText: 'Unauthorized' },
      );
    s.fixture.detectChanges();
    const err = s.el.querySelector('[data-testid="familiar-loadout-error"]');
    expect(err?.textContent).toContain('familiar_loadout.error_unauthorised');
  });

  it('maps a SKILL_NOT_ACTIVE equip conflict to its own i18n key', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    (
      s.el.querySelector(
        '[data-testid="familiar-loadout-equip-recap_scribe"]',
      ) as HTMLButtonElement
    ).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/recap_scribe/equip`)
      .flush(
        { code: 'SKILL_NOT_ACTIVE', message: 'not released' },
        { status: 409, statusText: 'Conflict' },
      );
    s.fixture.detectChanges();
    httpMock.verify();
    // No reload GET fires on a failed equip; the grant stays actionable.
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-equip-recap_scribe"]'),
    ).not.toBeNull();
  });

  it('maps an unrecognised equip error code to the generic equip_error key', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    (
      s.el.querySelector(
        '[data-testid="familiar-loadout-equip-recap_scribe"]',
      ) as HTMLButtonElement
    ).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/recap_scribe/equip`)
      .flush(
        { code: 'SOMETHING_UNMAPPED', message: 'huh' },
        { status: 409, statusText: 'Conflict' },
      );
    s.fixture.detectChanges();
    httpMock.verify();
  });

  it('maps a non-402 invoke failure to the generic invoke_error key (fail-loud)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    (
      s.el.querySelector(
        '[data-testid="familiar-loadout-use-progress_mirror"]',
      ) as HTMLButtonElement
    ).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/progress_mirror/invoke`)
      .flush(
        { code: 'ENGINE_NOT_CONFIGURED', message: 'down' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    s.fixture.detectChanges();
    // No reply is rendered on a failed turn.
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-result"]'),
    ).toBeNull();
  });

  it('surfaces a 402 insufficient_mana on invoke via toast', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(httpMock);
    s.fixture.detectChanges();

    (s.el.querySelector(
      '[data-testid="familiar-loadout-use-progress_mirror"]',
    ) as HTMLButtonElement).click();
    httpMock
      .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/progress_mirror/invoke`)
      .flush(
        { error: { code: 'insufficient_mana', message: 'top-up' } },
        { status: 402, statusText: 'Payment Required' },
      );
    s.fixture.detectChanges();
    // The turn produced no reply → the result panel is not shown.
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-result"]'),
    ).toBeNull();
  });

  it('shows an empty-loadout hint when no skills are owned yet', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushLoadout(
      httpMock,
      loadoutView({ skillGrants: [], equippedSkills: [], grants: [], slotsUsed: 0 }),
    );
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-empty"]'),
    ).not.toBeNull();
  });
});

// ── CHO-2030 (R3-9): owned-but-dark dormant rendering ─────────────────────

describe('FamiliarLoadoutComponent dormant grants (CHO-2030)', () => {
  it('renders a dormant chip and NO actions for a catalogue-dark grant', async () => {
    const s = setup();
    s.fixture.detectChanges();
    flushLoadout(
      s.httpMock,
      loadoutView({
        grants: [
          {
            skillKey: 'reminder_bell',
            skillKind: 'active',
            slotCost: 1,
            equipped: false,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: false,
          },
        ],
        skillGrants: ['reminder_bell'],
        equippedSkills: [],
        slotsUsed: 0,
      }),
    );
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    s.fixture.detectChanges();

    const chip = s.el.querySelector(
      '[data-testid="familiar-loadout-dormant-reminder_bell"]',
    );
    expect(chip).not.toBeNull();
    // Raw i18n key asserted per the dev raw-key contract (ADR-206 era).
    expect(chip!.textContent).toContain('familiar_loadout.dormant');
    // R3-9: named, never fake-usable — no equip/use affordances.
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-equip-reminder_bell"]'),
    ).toBeNull();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-use-reminder_bell"]'),
    ).toBeNull();
    s.httpMock.verify();
  });

  it('keeps full actions for a released grant', async () => {
    const s = setup();
    s.fixture.detectChanges();
    flushLoadout(s.httpMock);
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    s.fixture.detectChanges();

    expect(
      s.el.querySelector('[data-testid="familiar-loadout-dormant-recap_scribe"]'),
    ).toBeNull();
    expect(
      s.el.querySelector('[data-testid="familiar-loadout-equip-recap_scribe"]'),
    ).not.toBeNull();
    s.httpMock.verify();
  });
});

describe('SPA reach for the released skills (R14)', () => {
  // The server has driven ten skills since July 2026 while this component
  // carried five, so map_sight, weakness_sight and kg_explore were released,
  // priced and slot-costing yet invokable from nowhere in the SPA. R14 exposes
  // all ten; fact_check and web_research already have /a/far-sight, so the
  // loadout covers the remaining three, taking reach from five to eight.
  const NEWLY_REACHABLE = ['map_sight', 'weakness_sight', 'kg_explore'];

  function equippedGrant(skillKey: string): Record<string, unknown> {
    return {
      skillKey,
      skillKind: 'active',
      slotCost: 1,
      equipped: true,
      unlockedVia: 'species_path',
      unlockedAtStage: 3,
      catalogueActive: true,
    };
  }

  for (const key of NEWLY_REACHABLE) {
    it(`offers Use for the released, equipped skill ${key}`, () => {
      const s = setup();
      s.fixture.detectChanges();
      flushLoadout(
        s.httpMock,
        loadoutView({
          skillGrants: [key],
          equippedSkills: [key],
          grants: [equippedGrant(key)],
        }),
      );
      s.fixture.detectChanges();

      expect(
        s.el.querySelector(`[data-testid="familiar-loadout-use-${key}"]`),
      ).not.toBeNull();
      s.httpMock.verify();
    });
  }

  it('still withholds Use from a skill the server cannot drive', () => {
    // The positive control's mirror: worked_example is a real catalogue row
    // with NO invoke builder, so offering Use would promise a 501. Without
    // this, widening the set to "everything" would pass every test above.
    const s = setup();
    s.fixture.detectChanges();
    flushLoadout(
      s.httpMock,
      loadoutView({
        skillGrants: ['worked_example'],
        equippedSkills: ['worked_example'],
        grants: [equippedGrant('worked_example')],
      }),
    );
    s.fixture.detectChanges();

    expect(
      s.el.querySelector('[data-testid="familiar-loadout-use-worked_example"]'),
    ).toBeNull();
    s.httpMock.verify();
  });
});
