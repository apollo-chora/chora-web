import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { EvolutionTimelineComponent } from './evolution-timeline.component';
import { FamiliarService } from '../../services/familiar.service';
import { EvolutionMilestone } from '../../models/familiar.model';
import type { GqlFamiliar } from '../../../../core/graphql/types';

describe('EvolutionTimelineComponent', () => {
  let component: EvolutionTimelineComponent;
  let fixture: ComponentFixture<EvolutionTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionTimelineComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(EvolutionTimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="evolution-timeline"]');
    expect(el).toBeTruthy();
  });

  it('should have title element', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="evolution-title"]');
    expect(el).toBeTruthy();
  });

  it('should return null for nextMilestone when no milestones', () => {
    expect(component.nextMilestone()).toBeNull();
  });

  it('should return 100 for progressPercent when no next milestone', () => {
    expect(component.progressPercent()).toBe(100);
  });

  it('should identify achieved milestones', () => {
    expect(
      component.isAchieved({
        level: 1,
        unlockedAt: '2026-01-01T00:00:00Z',
        reward: 'Skin',
        description: 'First',
      }),
    ).toBe(true);
    expect(
      component.isAchieved({ level: 2, unlockedAt: null, reward: 'Skin', description: 'Second' }),
    ).toBe(false);
  });

  it('should identify current milestone by level', () => {
    // Default level is 0 (no familiar loaded)
    expect(component.isCurrent({ level: 0, unlockedAt: null, reward: '', description: '' })).toBe(
      true,
    );
    expect(component.isCurrent({ level: 5, unlockedAt: null, reward: '', description: '' })).toBe(
      false,
    );
  });

  it('should format valid date strings', () => {
    const result = component.formatDate('2026-06-15T09:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return empty string for null date', () => {
    expect(component.formatDate(null)).toBe('');
  });

  it('should return original string for unparseable date', () => {
    const result = component.formatDate('not-a-date');
    expect(result).toBeTruthy();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Branch-coverage augmentation: drive uncovered conditional arms via the
  // shared FamiliarService signals. ngOnInit fires a loadProfile() GraphQL
  // POST that we flush through HttpTestingController so the success/error/
  // not_summoned template arms + the derived computeds are all exercised.
  // -------------------------------------------------------------------------
  describe('branch coverage (service-driven)', () => {
    const GRAPHQL_URL = 'https://api.chora.site/api/v1/graphql';

    let svc: FamiliarService;
    let httpMock: HttpTestingController;
    let cmpFixture: ComponentFixture<EvolutionTimelineComponent>;
    let cmp: EvolutionTimelineComponent;
    let el: HTMLElement;

    /** GraphQL myFamiliar payload (GqlFamiliar shape) at the given level. */
    function gqlFamiliar(level: number): GqlFamiliar {
      return {
        id: 'fam-1',
        gcid: 'gcid-1',
        name: 'Sparky',
        species: 'fox',
        personality: 'curious',
        level,
        xp: 0,
        mood: 'happy',
        avatarUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
    }

    function milestone(
      level: number,
      unlockedAt: string | null,
      reward = 'Reward',
      description = 'Desc',
    ): EvolutionMilestone {
      return { level, unlockedAt, reward, description };
    }

    beforeEach(() => {
      svc = TestBed.inject(FamiliarService);
      svc.resetState();
      httpMock = TestBed.inject(HttpTestingController);
    });

    /** Creates a fresh component (firing ngOnInit -> loadProfile POST) and
     *  flushes EVERY pending GraphQL request (the outer beforeEach component's
     *  loadProfile plus this one's) with the supplied myFamiliar payload, then
     *  triggers change detection. Flushing all avoids an expectOne ambiguity
     *  because the outer suite-level beforeEach already created a component. */
    function createAndFlush(myFamiliar: unknown): void {
      cmpFixture = TestBed.createComponent(EvolutionTimelineComponent);
      cmp = cmpFixture.componentInstance;
      el = cmpFixture.nativeElement as HTMLElement;
      // First detectChanges fires this component's ngOnInit -> loadProfile(),
      // which sets state to 'loading' and issues the GraphQL request. Flushing
      // BEFORE this would let ngOnInit overwrite the resolved state back to
      // 'loading' on the subsequent detectChanges.
      cmpFixture.detectChanges();
      const reqs = httpMock.match(GRAPHQL_URL);
      expect(reqs.length).toBeGreaterThan(0);
      for (const req of reqs) {
        expect(req.request.method).toBe('POST');
        req.flush({ data: { myFamiliar } });
      }
      // Second detectChanges renders the now-resolved state.
      cmpFixture.detectChanges();
    }

    // --- nextMilestone -----------------------------------------------------

    it('nextMilestone returns the first not-yet-unlocked entry (find hit)', () => {
      createAndFlush(null);
      svc.milestones.set([
        milestone(1, '2026-01-01T00:00:00Z'),
        milestone(2, null),
        milestone(3, null),
      ]);
      expect(cmp.nextMilestone()?.level).toBe(2);
    });

    it('nextMilestone returns null when every milestone is unlocked (?? null arm)', () => {
      createAndFlush(null);
      svc.milestones.set([
        milestone(1, '2026-01-01T00:00:00Z'),
        milestone(2, '2026-02-01T00:00:00Z'),
      ]);
      expect(cmp.nextMilestone()).toBeNull();
    });

    // --- progressPercent ---------------------------------------------------

    it('progressPercent uses level-1 prevLevel when next.level > 1 (ternary true arm)', () => {
      // profile level 2, next.level 3 -> prevLevel 2, range 1,
      // progress = ((2-2)/1)*100 = 0.
      createAndFlush(gqlFamiliar(2));
      svc.milestones.set([milestone(2, '2026-01-01T00:00:00Z'), milestone(3, null)]);
      expect(cmp.currentLevel()).toBe(2);
      expect(cmp.nextMilestone()?.level).toBe(3);
      expect(cmp.progressPercent()).toBe(0);
    });

    it('progressPercent uses 0 prevLevel when next.level == 1 (ternary false arm) and clamps to 99', () => {
      // next.level 1 -> prevLevel 0, range 1. profile level 5 ->
      // progress = ((5-0)/1)*100 = 500 -> upper clamp 99.
      createAndFlush(gqlFamiliar(5));
      svc.milestones.set([milestone(1, null)]);
      expect(cmp.nextMilestone()?.level).toBe(1);
      expect(cmp.progressPercent()).toBe(99);
    });

    it('progressPercent clamps negative raw progress up to 0 (lower clamp)', () => {
      // next.level 3 -> prevLevel 2, range 1. profile level 1 ->
      // progress = ((1-2)/1)*100 = -100 -> lower clamp 0.
      createAndFlush(gqlFamiliar(1));
      svc.milestones.set([milestone(2, '2026-01-01T00:00:00Z'), milestone(3, null)]);
      expect(cmp.nextMilestone()?.level).toBe(3);
      expect(cmp.progressPercent()).toBe(0);
    });

    it('progressPercent returns 0 when computed range is non-positive (range <= 0 guard)', () => {
      // next.level 0 -> prevLevel 0 (0 is not > 1), range 0 -> guard returns 0.
      createAndFlush(gqlFamiliar(3));
      svc.milestones.set([milestone(0, null)]);
      expect(cmp.nextMilestone()?.level).toBe(0);
      expect(cmp.progressPercent()).toBe(0);
    });

    // --- isCurrent (non-zero level) ---------------------------------------

    it('isCurrent is true/false against a non-zero loaded level', () => {
      createAndFlush(gqlFamiliar(3));
      expect(cmp.currentLevel()).toBe(3);
      expect(cmp.isCurrent(milestone(3, null))).toBe(true);
      expect(cmp.isCurrent(milestone(2, null))).toBe(false);
    });

    // --- formatDate catch arm ---------------------------------------------

    it('formatDate returns the original string when toLocaleDateString throws (catch arm)', () => {
      createAndFlush(null);
      const original = Date.prototype.toLocaleDateString;
      Date.prototype.toLocaleDateString = function () {
        throw new Error('locale boom');
      };
      try {
        expect(cmp.formatDate('2026-01-15T00:00:00Z')).toBe('2026-01-15T00:00:00Z');
      } finally {
        Date.prototype.toLocaleDateString = original;
      }
    });

    it('formatDate returns empty string for an empty string input (falsy arm)', () => {
      createAndFlush(null);
      expect(cmp.formatDate('')).toBe('');
    });

    // --- lifecycle ---------------------------------------------------------

    it('unsubscribes on destroy without throwing', () => {
      createAndFlush(null);
      expect(() => cmpFixture.destroy()).not.toThrow();
    });

    // --- template: error state --------------------------------------------

    it('renders the error state when loadProfile fails', () => {
      cmpFixture = TestBed.createComponent(EvolutionTimelineComponent);
      el = cmpFixture.nativeElement as HTMLElement;
      cmpFixture.detectChanges(); // fire ngOnInit -> loadProfile request
      const reqs = httpMock.match(GRAPHQL_URL);
      expect(reqs.length).toBeGreaterThan(0);
      for (const req of reqs) {
        req.flush(
          { errors: [{ message: 'boom' }] },
          new HttpErrorResponse({ status: 500, statusText: 'Server Error' }),
        );
      }
      cmpFixture.detectChanges();
      expect(svc.state().status).toBe('error');
      expect(el.querySelector('[data-testid="evolution-error"]')).toBeTruthy();
    });

    // --- template: not_summoned -------------------------------------------

    it('renders the not_summoned empty state when myFamiliar is null', () => {
      createAndFlush(null);
      expect(svc.state().status).toBe('not_summoned');
      expect(el.querySelector('[data-testid="evolution-empty"]')).toBeTruthy();
    });

    // --- template: success with milestones --------------------------------

    it('renders the success timeline with a list item per milestone', () => {
      createAndFlush(gqlFamiliar(2));
      svc.milestones.set([
        milestone(1, '2026-01-01T00:00:00Z', 'Badge', 'First step'),
        milestone(2, '2026-02-01T00:00:00Z', '', 'Second step'), // empty reward -> @if(reward) false arm
        milestone(3, null, 'Crown', 'Locked step'),
      ]);
      cmpFixture.detectChanges();

      expect(el.querySelector('[data-testid="evolution-current-level"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="evolution-progress"]')).toBeTruthy();
      expect(el.querySelectorAll('.evolution-timeline__item').length).toBe(3);
      // achieved -> date span; unlocked === null -> locked span
      expect(
        el.querySelector('[data-testid="evolution-milestone-1"] [data-testid="milestone-date"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="evolution-milestone-3"] [data-testid="milestone-locked"]'),
      ).toBeTruthy();
      // empty reward -> reward span omitted
      expect(
        el.querySelector('[data-testid="evolution-milestone-2"] [data-testid="milestone-reward"]'),
      ).toBeNull();
    });

    // --- template: success without milestones (@else arm) -----------------

    it('renders the no-milestones empty block when the list is empty (@else arm)', () => {
      createAndFlush(gqlFamiliar(1));
      svc.milestones.set([]);
      cmpFixture.detectChanges();
      expect(el.querySelector('[data-testid="evolution-no-milestones"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="evolution-progress"]')).toBeNull();
    });
  });
});
