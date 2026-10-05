import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { DosePreferencesComponent } from './dose-preferences.component';
import { DosePreferencesService } from './dose-preferences.service';
import { MapsService } from '../../my-knowledge/maps.service';
import type { MapCard } from '../../my-knowledge/maps.model';

function card(goalId: string, title: string): MapCard {
  return { goalId, title } as MapCard;
}

class MapsStub {
  readonly _maps = signal<readonly MapCard[]>([]);
  readonly _state = signal<{ status: string }>({ status: 'success' });
  readonly maps = this._maps.asReadonly();
  readonly state = this._state.asReadonly();
  readonly load = vi.fn();
}

class PrefsStub {
  readonly _excluded = signal<ReadonlySet<string>>(new Set<string>());
  readonly _status = signal<'loading' | 'success' | 'error'>('success');
  readonly excluded = this._excluded.asReadonly();
  readonly status = this._status.asReadonly();
  readonly load = vi.fn();
  setIncluded = vi.fn(() => of(undefined));
}

describe('DosePreferencesComponent', () => {
  let maps: MapsStub;
  let prefs: PrefsStub;
  let component: DosePreferencesComponent;

  beforeEach(() => {
    maps = new MapsStub();
    prefs = new PrefsStub();
    TestBed.configureTestingModule({
      imports: [DosePreferencesComponent],
      // provideHttpClient: the real app TranslatePipe injects the root
      // TranslateService, which itself injects HttpClient. Without it the
      // template render throws NG0201 (the very bug this component regressed on).
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MapsService, useValue: maps },
        { provide: DosePreferencesService, useValue: prefs },
      ],
    });
    component = TestBed.createComponent(DosePreferencesComponent).componentInstance;
  });

  it('loads maps + preferences on init', () => {
    expect(maps.load).toHaveBeenCalled();
    expect(prefs.load).toHaveBeenCalled();
  });

  // Regression for the blank-page bug: the component imported ngx-translate's
  // TranslateModule, whose `translate` pipe needs ngx TranslateService — never
  // provided at root (the app uses the custom shared/pipes TranslatePipe). The
  // route blanked with `NG0201: No provider found for TranslateService`. This
  // renders the real template through the real pipe DI chain to prove it resolves.
  it('renders the template through the app TranslatePipe (NG0201 regression)', () => {
    maps._maps.set([card('g-1', 'Math'), card('g-2', 'Science')]);
    prefs._excluded.set(new Set(['g-2']));

    const fixture = TestBed.createComponent(DosePreferencesComponent);
    expect(() => fixture.detectChanges()).not.toThrow();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="dose-prefs-search"]')).toBeTruthy();
    expect(el.textContent).toContain('Math');
  });

  it('composes the roster: included by default, excluded when in the set', () => {
    maps._maps.set([card('g-1', 'Math'), card('g-2', 'Science')]);
    prefs._excluded.set(new Set(['g-2']));

    const roster = component.roster();
    expect(roster.find((r) => r.goalId === 'g-1')!.included).toBe(true);
    expect(roster.find((r) => r.goalId === 'g-2')!.included).toBe(false);
    expect(component.excludedCount()).toBe(1);
  });

  it('filters by search query and by the In/Out tabs', () => {
    maps._maps.set([card('g-1', 'Fractions'), card('g-2', 'Photosynthesis')]);
    prefs._excluded.set(new Set(['g-2']));

    component.setQuery('frac');
    expect(component.filtered().map((r) => r.goalId)).toEqual(['g-1']);

    component.setQuery('');
    component.setFilter('out');
    expect(component.filtered().map((r) => r.goalId)).toEqual(['g-2']);

    component.setFilter('in');
    expect(component.filtered().map((r) => r.goalId)).toEqual(['g-1']);
  });

  it('paginates the filtered roster and clamps navigation', () => {
    maps._maps.set(
      Array.from({ length: 30 }, (_, i) => card(`g-${i}`, `Map ${i}`)),
    );
    expect(component.paged()).toHaveLength(component.pageSize);
    expect(component.pageCount()).toBe(3);

    component.nextPage();
    expect(component.page()).toBe(1);
    component.prevPage();
    component.prevPage();
    expect(component.page()).toBe(0); // clamped at 0
  });

  it('resets to page 0 when the search or filter changes', () => {
    maps._maps.set(
      Array.from({ length: 30 }, (_, i) => card(`g-${i}`, `Map ${i}`)),
    );
    component.nextPage();
    expect(component.page()).toBe(1);
    component.setQuery('Map 1');
    expect(component.page()).toBe(0);
  });

  it('toggle calls setIncluded with the flipped value and clears saving on success', () => {
    component.toggle({ goalId: 'g-1', title: 'Math', included: true });
    expect(prefs.setIncluded).toHaveBeenCalledWith('g-1', false);
    expect(component.savingId()).toBeNull();
    expect(component.saveError()).toBeNull();
  });

  it('surfaces an inline save error when the toggle PUT fails', () => {
    prefs.setIncluded = vi.fn(() => throwError(() => new Error('nope')));
    component.toggle({ goalId: 'g-1', title: 'Math', included: true });
    expect(component.saveError()).toBe('aplus.dosePrefs.saveError');
    expect(component.savingId()).toBeNull();
  });
});
