import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FamiliarEggComponent } from './familiar-egg.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { FamiliarMapService } from '../discovery-graph/familiar-map.service';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';

/** CHO-2089 (F-I2 FE) — the incubation card: live warming bar, stirring gate,
 *  committed-species vs first-egg mystery, bound-goal name. */

function summary(over: Partial<FamiliarSummary> = {}): FamiliarSummary {
  return {
    familiarId: 'egg-1',
    displayName: '',
    species: '' as FamiliarSummary['species'],
    growthStage: 0 as FamiliarSummary['growthStage'],
    shinyVariant: false,
    expCurrent: 12,
    expNextThreshold: 25,
    isActive: false,
    ...over,
  };
}

interface BuildOpts {
  list?: readonly FamiliarSummary[];
  listError?: boolean;
  bindings?: readonly {
    bindingId: string;
    mapTheme: string;
    familiarId: string;
  }[];
  bindingsError?: boolean;
  familiarId?: string;
}

function build(opts: BuildOpts = {}) {
  TestBed.resetTestingModule();
  const growthStub = {
    listMyFamiliars: vi.fn(() =>
      opts.listError ? throwError(() => new Error('boom')) : of(opts.list ?? [summary()]),
    ),
  } as unknown as FamiliarGrowthService;
  const mapStub = {
    listBindings: vi.fn(() =>
      opts.bindingsError ? throwError(() => new Error('boom')) : of({ items: opts.bindings ?? [] }),
    ),
  } as unknown as FamiliarMapService;
  TestBed.configureTestingModule({
    imports: [FamiliarEggComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: FamiliarGrowthService, useValue: growthStub },
      { provide: FamiliarMapService, useValue: mapStub },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({
              familiarId: opts.familiarId ?? 'egg-1',
            }),
          },
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fx = TestBed.createComponent(FamiliarEggComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fx.detectChanges();
  httpMock
    .match(() => true)
    .forEach((r) => r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }));
  fx.detectChanges();
  return {
    fx,
    cmp: fx.componentInstance,
    el: fx.nativeElement as HTMLElement,
    navSpy,
  };
}

function tid(el: HTMLElement, id: string): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe('FamiliarEggComponent (incubation card, CHO-2089)', () => {
  it('renders the warming bar from the live growth read', () => {
    const { el, cmp } = build();
    expect(cmp.warmExp()).toBe(12);
    expect(cmp.warmThreshold()).toBe(25);
    expect(cmp.stirring()).toBe(false);
    const bar = tid(el, 'aplus-egg-warming-bar');
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute('aria-valuenow')).toBe('12');
    expect(bar?.getAttribute('aria-valuemax')).toBe('25');
    // The test TranslateService echoes keys — numeric values are pinned via
    // the aria attributes above; here just pin the right key renders.
    expect(tid(el, 'aplus-egg-warming-label')?.textContent).toContain('warming_label');
  });

  it('gates the hatch CTA while warming and frees it when stirring', () => {
    const cold = build();
    expect(tid(cold.el, 'aplus-egg-hatch-cta')).toBeNull();
    expect(tid(cold.el, 'aplus-egg-hatch-locked')).toBeTruthy();

    const hot = build({ list: [summary({ expCurrent: 25 })] });
    expect(hot.cmp.stirring()).toBe(true);
    expect(tid(hot.el, 'aplus-egg-hatch-cta')).toBeTruthy();
    expect(tid(hot.el, 'aplus-egg-hatch-locked')).toBeNull();
    expect(tid(hot.el, 'aplus-egg-stirring')).toBeTruthy();
  });

  // D4. The card used to read the species off the first HATCHED sibling and
  // advertise it ("A fox stirs within"), on a doc comment claiming one species
  // per user. The owner INVERTED that on 2026-08-07: growth.ExcludeOwnedSpecies
  // now guarantees a new pod is NOT a species the learner already owns, so the
  // card was naming the one outcome the roll had just forbidden. The pod is a
  // mystery by design (CHO-2227) and the backend keeps `species` empty until
  // RevealBreed writes it, so the card says nothing until then.
  it('keeps the species a mystery even when a hatched sibling exists', () => {
    const { el } = build({
      list: [
        summary(),
        summary({
          familiarId: 'fam-ember',
          displayName: 'Ember',
          growthStage: 2 as FamiliarSummary['growthStage'],
          species: 'owl' as FamiliarSummary['species'],
        }),
      ],
    });
    expect(tid(el, 'aplus-egg-species-mystery')).toBeTruthy();
    expect(tid(el, 'aplus-egg-species-committed')).toBeNull();
    expect(el.textContent).not.toContain('owl');
  });

  it('keeps the species a full mystery for the first-ever egg', () => {
    const { el } = build();
    expect(tid(el, 'aplus-egg-species-mystery')).toBeTruthy();
    expect(tid(el, 'aplus-egg-species-committed')).toBeNull();
  });

  it('names the bound goal from the bindings read', () => {
    const { el, cmp } = build({
      bindings: [{ bindingId: 'g-1', mapTheme: 'Fractions', familiarId: 'egg-1' }],
    });
    expect(cmp.boundGoalTheme()).toBe('Fractions');
    expect(tid(el, 'aplus-egg-goal')?.textContent).toContain('goal_bound');
    expect(tid(el, 'aplus-egg-goal-nudge')).toBeNull();
  });

  it('nudges toward summoning when the egg is unbound (bindings fail-soft)', () => {
    const unbound = build();
    expect(tid(unbound.el, 'aplus-egg-goal-nudge')).toBeTruthy();

    const errored = build({ bindingsError: true });
    expect(tid(errored.el, 'aplus-egg-goal-nudge')).toBeTruthy();
    expect(tid(errored.el, 'aplus-egg-warming-bar')).toBeTruthy();
  });

  it('redirects a hatched familiar to its profile', () => {
    const { navSpy } = build({
      list: [summary({ growthStage: 1 as FamiliarSummary['growthStage'] })],
    });
    expect(navSpy).toHaveBeenCalledWith(['/a/companion', 'egg-1']);
  });

  it('fails loud when the egg is not on the roster', () => {
    const { el } = build({ list: [] });
    expect(tid(el, 'aplus-egg-error')).toBeTruthy();
    expect(tid(el, 'aplus-egg-warming-bar')).toBeNull();
  });

  it('has no critical/serious a11y violations', async () => {
    const { fx } = build();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fx.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
