import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CompanionDockComponent } from './companion-dock.component';
import { ActiveFamiliarService } from '../../../core/familiar/active-familiar.service';
import { DashboardService } from '../../../features/surfaces/aplus/dashboard/dashboard.service';
import type { FamiliarGrowthState } from '../../../core/familiar/familiar-growth.model';
import type { DashboardSummary } from '../../../features/surfaces/aplus/dashboard/dashboard.model';

function setup(
  active: FamiliarGrowthState | null,
  roster: DashboardSummary['familiars'] = [],
): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CompanionDockComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActiveFamiliarService,
        useValue: {
          active: signal(active).asReadonly(),
          mood: signal('curious').asReadonly(),
        },
      },
      {
        provide: DashboardService,
        useValue: {
          summary: () => ({ familiars: roster }) as unknown as DashboardSummary,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CompanionDockComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * ⚠ `FamiliarGrowthState` carries NO name. The first version of this spec
 * invented one, vitest does not typecheck, and `tsc` caught it: the component
 * was reading a property that does not exist on the wire at all. The name comes
 * from the ROSTER, which is why these fixtures are separate.
 */
const eira = {
  familiarId: 'fam-1',
  growthStage: 3,
  stageName: 'adept',
  species: 'owl',
} as unknown as FamiliarGrowthState;

const roster = [
  { familiar_id: 'fam-1', name: 'Eira', species: 'owl', evolution_level: 3, stage_label: 'adept' },
] as unknown as DashboardSummary['familiars'];

describe('CompanionDockComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('shows the active companion by name, resolved from the roster', () => {
    const el = setup(eira, roster);
    expect(el.querySelector('[data-testid="companion-dock"]')).toBeTruthy();
    expect(el.textContent).toContain('Eira');
  });

  it('NEVER prints the companion id when the roster has not resolved a name', () => {
    // A UUID is not a name a learner can act on, and printing one is the same
    // leak the character sheet's whole-profile DOM guard exists to catch.
    const el = setup(eira, []);
    expect(el.querySelector('[data-testid="companion-dock"]')).toBeTruthy();
    expect(el.textContent).not.toContain('fam-1');
    expect(el.querySelector('[data-testid="companion-dock-name"]')?.textContent?.trim())
      .toBeTruthy();
  });

  it('falls back to a named placeholder rather than a blank name slot', () => {
    const el = setup(eira, []);
    expect(el.querySelector('[data-testid="companion-dock-name"]')?.textContent?.trim())
      .toBe('aplus.shell.dock.unnamed');
  });

  it('opens the chat for THAT companion, not the active-by-default route', () => {
    // A bookmarked dock that dropped the id would land on whichever companion
    // happened to be active, which is the same loss C0 refused for the route
    // parameter.
    const el = setup(eira, roster);
    const chat = el.querySelector('[data-testid="companion-dock-chat"]');
    expect(chat?.getAttribute('href')).toBe('/a/companion/fam-1/chat');
  });

  it('links the portrait to the companion profile', () => {
    const el = setup(eira, roster);
    const profile = el.querySelector('[data-testid="companion-dock-profile"]');
    expect(profile?.getAttribute('href')).toBe('/a/companion/fam-1');
  });

  it('renders NOTHING when there is no active companion', () => {
    // ActiveFamiliarService exposes no load state, so `null` means both "this
    // learner has none" and "not loaded yet". An absent dock claims nothing; a
    // dock reading "summon your first companion" would be confidently wrong for
    // a learner who already has six and whose read simply had not landed.
    const el = setup(null);
    expect(el.querySelector('[data-testid="companion-dock"]')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('names the dock for assistive technology', () => {
    const el = setup(eira, roster);
    const dock = el.querySelector('[data-testid="companion-dock"]');
    expect(dock?.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes the mood as text, not as colour alone', () => {
    const el = setup(eira, roster);
    expect(el.querySelector('[data-testid="companion-dock-mood"]')?.textContent?.trim())
      .toBeTruthy();
  });
});
