import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StatAllocationComponent } from './stat-allocation.component';
import { FamiliarService } from '../../services/familiar.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../core/services/translate.service';

describe('StatAllocationComponent', () => {
  let fixture: ComponentFixture<StatAllocationComponent>;
  let component: StatAllocationComponent;

  const familiarMock = {
    state: signal({
      status: 'success',
      profile: {
        id: 'f1',
        personalityTraits: { curiosity: 4, encouragement: 4, humor: 4, detail: 4, formality: 4 },
      },
    }),
    justSummoned: signal(false),
    updatePersonality: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatAllocationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should pre-fill from existing profile traits (4 each = 20 spent)', () => {
    fixture.detectChanges();

    // ngOnInit pre-fills from existing profile (4 per trait = 20 total)
    expect(component.pointsSpent()).toBe(20);
    expect(component.pointsRemaining()).toBe(0);
    expect(component.isFullyAllocated()).toBe(true);
  });

  it('should reset sliders to default values', () => {
    fixture.detectChanges();

    component.resetSliders();
    expect(component.sliders().every((s) => s.value === 2)).toBe(true);
    expect(component.pointsSpent()).toBe(10);
  });

  it('should compute dominant trait', () => {
    fixture.detectChanges();

    // All equal, so first sorted by position
    expect(typeof component.dominantTrait()).toBe('string');
  });
});

// ===========================================================================
// Augmented coverage — characterization tests (do not modify source)
// ===========================================================================

/** Build a fake range-input event with a given value string. */
function rangeEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

describe('StatAllocationComponent — constants and budget computeds', () => {
  let fixture: ComponentFixture<StatAllocationComponent>;
  let component: StatAllocationComponent;

  const familiarMock = {
    state: signal({
      status: 'success',
      profile: {
        id: 'f1',
        personalityTraits: { curiosity: 4, encouragement: 4, humor: 4, detail: 4, formality: 4 },
      },
    }),
    justSummoned: signal(false),
    updatePersonality: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatAllocationComponent);
    component = fixture.componentInstance;
  });

  it('exposes budget + min constants and 5 trait definitions', () => {
    fixture.detectChanges();
    expect(component.totalBudget).toBe(20);
    expect(component.minPerTrait).toBe(2);
    expect(component.traitDefinitions.length).toBe(5);
    expect(component.traitDefinitions.map((t) => t.key)).toEqual([
      'curiosity',
      'encouragement',
      'humor',
      'detail',
      'formality',
    ]);
  });

  it('computes previewKey from the dominant trait', () => {
    fixture.detectChanges();
    // pre-filled all equal at 4; dominant resolves to first sorted = curiosity
    expect(component.dominantTrait()).toBe('curiosity');
    expect(component.previewKey()).toBe('choraverse.stats.preview_curiosity');
  });

  it('reflects a distinct dominant trait after one slider is raised', () => {
    fixture.detectChanges();
    component.resetSliders(); // all back to 2 (index 0 = curiosity)
    // Raise humor (index 2) to its max — pushes it above the others
    const humorMax = component.sliderMax(2);
    component.onSliderChange(2, rangeEvent(String(humorMax)));
    expect(component.dominantTrait()).toBe('humor');
    expect(component.previewKey()).toBe('choraverse.stats.preview_humor');
  });
});

describe('StatAllocationComponent — slider interaction', () => {
  let fixture: ComponentFixture<StatAllocationComponent>;
  let component: StatAllocationComponent;

  // justSummoned=true so ngOnInit does NOT pre-fill — sliders start at MIN(2) each = 10 spent, 10 remaining
  const familiarMock = {
    state: signal({
      status: 'success',
      profile: {
        id: 'f1',
        personalityTraits: { curiosity: 4, encouragement: 4, humor: 4, detail: 4, formality: 4 },
      },
    }),
    justSummoned: signal(true),
    updatePersonality: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatAllocationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('first-time start: 5 sliders at MIN(2) → 10 spent, 10 remaining', () => {
    expect(component.sliders().every((s) => s.value === 2)).toBe(true);
    expect(component.pointsSpent()).toBe(10);
    expect(component.pointsRemaining()).toBe(10);
    expect(component.isFullyAllocated()).toBe(false);
  });

  it('sliderMax = current value + remaining budget', () => {
    // index 0 at 2, remaining 10 → max 12
    expect(component.sliderMax(0)).toBe(12);
  });

  it('raises a slider within budget', () => {
    component.onSliderChange(0, rangeEvent('5'));
    expect(component.sliders()[0].value).toBe(5);
    expect(component.pointsSpent()).toBe(13);
    expect(component.pointsRemaining()).toBe(7);
  });

  it('clamps an increase that exceeds the remaining budget', () => {
    // remaining is 10; try to push index 0 from 2 to 20 (diff 18 > 10)
    component.onSliderChange(0, rangeEvent('20'));
    // clamped to old(2) + remaining(10) = 12
    expect(component.sliders()[0].value).toBe(12);
    expect(component.pointsRemaining()).toBe(0);
    expect(component.isFullyAllocated()).toBe(true);
  });

  it('floors a below-minimum value to MIN_PER_TRAIT', () => {
    component.onSliderChange(1, rangeEvent('0'));
    expect(component.sliders()[1].value).toBe(2);
  });

  it('lowers a slider freely (diff <= 0 skips budget clamp)', () => {
    component.onSliderChange(0, rangeEvent('8'));
    expect(component.sliders()[0].value).toBe(8);
    component.onSliderChange(0, rangeEvent('3'));
    expect(component.sliders()[0].value).toBe(3);
  });
});

describe('StatAllocationComponent — ngOnInit / lifecycle', () => {
  async function buildWith(justSummoned: boolean, traits: Record<string, number>) {
    const familiarMock = {
      state: signal({
        status: 'success',
        profile: { id: 'fX', personalityTraits: traits },
      }),
      justSummoned: signal(justSummoned),
      updatePersonality: vi.fn().mockReturnValue(of({})),
    };
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatAllocationComponent);
    return { fixture, component: fixture.componentInstance };
  }

  it('does NOT pre-fill when justSummoned (first time) — sliders stay at MIN', async () => {
    const { fixture, component } = await buildWith(true, {
      curiosity: 8,
      encouragement: 3,
      humor: 3,
      detail: 3,
      formality: 3,
    });
    fixture.detectChanges();
    expect(component.sliders().every((s) => s.value === 2)).toBe(true);
    expect(component.isFirstTime()).toBe(true);
  });

  it('pre-fills from existing traits when not first time', async () => {
    const { fixture, component } = await buildWith(false, {
      curiosity: 8,
      encouragement: 3,
      humor: 3,
      detail: 3,
      formality: 3,
    });
    fixture.detectChanges();
    const byKey = Object.fromEntries(component.sliders().map((s) => [s.key, s.value]));
    expect(byKey['curiosity']).toBe(8);
    expect(byKey['encouragement']).toBe(3);
    expect(component.dominantTrait()).toBe('curiosity');
  });

  it('falls back to MIN_PER_TRAIT for a missing/zero trait value during pre-fill', async () => {
    // curiosity 0 is falsy → fallback to MIN(2)
    const { fixture, component } = await buildWith(false, {
      curiosity: 0,
      encouragement: 6,
      humor: 4,
      detail: 4,
      formality: 4,
    });
    fixture.detectChanges();
    const byKey = Object.fromEntries(component.sliders().map((s) => [s.key, s.value]));
    expect(byKey['curiosity']).toBe(2);
    expect(byKey['encouragement']).toBe(6);
  });

  it('ngOnDestroy unsubscribes without error', async () => {
    const { fixture, component } = await buildWith(true, {
      curiosity: 4,
      encouragement: 4,
      humor: 4,
      detail: 4,
      formality: 4,
    });
    fixture.detectChanges();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

describe('StatAllocationComponent — savePersonality', () => {
  let fixture: ComponentFixture<StatAllocationComponent>;
  let component: StatAllocationComponent;
  let toastSpy: { show: ReturnType<typeof vi.fn> };
  let updateSpy: ReturnType<typeof vi.fn>;
  let navSpy: ReturnType<typeof vi.spyOn>;
  let justSummoned: ReturnType<typeof signal<boolean>>;

  async function build(opts: {
    justSummoned: boolean;
    update: ReturnType<typeof vi.fn>;
    profile?: unknown;
  }) {
    justSummoned = signal(opts.justSummoned);
    updateSpy = opts.update;
    toastSpy = { show: vi.fn() };
    const familiarMock = {
      state: signal(
        opts.profile === null
          ? { status: 'not_summoned' }
          : {
              status: 'success',
              profile: opts.profile ?? {
                id: 'f1',
                personalityTraits: { curiosity: 4, encouragement: 4, humor: 4, detail: 4, formality: 4 },
              },
            },
      ),
      justSummoned,
      updatePersonality: updateSpy,
    };
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: toastSpy },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatAllocationComponent);
    component = fixture.componentInstance;
    navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  it('saves traits, toasts success, and navigates to tutorial on first time', async () => {
    await build({ justSummoned: true, update: vi.fn().mockReturnValue(of({ id: 'f1' })) });
    // first-time start = all 2 (=10); top up to fully allocated
    component.onSliderChange(0, rangeEvent('12')); // curiosity 2→12, remaining 0
    expect(component.isFullyAllocated()).toBe(true);

    component.savePersonality();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, traits] = updateSpy.mock.calls[0];
    expect(id).toBe('f1');
    expect(traits).toEqual({ curiosity: 12, encouragement: 2, humor: 2, detail: 2, formality: 2 });
    expect(component.isSubmitting()).toBe(false);
    expect(toastSpy.show).toHaveBeenCalledWith('choraverse.stats.save_success', 'success');
    expect(navSpy).toHaveBeenCalledWith(['/choraverse', 'tutorial']);
  });

  it('navigates to /choraverse (not tutorial) when not first time', async () => {
    await build({ justSummoned: false, update: vi.fn().mockReturnValue(of({ id: 'f1' })) });
    // not first time → pre-filled to 4 each = 20, fully allocated already
    expect(component.isFullyAllocated()).toBe(true);

    component.savePersonality();

    expect(toastSpy.show).toHaveBeenCalledWith('choraverse.stats.save_success', 'success');
    expect(navSpy).toHaveBeenCalledWith(['/choraverse']);
  });

  it('does NOT navigate or toast success when update returns null', async () => {
    await build({ justSummoned: false, update: vi.fn().mockReturnValue(of(null)) });
    component.savePersonality();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(component.isSubmitting()).toBe(false);
    expect(toastSpy.show).not.toHaveBeenCalled();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('toasts error and clears submitting on update error', async () => {
    await build({
      justSummoned: false,
      update: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
    });
    component.savePersonality();
    expect(component.isSubmitting()).toBe(false);
    expect(toastSpy.show).toHaveBeenCalledWith('choraverse.stats.save_error', 'error');
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when not fully allocated', async () => {
    await build({ justSummoned: true, update: vi.fn().mockReturnValue(of({ id: 'f1' })) });
    // first-time = 10 spent, not fully allocated
    expect(component.isFullyAllocated()).toBe(false);
    component.savePersonality();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no profile', async () => {
    await build({ justSummoned: false, update: vi.fn().mockReturnValue(of({ id: 'f1' })), profile: null });
    expect(component.profile()).toBeNull();
    component.savePersonality();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('StatAllocationComponent — template rendering', () => {
  let fixture: ComponentFixture<StatAllocationComponent>;
  let element: HTMLElement;

  const familiarMock = {
    state: signal({
      status: 'success',
      profile: {
        id: 'f1',
        personalityTraits: { curiosity: 4, encouragement: 4, humor: 4, detail: 4, formality: 4 },
      },
    }),
    justSummoned: signal(false),
    updatePersonality: vi.fn().mockReturnValue(of({ id: 'f1' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatAllocationComponent],
      providers: [
        provideRouter([]),
        { provide: FamiliarService, useValue: familiarMock },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatAllocationComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the shell + title (raw i18n key) + budget counter', () => {
    expect(element.querySelector('[data-testid="stat-allocation"]')).toBeTruthy();
    const title = element.querySelector('[data-testid="stats-title"]');
    expect(title?.textContent?.trim()).toBe('choraverse.stats.title');
    const budget = element.querySelector('[data-testid="budget-counter"]');
    // pre-filled to 4 each = 20 spent, 0 remaining
    expect(budget?.textContent).toContain('0 / 20');
  });

  it('renders one slider row + input per trait (5)', () => {
    const rows = element.querySelectorAll('[data-testid^="slider-"][data-testid$="curiosity"], .stat-allocation__slider-row');
    expect(element.querySelectorAll('.stat-allocation__slider-row').length).toBe(5);
    expect(element.querySelector('[data-testid="slider-curiosity"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="slider-input-formality"]')).toBeTruthy();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('renders the response preview region', () => {
    const preview = element.querySelector('[data-testid="response-preview"]');
    expect(preview).toBeTruthy();
    expect(preview?.textContent).toContain('choraverse.stats.preview_curiosity');
  });

  it('save button is enabled when fully allocated; reset button is present', () => {
    const saveBtn = element.querySelector('[data-testid="save-btn"]') as HTMLButtonElement;
    const resetBtn = element.querySelector('[data-testid="reset-btn"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    expect(resetBtn).toBeTruthy();
  });

  it('disables save button when not fully allocated (after reset → 10 spent)', () => {
    const resetBtn = element.querySelector('[data-testid="reset-btn"]') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    const saveBtn = element.querySelector('[data-testid="save-btn"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('clicking the save button triggers savePersonality and shows the save label', () => {
    const saveBtn = element.querySelector('[data-testid="save-btn"]') as HTMLButtonElement;
    expect(saveBtn.textContent?.trim()).toBe('choraverse.stats.save');
    saveBtn.click();
    fixture.detectChanges();
    expect(familiarMock.updatePersonality).toHaveBeenCalled();
  });

  it('an input event on a slider input updates the rendered value', () => {
    // first lower curiosity to free budget, then verify the value cell updates
    const resetBtn = element.querySelector('[data-testid="reset-btn"]') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    const input = element.querySelector('[data-testid="slider-input-curiosity"]') as HTMLInputElement;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const row = element.querySelector('[data-testid="slider-curiosity"]');
    expect(row?.querySelector('.stat-allocation__slider-value')?.textContent?.trim()).toBe('5');
  });
});
