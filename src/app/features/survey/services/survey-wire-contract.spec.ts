import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SurveyService } from './survey.service';

/**
 * CHO-2353 - the A+ survey feature was authored against a contract chora-delivery
 * never implemented. The real wire shape (verified live 2026-07-23) is:
 *
 *   { items: [ { id, title, course_id, state: DRAFT|DISTRIBUTED|CLOSED,
 *                questions: [ { question_id, prompt, type: LIKERT|TEXT|MCQ } ],
 *                distributed_to, response_count, created_at, updated_at } ] }
 *
 * The FE model expected `data`, `status: draft|published|archived`, `question_text`,
 * `question_type: rating|text|multiple_choice|scale` and `id` on questions. The
 * mismatch meant the list filtered to nothing and the respond form matched no
 * question-type branch, so it rendered question NUMBERS with no prompts and no
 * inputs: a learner could not answer at all.
 *
 * These tests pin the service as the adapter seam that translates wire -> model.
 * The templates are already correct and must not be touched.
 */

const wireSurvey = {
  id: 'srv-1',
  tenant_id: 'tnt-1',
  course_id: 'crs-1',
  title: 'Post-Course Satisfaction',
  state: 'DISTRIBUTED',
  distributed_to: ['gcid-1'],
  response_count: 1,
  created_at: '2026-07-23T15:37:00Z',
  updated_at: '2026-07-23T15:38:29Z',
  questions: [
    { question_id: 'q-1', prompt: 'How satisfied were you overall?', type: 'LIKERT' },
    { question_id: 'q-2', prompt: 'What would you change?', type: 'TEXT' },
    { question_id: 'q-3', prompt: 'Pick one', type: 'MCQ' },
  ],
};

describe('SurveyService wire contract (CHO-2353)', () => {
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

  describe('loadSurveys', () => {
    it('reads the items envelope, not data', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys') && r.method === 'GET')
        .flush({ items: [wireSurvey] });

      expect(service.surveyListState().status).toBe('success');
      expect(service.surveys().length).toBe(1);
      expect(service.surveys()[0].id).toBe('srv-1');
      expect(service.surveys()[0].title).toBe('Post-Course Satisfaction');
    });

    it('maps the backend state FSM onto the filter vocabulary', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush({
        items: [
          { ...wireSurvey, id: 'a', state: 'DRAFT' },
          { ...wireSurvey, id: 'b', state: 'DISTRIBUTED' },
          { ...wireSurvey, id: 'c', state: 'CLOSED' },
        ],
      });

      const byId = Object.fromEntries(service.surveys().map(s => [s.id, s.status]));
      expect(byId['a']).toBe('draft');
      expect(byId['b']).toBe('published');
      expect(byId['c']).toBe('archived');
    });

    it('derives question_count from the questions array', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush({ items: [wireSurvey] });
      expect(service.surveys()[0].question_count).toBe(3);
    });

    it('tolerates a missing items array without throwing', () => {
      service.loadSurveys().subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush({});
      expect(service.surveyListState().status).toBe('success');
      expect(service.surveys()).toEqual([]);
    });
  });

  describe('loadSurveyDetail', () => {
    it('maps question_id/prompt/type onto id/question_text/question_type', () => {
      service.loadSurveyDetail('srv-1').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/surveys/srv-1') && r.method === 'GET')
        .flush(wireSurvey);

      const st = service.surveyDetailState();
      expect(st.status).toBe('success');
      const qs = st.status === 'success' ? st.survey.questions : [];

      expect(qs[0].id).toBe('q-1');
      expect(qs[0].question_text).toBe('How satisfied were you overall?');
      // LIKERT is a 1-5 rating, which is the template's `rating` control.
      expect(qs[0].question_type).toBe('rating');

      expect(qs[1].id).toBe('q-2');
      expect(qs[1].question_text).toBe('What would you change?');
      expect(qs[1].question_type).toBe('text');

      expect(qs[2].question_type).toBe('multiple_choice');
    });

    it('gives every question a stable order_index so the form renders in order', () => {
      service.loadSurveyDetail('srv-1').subscribe();
      httpMock.expectOne(r => r.method === 'GET').flush(wireSurvey);
      const st = service.surveyDetailState();
      const qs = st.status === 'success' ? st.survey.questions : [];
      expect(qs.map(q => q.order_index)).toEqual([0, 1, 2]);
    });

    it('never yields an undefined question_type, which silently renders no input', () => {
      service.loadSurveyDetail('srv-1').subscribe();
      httpMock.expectOne(r => r.method === 'GET')
        .flush({ ...wireSurvey, questions: [{ question_id: 'q-x', prompt: 'Odd', type: 'SOMETHING_NEW' }] });
      const st = service.surveyDetailState();
      const qs = st.status === 'success' ? st.survey.questions : [];
      // An unknown wire type must degrade to a usable control, never undefined.
      expect(qs[0].question_type).toBe('text');
    });
  });

  describe('submitResponse', () => {
    it('POSTs to /responses, not the non-existent /respond', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 5 } }).subscribe();
      const req = httpMock.expectOne(r => r.method === 'POST');
      expect(req.request.url).toContain('/api/v1/surveys/srv-1/responses');
      expect(req.request.url).not.toContain('/respond');
      req.flush({ id: 'resp-1', survey_id: 'srv-1', gcid: 'gcid-1', answers: [] });
    });

    it('converts the answers record into the wire array of {question_id, value}', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 5, 'q-2': 'more recap please' } }).subscribe();
      const req = httpMock.expectOne(r => r.method === 'POST');

      expect(Array.isArray(req.request.body.answers)).toBe(true);
      const sent = [...req.request.body.answers].sort(
        (a: { question_id: string }, b: { question_id: string }) =>
          a.question_id.localeCompare(b.question_id),
      );
      expect(sent).toEqual([
        { question_id: 'q-1', value: '5' },
        { question_id: 'q-2', value: 'more recap please' },
      ]);
      req.flush({ id: 'resp-1' });
    });

    it('stringifies values, because the wire contract is value:string', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 4 } }).subscribe();
      const req = httpMock.expectOne(r => r.method === 'POST');
      expect(typeof req.request.body.answers[0].value).toBe('string');
      req.flush({ id: 'resp-1' });
    });

    it('omits unanswered questions rather than sending null', () => {
      service.submitResponse('srv-1', { answers: { 'q-1': 5, 'q-2': null } }).subscribe();
      const req = httpMock.expectOne(r => r.method === 'POST');
      expect(req.request.body.answers.map((a: { question_id: string }) => a.question_id)).toEqual(['q-1']);
      req.flush({ id: 'resp-1' });
    });
  });
});
