import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { GrimoireDesignComponent } from './grimoire-design.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';

const FID = '00000000-0000-7000-8000-00000000e1a0';
const base = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}`;

function growthBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: {
      familiarId: FID,
      growthStage: 4,
      stageName: 'structural',
      species: 'dragon',
      shinyVariant: false,
      rarity: 'rare',
      expCurrent: 600,
      expNextThreshold: 1200,
      expCumulative: 600,
      effectiveLlmTier: 'flash',
      effectiveMaxOutputTokens: 2048,
      unlockedTools: [],
      resonantAtomId: '',
      ahaMomentConsumed: true,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-06-01T00:00:00Z',
      lastStageUpAt: null,
      displayName: 'Ember',
      ...over,
    },
  };
}

const emptyLoadout = {
  familiarId: FID,
  skillGrants: [],
  equippedSkills: [],
  grants: [],
  skillSlotsUnlocked: 7,
  slotsUsed: 0,
  evolutionTier: 'adept',
  growthStage: 4,
};

/** The camelCase persona view the Persona tab (default/first) fetches on mount. */
const personaView = {
  tone: 'socratic',
  hintProgression: 'ladder',
  maxHintsBeforeReveal: 3,
  difficultyCap: 'intermediate',
  language: 'en',
  citationStrictness: 'strict',
  archetype: 'curious-explorer',
  addressStyle: 'first_name',
  interestChips: [],
  guidanceNote: '',
  version: 0,
};

function create() {
  TestBed.configureTestingModule({
    imports: [GrimoireDesignComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
  });
  const fixture = TestBed.createComponent(GrimoireDesignComponent);
  fixture.componentRef.setInput('familiarId', FID);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, httpMock, el: fixture.nativeElement as HTMLElement };
}

/** Flush the growth GET. */
function flushGrowth(httpMock: HttpTestingController, body = growthBody()): void {
  httpMock.expectOne(`${base}/growth`).flush(body);
}

describe('GrimoireDesignComponent', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('shows a loading state before growth resolves, then lands on Persona (fetches it)', () => {
    const s = create();
    httpMock = s.httpMock;
    expect(s.cmp.state().status).toBe('loading');
    flushGrowth(httpMock);
    s.fixture.detectChanges(); // st4 lands on the Persona tab (first/default), which fetches
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
    expect(s.cmp.activeTab()).toBe('persona');
  });

  it('unlocks Persona at st1, Loadout at st2, Rituals at st4', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock, growthBody({ growthStage: 2 }));
    s.fixture.detectChanges();
    const personaTab = s.cmp.tabs.find((t) => t.key === 'persona')!;
    const loadoutTab = s.cmp.tabs.find((t) => t.key === 'loadout')!;
    const routinesTab = s.cmp.tabs.find((t) => t.key === 'routines')!;
    expect(s.cmp.isUnlocked(personaTab)).toBe(true);
    expect(s.cmp.isUnlocked(loadoutTab)).toBe(true);
    expect(s.cmp.isUnlocked(routinesTab)).toBe(false);
    // st2 lands on the first unlocked tab (persona) → persona child fetches
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
  });

  it('at st1 Persona is unlocked but Loadout/Rituals are locked (tease on a locked tab)', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock, growthBody({ growthStage: 1, stageName: 'baby' }));
    s.fixture.detectChanges();
    // Persona (first tab) is unlocked at st1 → it mounts + fetches.
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
    s.fixture.detectChanges();
    const personaTab = s.cmp.tabs.find((t) => t.key === 'persona')!;
    const loadoutTab = s.cmp.tabs.find((t) => t.key === 'loadout')!;
    expect(s.cmp.isUnlocked(personaTab)).toBe(true);
    expect(s.cmp.isUnlocked(loadoutTab)).toBe(false);
    expect(s.el.querySelector('chora-persona-tab')).not.toBeNull();
    // selecting a locked tab is a no-op (stays on persona; no loadout child mounts).
    s.cmp.selectTab(loadoutTab);
    s.fixture.detectChanges();
    expect(s.cmp.activeTab()).toBe('persona');
    expect(s.el.querySelector('chora-familiar-loadout')).toBeNull();
  });

  it('the st3 Aha window previews all tabs even below their unlock stage', () => {
    const future = '2999-01-01T00:00:00Z';
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(
      httpMock,
      growthBody({ growthStage: 1, ahaMomentConsumed: false, ahaMomentActiveUntil: future }),
    );
    s.fixture.detectChanges();
    const routinesTab = s.cmp.tabs.find((t) => t.key === 'routines')!;
    expect(s.cmp.ahaPreviewActive()).toBe(true);
    expect(s.cmp.isUnlocked(routinesTab)).toBe(true);
    // aha lands on the first tab (persona) → its view loads
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
  });

  it('applies the per-breed data-breed attribute', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock, growthBody({ species: 'phoenix', growthStage: 1 }));
    s.fixture.detectChanges();
    // Persona mounts at st1 → drain its fetch so verify() stays clean.
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
    expect(s.el.querySelector('.grimoire')?.getAttribute('data-breed')).toBe('phoenix');
  });

  it('mounts the Rituals tab child when selected at st4', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock); // st4
    s.fixture.detectChanges();
    // lands on persona first
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
    const routinesTab = s.cmp.tabs.find((t) => t.key === 'routines')!;
    s.cmp.selectTab(routinesTab);
    s.fixture.detectChanges();
    expect(s.cmp.activeTab()).toBe('routines');
    expect(s.el.querySelector('chora-routines-tab')).not.toBeNull();
    // routines child fetches rituals + loadout
    s.httpMock.expectOne(`${base}/rituals`).flush({ rituals: [] });
    s.httpMock.expectOne(`${base}/skills`).flush(emptyLoadout);
  });

  it('mounts the Loadout tab child when selected at st4', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock); // st4
    s.fixture.detectChanges();
    s.httpMock.expectOne(`${base}/persona`).flush(personaView); // persona first
    const loadoutTab = s.cmp.tabs.find((t) => t.key === 'loadout')!;
    s.cmp.selectTab(loadoutTab);
    s.fixture.detectChanges();
    expect(s.cmp.activeTab()).toBe('loadout');
    s.httpMock.expectOne(`${base}/skills`).flush(emptyLoadout);
  });

  it('selectTab on a locked tab is a no-op', () => {
    const s = create();
    httpMock = s.httpMock;
    flushGrowth(httpMock, growthBody({ growthStage: 2 }));
    s.fixture.detectChanges();
    s.httpMock.expectOne(`${base}/persona`).flush(personaView); // persona child (first unlocked)
    const routinesTab = s.cmp.tabs.find((t) => t.key === 'routines')!;
    s.cmp.selectTab(routinesTab); // locked at st2
    expect(s.cmp.activeTab()).toBe('persona');
  });

  it('renders a fail-loud error state with a retry', () => {
    const s = create();
    httpMock = s.httpMock;
    httpMock
      .expectOne(`${base}/growth`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    s.fixture.detectChanges();
    expect(s.cmp.state().status).toBe('error');
    expect(s.el.querySelector('.grimoire__error')).not.toBeNull();
  });

  it('retry re-loads growth after an error', () => {
    const s = create();
    httpMock = s.httpMock;
    httpMock
      .expectOne(`${base}/growth`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    s.fixture.detectChanges();
    expect(s.cmp.state().status).toBe('error');
    s.cmp.retry();
    flushGrowth(httpMock, growthBody({ growthStage: 1, stageName: 'baby' }));
    s.fixture.detectChanges();
    // st1 lands on persona (unlocked) → drain its fetch.
    s.httpMock.expectOne(`${base}/persona`).flush(personaView);
    expect(s.cmp.state().status).toBe('success');
  });
});
