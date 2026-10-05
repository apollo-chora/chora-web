import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SurveyService } from './survey.service';

/**
 * CHO-2353: rewritten against the contract chora-delivery actually serves.
 *
 * The previous version of this file asserted an imagined API (a `data`
 * envelope, `status: draft|published|archived` on the wire, POST /{id}/respond,
 * and a /{id}/analytics endpoint). Those assertions were green while the
 * feature was broken in production, because they pinned the frontend's own
 * invention rather than the backend. Wire-shape mapping is covered in
 * survey-wire-contract.spec.ts; this file covers state transitions and the
 * computed signals.
 *
 * The admin operations (create / update / delete / publish / list-responses)
 * were removed from this learner-facing service: none were called, several
 * targeted routes that do not exist, and R+ owns the admin surface.
 */

const wireSurvey = {
  id: 'srv-1',
  title: 'Post-Course Feedback',
  state: 'DISTRIBUTED',
  course_id: 'crs-1',
  questions: [
    { question_id: 'q-1', prompt: 'How satisfied were you?', type: 'LIKERT' },
  ],
};

describe('SurveyService', () => {
  let service: SurveyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SurveyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadSurveys', () => {
    it('should set loading then success state', () => {
      service.loadSurveys().subscribe();
      expect(service.surveyListState().status).toBe('loading');

      httpMock.expectOne(r => r.url.includes('/api/v1/surveys') && r.method === 'GET')
        .flush({ items: [wireSurvey] });

      expect(service.surveyListState().status).toBe('success');
      expect(service.surveys().length).toBe(1);
      expect(service.surveys()[0].id).toBe('srv-1');
      expect(service.surveys()[0].status).toBe('published');
    });

    it('should set error state on failure', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys'))
        .flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.surveyListState().status).toBe('error');
    });

    it('should replace (not append to) the previously-loaded list', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush({ items: [wireSurvey] });
      expect(service.surveys().length).toBe(1);

      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET')
        .flush({ items: [{ ...wireSurvey, id: 'srv-2' }] });

      expect(service.surveys().length).toBe(1);
      expect(service.surveys()[0].id).toBe('srv-2');
    });
  });

  describe('loadSurveyDetail', () => {
    it('should set loading then success state with questions', () => {
      service.loadSurveyDetail('srv-1').subscribe();
      expect(service.surveyDetailState().status).toBe('loading');

      httpMock.expectOne(r => r.url.includes('/api/v1/surveys/srv-1') && r.method === 'GET')
        .flush(wireSurvey);

      expect(service.surveyDetailState().status).toBe('success');
      expect(service.surveyDetail()?.questions.length).toBe(1);
      expect(service.surveyDetail()?.questions[0].question_text).toBe('How satisfied were you?');
    });

    it('should set error state on failure', () => {
      service.loadSurveyDetail('srv-1').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys/srv-1'))
        .flush('Error', { status: 404, statusText: 'Not Found' });
      expect(service.surveyDetailState().status).toBe('error');
    });
  });

  describe('submitResponse', () => {
    it('should POST and set success state', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 5 } }).subscribe();
      expect(service.responseState().status).toBe('loading');

      httpMock
        .expectOne(r => r.url.includes('/api/v1/surveys/srv-1/responses') && r.method === 'POST')
        .flush({ id: 'resp-1', survey_id: 'srv-1', gcid: 'gcid-1', answers: [] });

      expect(service.responseState().status).toBe('success');
    });

    it('should set error state on conflict (already responded)', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 5 } }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys/srv-1/responses'))
        .flush('Conflict', { status: 409, statusText: 'Conflict' });
      expect(service.responseState().status).toBe('error');
    });
  });

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys')).flush({ items: [] });
      expect(service.surveyListState().status).toBe('success');

      service.resetState();

      expect(service.surveyListState().status).toBe('idle');
      expect(service.surveyDetailState().status).toBe('idle');
      expect(service.responseState().status).toBe('idle');
    });
  });

  describe('computed signals', () => {
    it('publishedSurveys should filter by published status', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush({
        items: [
          { ...wireSurvey, id: 'a', state: 'DISTRIBUTED' },
          { ...wireSurvey, id: 'b', state: 'DRAFT' },
          { ...wireSurvey, id: 'c', state: 'CLOSED' },
        ],
      });
      expect(service.publishedSurveys().map(s => s.id)).toEqual(['a']);
    });

    it('surveys should return [] when list state is not success (idle)', () => {
      expect(service.surveys()).toEqual([]);
    });

    it('publishedSurveys should return [] when surveys is empty (idle)', () => {
      expect(service.publishedSurveys()).toEqual([]);
    });

    it('surveyDetail should return null when detail state is not success (idle)', () => {
      expect(service.surveyDetail()).toBeNull();
    });
  });
});
