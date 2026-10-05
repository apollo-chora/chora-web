/**
 * Replay one run by id (D1 tail, over subagent5's `handleGetRitualRun`).
 *
 * The history list showed a status and a mana figure and nothing else: an old
 * run's STORY, the "what I did and why" the learner is actually owed, was
 * unreachable once a newer run replaced it in the result panel. The list read
 * is capped at 50 and ordered newest-first, so an older run is not addressable
 * there at all, which is exactly why the single read exists.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { FamiliarRitualService } from './familiar-ritual.service';
import { environment } from '../../../environments/environment';

const FID = '00000000-0000-7000-8000-00000000e1a0';
const RID = 'r1';
const RUN = 'run-7';
const url = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}/rituals/${RID}/runs/${RUN}`;

function runBody(over: Record<string, unknown> = {}) {
  return {
    runId: RUN,
    ritualId: RID,
    revisionNo: 2,
    status: 'completed',
    manaCharged: 35,
    startedAt: '2026-09-02T00:00:00Z',
    completedAt: '2026-09-02T00:00:05Z',
    story: {
      title: 'Warm-up',
      status: 'completed',
      manaCost: 35,
      steps: [{ title: 'Socratic Drill', summary: 'asked three questions', sources: ['Atom 12'] }],
    },
    ...over,
  };
}

describe('FamiliarRitualService.getRun', () => {
  let svc: FamiliarRitualService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FamiliarRitualService],
    });
    svc = TestBed.inject(FamiliarRitualService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('reads ONE run by id rather than paging the capped list', () => {
    let got: unknown = null;
    svc.getRun(FID, RID, RUN).subscribe((r) => (got = r));

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    req.flush(runBody());

    expect(got).toMatchObject({ runId: RUN, status: 'completed', manaCharged: 35 });
  });

  it('carries the story through, sources included', () => {
    let got: { story?: { steps: readonly { sources?: readonly string[] }[] } } | null = null;
    svc.getRun(FID, RID, RUN).subscribe((r) => (got = r as never));
    httpMock.expectOne(url).flush(runBody());

    expect(got!.story!.steps[0].sources).toEqual(['Atom 12']);
  });

  it('encodes the ids rather than pasting them into the path', () => {
    // A run id is server-minted, but the familiar id reaches here from a route
    // param, so it is not this layer's business to assume it is clean.
    svc.getRun('a/b', RID, RUN).subscribe({ error: () => undefined });
    httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/a%2Fb/rituals/${RID}/runs/${RUN}`,
    ).flush(runBody());
  });

  it('THROWS on a malformed body rather than handing back a half-run', () => {
    // The panel renders whatever it is given. A body missing runId would render
    // as a blank story that looks like a run with nothing in it, which is a
    // confident false claim about the learner's history.
    let err: unknown = null;
    svc.getRun(FID, RID, RUN).subscribe({ error: (e) => (err = e) });
    httpMock.expectOne(url).flush({ nonsense: true });

    expect(err).toBeInstanceOf(Error);
  });
});
