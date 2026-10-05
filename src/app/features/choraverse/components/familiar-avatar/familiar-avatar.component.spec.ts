import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { FamiliarAvatarComponent } from './familiar-avatar.component';
import { FamiliarService } from '../../services/familiar.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../core/services/translate.service';

describe('FamiliarAvatarComponent', () => {
  let fixture: ComponentFixture<FamiliarAvatarComponent>;
  let component: FamiliarAvatarComponent;

  const stateSignal = signal<Record<string, unknown>>({ status: 'idle' });
  const summoningStateSignal = signal<Record<string, unknown>>({ status: 'idle' });

  const familiarMock = {
    state: stateSignal.asReadonly(),
    summoningState: summoningStateSignal.asReadonly(),
    isSummoned: computed(() => stateSignal()['status'] === 'success'),
    justSummoned: signal(false),
    loadProfile: vi.fn().mockReturnValue(of(null)),
    summonFamiliar: vi.fn().mockReturnValue(of({ id: 'f1' })),
  };

  beforeEach(async () => {
    stateSignal.set({ status: 'idle' });
    summoningStateSignal.set({ status: 'idle' });
    familiarMock.loadProfile.mockReturnValue(of(null));
    familiarMock.summonFamiliar.mockReturnValue(of({ id: 'f1' }));

    await TestBed.configureTestingModule({
      imports: [FamiliarAvatarComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarAvatarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should navigate through archetypes', () => {
    fixture.detectChanges();

    expect(component.selectedIndex()).toBe(0);
    component.nextArchetype();
    expect(component.selectedIndex()).toBe(1);
    component.previousArchetype();
    expect(component.selectedIndex()).toBe(0);
  });

  it('should wrap around when navigating past start', () => {
    fixture.detectChanges();

    component.previousArchetype();
    expect(component.selectedIndex()).toBe(component.archetypes.length - 1);
  });

  it('should open and cancel confirm dialog', () => {
    fixture.detectChanges();

    component.openConfirmDialog();
    expect(component.showConfirmDialog()).toBe(true);

    component.cancelConfirm();
    expect(component.showConfirmDialog()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Augmented coverage (added)
  // ---------------------------------------------------------------------------

  it('should call loadProfile on init', () => {
    familiarMock.loadProfile.mockClear();
    fixture.detectChanges();
    expect(familiarMock.loadProfile).toHaveBeenCalledTimes(1);
  });

  it('should expose all 6 archetypes', () => {
    fixture.detectChanges();
    expect(component.archetypes.length).toBe(6);
    expect(component.archetypes.map((a) => a.species)).toEqual([
      'fox',
      'owl',
      'dragon',
      'cat',
      'robot',
      'phoenix',
    ]);
  });

  it('should select an archetype by index and derive selectedArchetype', () => {
    fixture.detectChanges();

    component.selectArchetype(2);
    expect(component.selectedIndex()).toBe(2);
    expect(component.selectedArchetype().species).toBe('dragon');
  });

  it('should wrap around to first when navigating past end', () => {
    fixture.detectChanges();

    component.selectArchetype(component.archetypes.length - 1);
    component.nextArchetype();
    expect(component.selectedIndex()).toBe(0);
  });

  it('should compute traitPercent as percentage of 20', () => {
    fixture.detectChanges();
    expect(component.traitPercent(20)).toBe(100);
    expect(component.traitPercent(10)).toBe(50);
    expect(component.traitPercent(0)).toBe(0);
  });

  it('should reflect submitting state via isSubmitting computed', () => {
    fixture.detectChanges();
    expect(component.isSubmitting()).toBe(false);

    summoningStateSignal.set({ status: 'submitting' });
    expect(component.isSubmitting()).toBe(true);
  });

  it('should reflect loading state via isLoading computed', () => {
    stateSignal.set({ status: 'loading' });
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);

    const loading = fixture.nativeElement.querySelector(
      '[data-testid="familiar-loading"]',
    );
    expect(loading).toBeTruthy();
  });

  it('should render summoning ceremony when not loading and not summoned', () => {
    stateSignal.set({ status: 'not_summoned' });
    fixture.detectChanges();

    expect(component.isSummoned()).toBe(false);
    const ceremony = fixture.nativeElement.querySelector(
      '[data-testid="summoning-ceremony"]',
    );
    expect(ceremony).toBeTruthy();

    // 6 archetype cards rendered
    const cards = fixture.nativeElement.querySelectorAll('.summoning__card');
    expect(cards.length).toBe(6);
  });

  it('should render the confirm dialog when opened', () => {
    stateSignal.set({ status: 'not_summoned' });
    fixture.detectChanges();

    component.openConfirmDialog();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector(
      '[data-testid="confirm-dialog"]',
    );
    expect(dialog).toBeTruthy();
  });

  it('should null profile when state is not success', () => {
    stateSignal.set({ status: 'not_summoned' });
    fixture.detectChanges();
    expect(component.profile()).toBeNull();
  });

  it('should expose profile and render dashboard when summoned', () => {
    const profile = {
      id: 'f1',
      gcid: 'g1',
      tenantId: '',
      displayName: 'Vulpie',
      speciesType: 'fox',
      personalityTraits: {
        curiosity: 0,
        encouragement: 0,
        humor: 0,
        detail: 0,
        formality: 0,
      },
      evolutionLevel: 3,
      currentSkinId: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    };
    stateSignal.set({ status: 'success', profile });
    fixture.detectChanges();

    expect(component.isSummoned()).toBe(true);
    expect(component.profile()).toEqual(profile);

    const dashboard = fixture.nativeElement.querySelector(
      '[data-testid="familiar-dashboard"]',
    );
    expect(dashboard).toBeTruthy();

    const name = fixture.nativeElement.querySelector(
      '[data-testid="familiar-name"]',
    );
    expect(name.textContent).toContain('Vulpie');
  });

  it('should navigate to a dashboard path', () => {
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.navigateTo('chat');
    expect(navSpy).toHaveBeenCalledWith(['/choraverse', 'chat']);
  });

  it('should confirm summon successfully — toast + navigate + close dialog', () => {
    familiarMock.summonFamiliar.mockReturnValue(of({ id: 'f1' }));
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);

    component.selectArchetype(0); // fox
    component.openConfirmDialog();
    component.confirmSummon();

    expect(familiarMock.summonFamiliar).toHaveBeenCalledWith(
      'fox',
      'Fox',
      component.archetypes[0].defaultTraits,
    );
    expect(component.showConfirmDialog()).toBe(false);
    expect(toast.show).toHaveBeenCalledWith(
      'choraverse.summoning.success',
      'success',
    );
    expect(navSpy).toHaveBeenCalledWith(['/choraverse', 'stats']);
  });

  it('should not navigate when summon returns null profile', () => {
    familiarMock.summonFamiliar.mockReturnValue(of(null));
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.openConfirmDialog();
    component.confirmSummon();

    expect(navSpy).not.toHaveBeenCalled();
    // dialog stays open on null profile
    expect(component.showConfirmDialog()).toBe(true);
  });

  it('should show error toast when summon errors', () => {
    familiarMock.summonFamiliar.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    fixture.detectChanges();

    const toast = TestBed.inject(ToastService);

    component.openConfirmDialog();
    component.confirmSummon();

    expect(toast.show).toHaveBeenCalledWith(
      'choraverse.summoning.error',
      'error',
    );
  });

  it('should unsubscribe on destroy without error', () => {
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
