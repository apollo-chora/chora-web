import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AppealTimelineComponent } from './appeal-timeline.component';
import type {
  AppealTimeline,
  AppealStage,
} from '../../../admin/governance/models/escalation.model';

const URL = 'https://api.chora.site/api/v1/identity/appeals/status';

function buildTimeline(stages: AppealStage[], idx = 0): AppealTimeline {
  return {
    appeal_id: 'appeal-1',
    restriction_id: 'restriction-1',
    stages,
    current_stage_index: idx,
  };
}

describe('AppealTimelineComponent', () => {
  let component: AppealTimelineComponent;
  let fixture: ComponentFixture<AppealTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppealTimelineComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppealTimelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="appeal-timeline"]');
    expect(el).toBeTruthy();
  });

  it('should format date with null as dash', () => {
    expect(component.formatDate(null)).toBe('-');
  });

  it('should return correct decision class', () => {
    expect(component.decisionClass('upheld')).toBe('appeal-timeline__decision--upheld');
    expect(component.decisionClass('overturned')).toBe('appeal-timeline__decision--overturned');
    expect(component.decisionClass(null)).toBe('');
  });

  it('should correctly identify resolved stages', () => {
    expect(
      component.isResolved({
        label_key: 'test',
        status: 'completed',
        date: '2026-01-01',
        notes: null,
        decision: 'upheld',
      }),
    ).toBe(true);

    expect(
      component.isResolved({
        label_key: 'test',
        status: 'active',
        date: '2026-01-01',
        notes: null,
        decision: null,
      }),
    ).toBe(false);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Initial loading state branch (loadTimeline fires on ngOnInit)
  // ---------------------------------------------------------------------------

  describe('initial load lifecycle', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      // The top-level beforeEach already created `fixture` + called
      // detectChanges() -> ngOnInit -> loadTimeline -> a single pending GET.
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('should enter loading state and issue GET on init', () => {
      expect(component.isLoading()).toBe(true);
      expect(component.isError()).toBe(false);
      // timeline() falsy branch (state not success) -> stages [] + currentStageIndex -1
      expect(component.timeline()).toBeNull();
      expect(component.stages()).toEqual([]);
      expect(component.currentStageIndex()).toBe(-1);
      const req = httpMock.expectOne(URL);
      expect(req.request.method).toBe('GET');
      req.flush(buildTimeline([]));
    });

    it('should populate success state when GET resolves (next callback)', () => {
      const timeline = buildTimeline(
        [
          {
            label_key: 'governance.appeal_stage_submitted',
            status: 'completed',
            date: '2026-01-01',
            notes: 'submitted note',
            decision: null,
          },
          {
            label_key: 'governance.appeal_stage_resolved',
            status: 'completed',
            date: '2026-02-01',
            notes: null,
            decision: 'overturned',
          },
        ],
        1,
      );
      httpMock.expectOne(URL).flush(timeline);
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.isError()).toBe(false);
      // timeline() truthy branch + ?. present branch + ?? through (non-default)
      expect(component.timeline()).toEqual(timeline);
      expect(component.stages().length).toBe(2);
      expect(component.currentStageIndex()).toBe(1);
    });

    it('should enter error state when GET fails (error callback)', () => {
      httpMock.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.isError()).toBe(true);
      expect(component.isLoading()).toBe(false);
      // success branch of timeline() not taken -> derived defaults still apply
      expect(component.timeline()).toBeNull();
      expect(component.stages()).toEqual([]);
      expect(component.currentStageIndex()).toBe(-1);

      const s = component.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('APPEAL_TIMELINE_LOAD_FAILED');
      }
    });

    it('should re-issue GET when loadTimeline called manually', () => {
      // satisfy the init GET first
      httpMock.expectOne(URL).flush(buildTimeline([]));
      fixture.detectChanges();

      component.loadTimeline();
      expect(component.isLoading()).toBe(true);
      httpMock.expectOne(URL).flush(buildTimeline([]));
    });

    it('should unsubscribe on destroy without error', () => {
      httpMock.expectOne(URL).flush(buildTimeline([]));
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // stageClass — three arms (completed / active / pending-default)
  // ---------------------------------------------------------------------------

  describe('stageClass', () => {
    const base = 'appeal-timeline__stage';

    it('should return completed class for completed status', () => {
      const stage: AppealStage = {
        label_key: 'k',
        status: 'completed',
        date: null,
        notes: null,
        decision: null,
      };
      expect(component.stageClass(stage, 0)).toBe(`${base} ${base}--completed`);
    });

    it('should return active class for active status', () => {
      const stage: AppealStage = {
        label_key: 'k',
        status: 'active',
        date: null,
        notes: null,
        decision: null,
      };
      expect(component.stageClass(stage, 1)).toBe(`${base} ${base}--active`);
    });

    it('should return pending class for pending status (default arm)', () => {
      const stage: AppealStage = {
        label_key: 'k',
        status: 'pending',
        date: null,
        notes: null,
        decision: null,
      };
      expect(component.stageClass(stage, 2)).toBe(`${base} ${base}--pending`);
    });
  });

  // ---------------------------------------------------------------------------
  // formatDate — non-null success path
  // ---------------------------------------------------------------------------

  describe('formatDate', () => {
    it('should format a valid ISO string via toLocaleDateString', () => {
      const out = component.formatDate('2026-01-15T00:00:00.000Z');
      expect(out).not.toBe('-');
      expect(out).toBe(new Date('2026-01-15T00:00:00.000Z').toLocaleDateString());
    });
  });

  // ---------------------------------------------------------------------------
  // isResolved — completed-but-no-decision arm (&& short-circuit on right)
  // ---------------------------------------------------------------------------

  describe('isResolved short-circuit', () => {
    it('should be false when completed but decision is null', () => {
      expect(
        component.isResolved({
          label_key: 'k',
          status: 'completed',
          date: null,
          notes: null,
          decision: null,
        }),
      ).toBe(false);
    });

    it('should be false when pending regardless of decision', () => {
      expect(
        component.isResolved({
          label_key: 'k',
          status: 'pending',
          date: null,
          notes: null,
          decision: 'upheld',
        }),
      ).toBe(false);
    });
  });
});
