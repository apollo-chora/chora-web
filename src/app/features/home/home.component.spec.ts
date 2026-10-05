import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { HomeLayoutService } from './home-layout.service';
import { TranslateService } from '../../core/services/translate.service';
import { HOME_PIN_REGISTRY, type HomePin } from './home-pin.registry';
import type { HomePinFilterInputs } from './home-pin.filter';
import type { LayoutSyncState } from '../../core/services/preference-layout/preference-layout.model';

/**
 * Mock HomeLayoutService: signal-backed `pins` + `syncState`, spy-counted
 * mutators, and a settable capability set so the render-time filter (D4) can be
 * exercised. The component's `pinnedDefs` / `addablePins` run the REAL
 * `filterVisiblePins` over `filterInputs()`, so the filter is genuinely tested.
 */
class MockHomeLayoutService {
  readonly _pins: WritableSignal<readonly HomePin[]> = signal<readonly HomePin[]>([]);
  readonly pins = this._pins.asReadonly();
  readonly _sync: WritableSignal<LayoutSyncState> = signal<LayoutSyncState>({ status: 'ok' });
  readonly syncState = this._sync.asReadonly();

  loadCalls = 0;
  reorderCalls = 0;
  lastReorder: readonly HomePin[] | null = null;
  pinCalls: string[] = [];
  unpinCalls: string[] = [];
  caps = new Set<string>(['assessment:author', 'delivery:ops']);

  load(): void {
    this.loadCalls += 1;
  }
  reorder(next: readonly HomePin[]): void {
    this.reorderCalls += 1;
    this.lastReorder = next;
    this._pins.set([...next]);
  }
  pin(id: string): void {
    this.pinCalls.push(id);
  }
  unpin(id: string): void {
    this.unpinCalls.push(id);
  }
  filterInputs(): HomePinFilterInputs {
    const all = ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'];
    return {
      active: { id: 't1', surfaces: all },
      memberships: [{ id: 't1', surfaces: all }],
      flags: { isEnabled: () => true },
      rbac: { hasRole: () => false, hasCapability: (c: string) => this.caps.has(c) },
      onEmpty: 'open-all',
    };
  }
  setPins(pins: readonly HomePin[]): void {
    this._pins.set([...pins]);
  }
}

function setup(): { fixture: ComponentFixture<HomeComponent>; svc: MockHomeLayoutService } {
  const svc = new MockHomeLayoutService();
  TestBed.configureTestingModule({
    imports: [HomeComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: HomeLayoutService, useValue: svc },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  return { fixture, svc };
}

const testIds = (root: HTMLElement, sel: string): string[] =>
  Array.from(root.querySelectorAll(`[data-testid="${sel}"]`)).map(
    (el) => el.getAttribute('data-pin-id') ?? '',
  );

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let svc: MockHomeLayoutService;

  beforeEach(() => {
    ({ fixture, svc } = setup());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('mounts the ranked section ABOVE the pin grid', () => {
    // The wiring test. Without it the child can fail to construct and every
    // other assertion in this file still passes, because none of them looks at
    // the ranked section: a silent absence would read as a green suite.
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const quests = root.querySelector('[data-testid="home-quests"]');
    expect(quests, 'the ranked section did not render at all').not.toBeNull();

    // Document order decides what leads the page, and the ruling is that the
    // ranked list leads and the pin grid follows.
    const pins = root.querySelector('.chora-home__pins-heading');
    expect(pins).not.toBeNull();
    expect(
      quests!.compareDocumentPosition(pins!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('loads the home layout on init', () => {
    fixture.detectChanges();
    expect(svc.loadCalls).toBe(1);
  });

  it('renders the pinned pins as cards, resolved to their registry route', () => {
    svc.setPins([{ id: 'aplus-learning' }, { id: 'cplus-feed' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(testIds(root, 'home-pin-card')).toEqual(['aplus-learning', 'cplus-feed']);
  });

  it('shows the empty state when no reachable pins are pinned', () => {
    svc.setPins([]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="home-empty"]')).not.toBeNull();
    expect(testIds(root, 'home-pin-card')).toEqual([]);
  });

  it('D4: hides a persisted pin the session can no longer reach, WITHOUT unpinning it', () => {
    // rplus-offerings needs delivery:ops; drop that capability.
    svc.caps = new Set(['assessment:author']);
    svc.setPins([{ id: 'aplus-learning' }, { id: 'rplus-offerings' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // Rendered set excludes the now-unreachable pin...
    expect(testIds(root, 'home-pin-card')).toEqual(['aplus-learning']);
    // ...but the persisted layout still holds it (never deleted by a render filter).
    expect(svc.pins().map((p) => p.id)).toEqual(['aplus-learning', 'rplus-offerings']);
  });

  it('offers the reachable-but-unpinned registry entries in the add palette', () => {
    svc.setPins([{ id: 'aplus-learning' }]);
    fixture.componentInstance.enterEditMode();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const addable = testIds(root, 'home-add-pin');
    expect(addable).not.toContain('aplus-learning'); // already pinned, not offered
    expect(addable).toContain('aplus-wallet'); // reachable + unpinned, offered
    // DERIVED, not a literal. This read `toBe(14)` with the comment "15
    // registry pins minus the 1 pinned", so retiring one pin turned a correct
    // spec red for an arithmetic reason that had nothing to do with what it
    // tests. The property is "every reachable pin except the one already
    // pinned"; the count is a consequence of the registry, so it is read from
    // the registry. `home-pin.retirement-census.spec.ts` separately refuses a
    // registry small enough to make this vacuous.
    expect(addable.length).toBe(HOME_PIN_REGISTRY.length - 1);
  });

  it('addPin delegates to the service', () => {
    fixture.detectChanges();
    fixture.componentInstance.addPin('aplus-wallet');
    expect(svc.pinCalls).toEqual(['aplus-wallet']);
  });

  it('removePin delegates to the service', () => {
    svc.setPins([{ id: 'aplus-learning' }]);
    fixture.detectChanges();
    fixture.componentInstance.removePin('aplus-learning');
    expect(svc.unpinCalls).toEqual(['aplus-learning']);
  });

  it('onDrop reorders the visible pins and persists the full order', () => {
    svc.setPins([{ id: 'aplus-learning' }, { id: 'cplus-feed' }, { id: 'hplus-tenant' }]);
    fixture.detectChanges();
    fixture.componentInstance.onDrop({ previousIndex: 0, currentIndex: 2 } as never);
    expect(svc.lastReorder?.map((p) => p.id)).toEqual(['cplus-feed', 'hplus-tenant', 'aplus-learning']);
  });

  it('onDrop keeps a hidden (unreachable) persisted pin at the tail, never dropping it', () => {
    svc.caps = new Set(['assessment:author']); // rplus-offerings unreachable
    svc.setPins([{ id: 'aplus-learning' }, { id: 'cplus-feed' }, { id: 'rplus-offerings' }]);
    fixture.detectChanges();
    // Only aplus-learning + cplus-feed are visible; drag them.
    fixture.componentInstance.onDrop({ previousIndex: 0, currentIndex: 1 } as never);
    expect(svc.lastReorder?.map((p) => p.id)).toEqual(['cplus-feed', 'aplus-learning', 'rplus-offerings']);
  });

  it('surfaces a degraded sync state as a non-blocking notice', () => {
    svc._sync.set({ status: 'degraded', kind: 'rejected', httpStatus: 403, consecutiveFailures: 1 });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="home-sync-degraded"]')).not.toBeNull();
  });
});
