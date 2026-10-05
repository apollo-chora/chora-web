import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SatisfactionSurveyComponent } from './satisfaction-survey.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { SatisfactionSurvey } from '../../models/support.model';

const BASE = 'https://api.chora.site';
const TICKET_ID = 'ticket-1';
const DETAIL_URL = `${BASE}/api/v1/support/tickets/${TICKET_ID}`;
const SATISFACTION_URL = `${BASE}/api/v1/support/tickets/${TICKET_ID}/satisfaction`;

function makeSurvey(over: Partial<SatisfactionSurvey> = {}): SatisfactionSurvey {
  return {
    id: 'sat-1',
    ticket_id: TICKET_ID,
    respondent_gcid: 'gcid-1',
    rating: 5,
    comment: null,
    created_at: '2026-06-04T00:00:00Z',
    ...over,
  };
}

describe('SatisfactionSurveyComponent', () => {
  let component: SatisfactionSurveyComponent;
  let fixture: ComponentFixture<SatisfactionSurveyComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SatisfactionSurveyComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SatisfactionSurveyComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('ticketId', TICKET_ID);
    fixture.detectChanges();
  });

  // ngOnInit fires a GET to load the ticket detail on detectChanges; flush it
  // so each test starts from a clean HTTP slate, then verify no leftover calls.
  function flushDetailLoad(): void {
    const req = httpMock.expectOne(DETAIL_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ id: TICKET_ID, responses: [] });
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    flushDetailLoad();
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    flushDetailLoad();
    const el = fixture.nativeElement.querySelector('[data-testid="satisfaction-survey"]');
    expect(el).toBeTruthy();
  });

  it('should set rating', () => {
    flushDetailLoad();
    expect(component.selectedRating()).toBe(0);
    component.setRating(4);
    expect(component.selectedRating()).toBe(4);
  });

  it('should validate requires rating', () => {
    flushDetailLoad();
    expect(component.isValid()).toBe(false);
    component.setRating(3);
    expect(component.isValid()).toBe(true);
  });

  it('should return rating labels', () => {
    flushDetailLoad();
    expect(component.ratingLabel(1)).toBe('support.rating_very_dissatisfied');
    expect(component.ratingLabel(5)).toBe('support.rating_very_satisfied');
  });

  // --- ratingLabel: the `?? ''` nullish-coalescing falsy arm ---
  it('should return empty string for an unknown rating (?? fallback arm)', () => {
    flushDetailLoad();
    expect(component.ratingLabel(0)).toBe('');
    expect(component.ratingLabel(99)).toBe('');
    expect(component.ratingLabel(2)).toBe('support.rating_dissatisfied');
    expect(component.ratingLabel(3)).toBe('support.rating_neutral');
    expect(component.ratingLabel(4)).toBe('support.rating_satisfied');
  });

  // --- updateComment writes the signal ---
  it('should update the comment signal', () => {
    flushDetailLoad();
    expect(component.comment()).toBe('');
    component.updateComment('great service');
    expect(component.comment()).toBe('great service');
  });

  // --- submitSurvey: `if (!this.isValid()) return;` early-return (rating === 0) ---
  it('should NOT submit when invalid (early return, no HTTP call)', () => {
    flushDetailLoad();
    // selectedRating defaults to 0 → isValid() false → early return.
    component.submitSurvey();
    // No satisfaction POST should be issued.
    httpMock.expectNone(SATISFACTION_URL);
    expect(component.submitted()).toBe(false);
  });

  // --- submitSurvey: valid path, comment present (`comment() || undefined` THROUGH arm),
  //     result truthy (`if (result)` THROUGH arm) ---
  it('should submit with a comment and mark submitted on a truthy result', () => {
    flushDetailLoad();
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.setRating(4);
    component.updateComment('helpful agent');
    component.submitSurvey();

    const req = httpMock.expectOne(SATISFACTION_URL);
    expect(req.request.method).toBe('POST');
    // comment() is truthy → forwarded as-is (not undefined).
    expect(req.request.body).toEqual({ rating: 4, comment: 'helpful agent' });

    req.flush(makeSurvey({ rating: 4, comment: 'helpful agent' }));

    expect(component.submitted()).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('support.satisfaction_submitted', 'success');
  });

  // --- submitSurvey: valid path, comment empty (`comment() || undefined` SHORT-CIRCUIT arm) ---
  it('should submit with comment undefined when the comment is empty', () => {
    flushDetailLoad();
    component.setRating(5);
    // comment() stays '' (falsy) → `'' || undefined` → undefined.
    component.submitSurvey();

    const req = httpMock.expectOne(SATISFACTION_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ rating: 5, comment: undefined });

    req.flush(makeSurvey({ rating: 5 }));
    expect(component.submitted()).toBe(true);
  });

  // --- submitSurvey: result falsy (`if (result)` FALSE arm) ---
  // The service catchError returns of(null) on HTTP error, so `result` is null.
  it('should NOT mark submitted when the result is null (error → of(null))', () => {
    flushDetailLoad();
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.setRating(2);
    component.submitSurvey();

    const req = httpMock.expectOne(SATISFACTION_URL);
    expect(req.request.method).toBe('POST');
    // Force the service's catchError → of(null) → next(null) → `if (result)` false.
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    expect(component.submitted()).toBe(false);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  // --- ngOnDestroy unsubscribes (exercises the OnDestroy branch path) ---
  it('should unsubscribe on destroy without error', () => {
    flushDetailLoad();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('should have no critical accessibility violations', async () => {
    flushDetailLoad();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
