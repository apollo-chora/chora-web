import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { LockedPathPlayerComponent } from './locked-path-player.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ActivatedRoute, Router } from '@angular/router';
import { provideRouter } from '@angular/router';

describe('LockedPathPlayerComponent', () => {
  let fixture: ComponentFixture<LockedPathPlayerComponent>;
  let component: LockedPathPlayerComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let router: Router;
  let routePathId: string;

  const makePathData = () => ({
    id: 'path-001',
    title: 'Go Mastery Path',
    description: 'Master Go step by step.',
    steps: [
      { atomId: 'atom-1', order: 0, title: 'Variables', atomType: 'mcq', isCompleted: true, isCurrent: false },
      { atomId: 'atom-2', order: 1, title: 'Functions', atomType: 'code', isCompleted: false, isCurrent: true },
      { atomId: 'atom-3', order: 2, title: 'Concurrency', atomType: 'mcq', isCompleted: false, isCurrent: false },
    ],
  });

  beforeEach(async () => {
    routePathId = 'path-001';
    bffMock = {
      get: vi.fn().mockReturnValue(of(makePathData())),
      post: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [LockedPathPlayerComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routePathId } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LockedPathPlayerComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display path title and progress after load', () => {
    fixture.detectChanges();

    expect(element.textContent).toContain('Go Mastery Path');
    expect(component.progress()).toBe(33);
    expect(component.currentStepIndex()).toBe(1);
  });

  it('should navigate to step on goToStep for completed step', () => {
    fixture.detectChanges();

    component.goToStep(0);
    expect(component.currentStepIndex()).toBe(0);
  });

  it('should show error on API failure', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Failed')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="path-error"]')).toBeTruthy();
  });

  // ---- loading & shell render -------------------------------------------

  it('should render the root section host', () => {
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="locked-path-player"]')).toBeTruthy();
  });

  it('should call bff.get with the exact locked-path URL', () => {
    fixture.detectChanges();
    expect(bffMock.get).toHaveBeenCalledWith('/api/v1/locked-paths/path-001');
  });

  it('should show the loading state while the request is pending', () => {
    const pending = new Subject();
    bffMock.get.mockReturnValue(pending);
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect(element.querySelector('[data-testid="path-loading"]')).toBeTruthy();
    expect(element.textContent).toContain('Loading path...');
    // header must NOT be shown while loading
    expect(element.querySelector('[data-testid="path-header"]')).toBeFalsy();
  });

  it('should clear loading and render header after a successful load', () => {
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    expect(element.querySelector('[data-testid="path-header"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="path-loading"]')).toBeFalsy();
  });

  // ---- loadPath guards & error paths ------------------------------------

  it('should set error when no pathId is present and not call bff', () => {
    routePathId = '';
    fixture.detectChanges();

    expect(component.error()).toBe('No path ID provided');
    expect(component.loading()).toBe(false);
    expect(bffMock.get).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="path-error"]')).toBeTruthy();
    expect(element.textContent).toContain('No path ID provided');
  });

  it('should render the error message text inside the error panel', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Boom failure')));
    fixture.detectChanges();

    const panel = element.querySelector('[data-testid="path-error"]');
    expect(panel?.textContent).toContain('Boom failure');
    expect(component.error()).toBe('Boom failure');
  });

  it('should fall back to a default error message when error has no message', () => {
    bffMock.get.mockReturnValue(throwError(() => ({})));
    fixture.detectChanges();

    expect(component.error()).toBe('Failed to load path');
  });

  it('should retry loading when the retry button is clicked', () => {
    bffMock.get.mockReturnValueOnce(throwError(() => new Error('Failed')));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="path-error"]')).toBeTruthy();

    // second call returns good data
    bffMock.get.mockReturnValue(of(makePathData()));
    const retryBtn = element.querySelector('.path-player__retry-btn') as HTMLButtonElement;
    retryBtn.click();
    fixture.detectChanges();

    expect(bffMock.get).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[data-testid="path-error"]')).toBeFalsy();
    expect(element.querySelector('[data-testid="path-header"]')).toBeTruthy();
  });

  // ---- currentStepIndex initialisation ----------------------------------

  it('should default currentStepIndex to 0 when no step is marked current', () => {
    const data = makePathData();
    data.steps.forEach(s => (s.isCurrent = false));
    bffMock.get.mockReturnValue(of(data));
    fixture.detectChanges();

    expect(component.currentStepIndex()).toBe(0);
  });

  // ---- progress computed ------------------------------------------------

  it('should compute progress as 0 when there are no steps', () => {
    bffMock.get.mockReturnValue(of({ id: 'p', title: 'Empty', description: '', steps: [] }));
    fixture.detectChanges();

    expect(component.progress()).toBe(0);
  });

  it('should compute progress as 0 when path is null', () => {
    // before any load resolves
    bffMock.get.mockReturnValue(new Subject());
    fixture.detectChanges();
    expect(component.path()).toBeNull();
    expect(component.progress()).toBe(0);
  });

  it('should render the progress fill width matching progress()', () => {
    fixture.detectChanges();
    const fill = element.querySelector('.path-player__progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('33%');
    expect(fill.getAttribute('aria-valuenow')).toBe('33');
  });

  it('should render the progress text with step position and percent', () => {
    fixture.detectChanges();
    const text = element.querySelector('[data-testid="progress-text"]');
    expect(text?.textContent).toContain('Step 2 of 3');
    expect(text?.textContent).toContain('33% complete');
  });

  // ---- currentStep computed & step content ------------------------------

  it('should expose the current step via the currentStep computed', () => {
    fixture.detectChanges();
    expect(component.currentStep()?.atomId).toBe('atom-2');
    expect(component.currentStep()?.title).toBe('Functions');
  });

  it('should return null currentStep when index is out of range', () => {
    fixture.detectChanges();
    component.currentStepIndex.set(99);
    expect(component.currentStep()).toBeNull();
  });

  it('should render the current atom card with type and title', () => {
    fixture.detectChanges();
    const card = element.querySelector('[data-testid="current-atom"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('code');
    expect(card?.textContent).toContain('Functions');
  });

  // ---- step strip rendering ---------------------------------------------

  it('should render one step indicator per step', () => {
    fixture.detectChanges();
    const indicators = element.querySelectorAll('.path-player__step-indicator');
    expect(indicators.length).toBe(3);
  });

  it('should mark completed steps and disable locked steps', () => {
    fixture.detectChanges();
    const completed = element.querySelector('[data-testid="step-0"]') as HTMLButtonElement;
    const current = element.querySelector('[data-testid="step-1"]') as HTMLButtonElement;
    const locked = element.querySelector('[data-testid="step-2"]') as HTMLButtonElement;

    expect(completed.classList.contains('path-player__step-indicator--completed')).toBe(true);
    expect(current.classList.contains('path-player__step-indicator--current')).toBe(true);
    expect(locked.classList.contains('path-player__step-indicator--locked')).toBe(true);
    expect(locked.disabled).toBe(true);
    expect(completed.disabled).toBe(false);
    expect(current.disabled).toBe(false);
  });

  // ---- goToStep ---------------------------------------------------------

  it('should navigate to the current step via goToStep (same index)', () => {
    fixture.detectChanges();
    component.goToStep(1);
    expect(component.currentStepIndex()).toBe(1);
  });

  it('should NOT navigate to a locked (incomplete, non-current) step', () => {
    fixture.detectChanges();
    component.goToStep(2); // atom-3 is locked
    expect(component.currentStepIndex()).toBe(1);
  });

  it('should be a no-op when goToStep is called before path loads', () => {
    bffMock.get.mockReturnValue(new Subject());
    fixture.detectChanges();
    expect(component.path()).toBeNull();
    component.goToStep(0);
    expect(component.currentStepIndex()).toBe(0);
  });

  it('should be a no-op when goToStep targets an out-of-range order', () => {
    fixture.detectChanges();
    component.goToStep(42);
    expect(component.currentStepIndex()).toBe(1);
  });

  it('should change the rendered atom card after navigating to a completed step', () => {
    fixture.detectChanges();
    component.goToStep(0);
    fixture.detectChanges();
    const card = element.querySelector('[data-testid="current-atom"]');
    expect(card?.textContent).toContain('Variables');
  });

  it('should navigate when a completed step indicator is clicked', () => {
    fixture.detectChanges();
    const completed = element.querySelector('[data-testid="step-0"]') as HTMLButtonElement;
    completed.click();
    expect(component.currentStepIndex()).toBe(0);
  });

  // ---- canCompleteStep --------------------------------------------------

  it('should allow completing an incomplete current step', () => {
    fixture.detectChanges();
    expect(component.canCompleteStep()).toBe(true);
  });

  it('should NOT allow completing an already-completed step', () => {
    fixture.detectChanges();
    component.goToStep(0); // completed step
    expect(component.canCompleteStep()).toBe(false);
  });

  it('should NOT allow completing when there is no current step', () => {
    fixture.detectChanges();
    component.currentStepIndex.set(99);
    expect(component.canCompleteStep()).toBe(false);
  });

  it('should disable the complete button when the step cannot be completed', () => {
    fixture.detectChanges();
    component.goToStep(0);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="complete-next-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('should enable the complete button for an incomplete current step', () => {
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="complete-next-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // ---- openAtom ---------------------------------------------------------

  it('should navigate to the atom player on openAtom', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    component.openAtom('atom-2');
    expect(navSpy).toHaveBeenCalledWith(['/learning', 'player', 'atom-2']);
  });

  it('should navigate to the atom player when the Open Atom button is clicked', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="open-atom-btn"]') as HTMLButtonElement;
    btn.click();
    expect(navSpy).toHaveBeenCalledWith(['/learning', 'player', 'atom-2']);
  });

  // ---- completeAndNext --------------------------------------------------

  it('should POST to the complete endpoint with the current atom id', () => {
    fixture.detectChanges();
    component.completeAndNext();
    expect(bffMock.post).toHaveBeenCalledWith(
      '/api/v1/locked-paths/path-001/steps/atom-2/complete',
      {},
    );
  });

  it('should mark the step completed and advance the index on success', () => {
    fixture.detectChanges();
    component.completeAndNext();

    expect(component.currentStepIndex()).toBe(2);
    const steps = component.path()!.steps;
    expect(steps[1].isCompleted).toBe(true);
    expect(steps[1].isCurrent).toBe(false);
    expect(steps[2].isCurrent).toBe(true);
    // progress now 2/3 completed = 67
    expect(component.progress()).toBe(67);
  });

  it('should complete and advance when the Complete & Next button is clicked', () => {
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="complete-next-btn"]') as HTMLButtonElement;
    btn.click();
    expect(component.currentStepIndex()).toBe(2);
  });

  it('should mark the last step completed without advancing the index', () => {
    fixture.detectChanges();
    component.currentStepIndex.set(2); // last step (atom-3, incomplete)
    component.completeAndNext();

    expect(component.currentStepIndex()).toBe(2);
    const steps = component.path()!.steps;
    expect(steps[2].isCompleted).toBe(true);
    expect(component.progress()).toBe(67);
  });

  it('should be a no-op when completeAndNext is called before path loads', () => {
    bffMock.get.mockReturnValue(new Subject());
    fixture.detectChanges();
    component.completeAndNext();
    expect(bffMock.post).not.toHaveBeenCalled();
  });

  it('should not advance until the complete POST emits success', () => {
    // characterize: the success callback (advance + mark completed) only
    // runs once the POST observable emits. While pending, state is unchanged.
    const pending = new Subject();
    bffMock.post.mockReturnValue(pending);
    fixture.detectChanges();
    const before = component.currentStepIndex();
    component.completeAndNext();

    // still pending → no state change yet
    expect(component.currentStepIndex()).toBe(before);
    expect(component.path()!.steps[1].isCompleted).toBe(false);

    // now the POST resolves → state advances
    pending.next({});
    expect(component.currentStepIndex()).toBe(before + 1);
    expect(component.path()!.steps[1].isCompleted).toBe(true);
  });

  // ---- backToOverview ---------------------------------------------------

  it('should navigate back to the learning overview', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    component.backToOverview();
    expect(navSpy).toHaveBeenCalledWith(['/learning']);
  });

  it('should navigate back when the back link is clicked', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    const link = element.querySelector('[data-testid="back-to-overview"]') as HTMLElement;
    link.click();
    expect(navSpy).toHaveBeenCalledWith(['/learning']);
  });

  it('should navigate back when Enter is pressed on the back link', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    const link = element.querySelector('[data-testid="back-to-overview"]') as HTMLElement;
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navSpy).toHaveBeenCalledWith(['/learning']);
  });
});
