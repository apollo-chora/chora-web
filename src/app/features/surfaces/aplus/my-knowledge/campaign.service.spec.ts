import { TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { environment } from '../../../../../environments/environment';
import {
  CampaignService,
  campaignErrorCode,
  campaignErrorKey,
} from './campaign.service';
import type { CampaignSealResult } from './campaign.model';

const BFF = environment.bffBaseUrl;
const GOAL = 'goal-1';
const FOCUS = `${BFF}/api/v1/me/goals/${GOAL}/campaign/focus`;
const SEAL = `${BFF}/api/v1/me/goals/${GOAL}/campaign/seal`;
const MERGE = (id: string) =>
  `${BFF}/api/v1/me/concept-graph/concepts/${id}/merge`;
const SPLIT = (id: string) =>
  `${BFF}/api/v1/me/concept-graph/concepts/${id}/split`;

/** Build an interceptor-less HTTP error (spec context — body rides on `.error`). */
function httpErr(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('CampaignService', () => {
  let service: CampaignService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CampaignService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── setFocus (March here / clear) ─────────────────────────────────────
  it('setFocus POSTs the conceptId and resolves the focus result', () => {
    let result: { goalId: string; focusConceptId?: string } | undefined;
    service.setFocus(GOAL, 'c-2').subscribe((r) => (result = r));

    const req = httpMock.expectOne(FOCUS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ conceptId: 'c-2' });
    req.flush({ goalId: GOAL, focusConceptId: 'c-2' });

    expect(result).toEqual({ goalId: GOAL, focusConceptId: 'c-2' });
  });

  it('setFocus(null) clears the focus (body carries a null conceptId)', () => {
    service.setFocus(GOAL, null).subscribe();
    const req = httpMock.expectOne(FOCUS);
    expect(req.request.body).toEqual({ conceptId: null });
    req.flush({ goalId: GOAL });
  });

  // ── seal ──────────────────────────────────────────────────────────────
  it('seal POSTs an empty body and resolves the seal result', () => {
    let result: CampaignSealResult | undefined;
    service.seal(GOAL).subscribe((r) => (result = r));

    const req = httpMock.expectOne(SEAL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      goalId: GOAL,
      sealedAt: '2026-07-10T00:00:00Z',
      isReseal: false,
      nodesWon: 5,
      personalCompletedAt: '2026-07-10T00:00:00Z',
    });

    expect(result?.nodesWon).toBe(5);
    expect(result?.isReseal).toBe(false);
  });

  // ── merge ───────────────────────────────────────────────────────────────
  it('merge POSTs the survivor into the absorbed-node path', () => {
    let result: { survivorConceptId: string } | undefined;
    service.merge('c-absorbed', 'c-survivor').subscribe((r) => (result = r));

    const req = httpMock.expectOne(MERGE('c-absorbed'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ survivorConceptId: 'c-survivor' });
    req.flush({
      survivorConceptId: 'c-survivor',
      absorbedConceptId: 'c-absorbed',
    });

    expect(result?.survivorConceptId).toBe('c-survivor');
  });

  // ── split ───────────────────────────────────────────────────────────────
  it('split POSTs the children + focusChildIndex and resolves child DTOs', () => {
    let children: readonly { conceptId: string }[] | undefined;
    service
      .split('c-parent', {
        children: [{ title: 'Left' }, { title: 'Right' }],
        focusChildIndex: 1,
      })
      .subscribe((r) => (children = r.children));

    const req = httpMock.expectOne(SPLIT('c-parent'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      children: [{ title: 'Left' }, { title: 'Right' }],
      focusChildIndex: 1,
    });
    req.flush({
      parentConceptId: 'c-parent',
      children: [
        { conceptId: 'c-l', title: 'Left', conceptKey: 'left' },
        { conceptId: 'c-r', title: 'Right', conceptKey: 'right' },
      ],
    });

    expect(children?.length).toBe(2);
    expect(children?.[0].conceptId).toBe('c-l');
  });

  it('split omits absent optional fields from the wire body', () => {
    service
      .split('c-parent', { children: [{ title: 'A' }, { title: 'B' }] })
      .subscribe();
    const req = httpMock.expectOne(SPLIT('c-parent'));
    expect(req.request.body).toEqual({
      children: [{ title: 'A' }, { title: 'B' }],
    });
    req.flush({ parentConceptId: 'c-parent', children: [] });
  });

  // ── error taxonomy — pure code extraction ───────────────────────────────
  it('campaignErrorCode extracts the code from a flat {code} error body', () => {
    expect(campaignErrorCode(httpErr(409, { code: 'FRONTIER_NOT_EMPTY' }))).toBe(
      'FRONTIER_NOT_EMPTY',
    );
  });

  it('campaignErrorCode extracts the code from a wrapped {error:{code}} body', () => {
    expect(
      campaignErrorCode(httpErr(422, { error: { code: 'CAMPAIGN_EMPTY' } })),
    ).toBe('CAMPAIGN_EMPTY');
  });

  it('campaignErrorCode is null when no code is present', () => {
    expect(campaignErrorCode(httpErr(500, 'boom'))).toBeNull();
    expect(campaignErrorCode(null)).toBeNull();
  });

  // ── error taxonomy — per-operation i18n key mapping ─────────────────────
  it('maps focus door codes to their i18n keys, else a focus fallback', () => {
    expect(campaignErrorKey('focus', httpErr(404, { code: 'CONCEPT_NOT_FOUND' }))).toBe(
      'aplus.knowledge.campaign_focus_err_not_found',
    );
    expect(
      campaignErrorKey('focus', httpErr(422, { code: 'FOCUS_OUTSIDE_CAMPAIGN' })),
    ).toBe('aplus.knowledge.campaign_focus_err_outside');
    expect(
      campaignErrorKey('focus', httpErr(422, { code: 'CAMPAIGN_NOT_ANCHORED' })),
    ).toBe('aplus.knowledge.campaign_focus_err_not_anchored');
    expect(campaignErrorKey('focus', httpErr(500, 'x'))).toBe(
      'aplus.knowledge.campaign_focus_err',
    );
  });

  it('maps seal door codes to their i18n keys, else a seal fallback', () => {
    expect(
      campaignErrorKey('seal', httpErr(409, { code: 'FRONTIER_NOT_EMPTY' })),
    ).toBe('aplus.knowledge.campaign_seal_frontier_not_empty');
    expect(campaignErrorKey('seal', httpErr(409, { code: 'SEAL_TOO_SOON' }))).toBe(
      'aplus.knowledge.campaign_seal_too_soon',
    );
    expect(
      campaignErrorKey('seal', httpErr(409, { code: 'SEAL_NO_NEW_WINS' })),
    ).toBe('aplus.knowledge.campaign_seal_no_new_wins');
    expect(campaignErrorKey('seal', httpErr(422, { code: 'CAMPAIGN_EMPTY' }))).toBe(
      'aplus.knowledge.campaign_seal_empty',
    );
    expect(campaignErrorKey('seal', httpErr(500, 'x'))).toBe(
      'aplus.knowledge.campaign_seal_err',
    );
  });

  it('maps merge door codes (root-immutable, ambiguity, deleted) to keys', () => {
    expect(campaignErrorKey('merge', httpErr(409, { code: 'ROOT_IMMUTABLE' }))).toBe(
      'aplus.knowledge.campaign_merge_err_root_immutable',
    );
    expect(
      campaignErrorKey('merge', httpErr(409, { code: 'MERGE_SPLIT_AMBIGUOUS' })),
    ).toBe('aplus.knowledge.campaign_merge_err_ambiguous');
    expect(
      campaignErrorKey('merge', httpErr(422, { code: 'CONCEPT_DELETED' })),
    ).toBe('aplus.knowledge.campaign_merge_err_deleted');
    expect(campaignErrorKey('merge', httpErr(500, 'x'))).toBe(
      'aplus.knowledge.campaign_merge_err',
    );
  });

  it('maps split door codes (too-few, duplicate, focus-child) to keys', () => {
    expect(campaignErrorKey('split', httpErr(422, { code: 'SPLIT_TOO_FEW' }))).toBe(
      'aplus.knowledge.campaign_split_err_too_few',
    );
    expect(
      campaignErrorKey('split', httpErr(422, { code: 'SPLIT_DUPLICATE_KEY' })),
    ).toBe('aplus.knowledge.campaign_split_err_duplicate');
    expect(
      campaignErrorKey('split', httpErr(422, { code: 'INVALID_FOCUS_CHILD' })),
    ).toBe('aplus.knowledge.campaign_split_err_focus_child');
    // A code shared with the merge door still resolves in split context.
    expect(campaignErrorKey('split', httpErr(404, { code: 'CONCEPT_NOT_FOUND' }))).toBe(
      'aplus.knowledge.campaign_merge_err_not_found',
    );
    expect(campaignErrorKey('split', httpErr(500, 'x'))).toBe(
      'aplus.knowledge.campaign_split_err',
    );
  });
});
