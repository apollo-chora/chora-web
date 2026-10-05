import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { FamiliarRitualService } from './familiar-ritual.service';
import { environment } from '../../../environments/environment';
import type { RitualListing, Ritual, RitualRun } from './familiar-ritual.model';

const FID = 'eira-001';
const RID = 'ritual-abc';

function sampleRitual(overrides: Partial<Ritual> = {}): Ritual {
  return {
    ritualId: RID,
    familiarId: FID,
    name: 'Morning Warm-up',
    trigger: 'manual',
    sink: 'chat',
    enabled: false,
    publishedPriceUnits: 20,
    currentRevision: 0,
    steps: [],
    createdAt: '2026-07-09T00:00:00Z',
    updatedAt: '2026-07-09T00:00:00Z',
    ...overrides,
  };
}

function sampleRun(overrides: Partial<RitualRun> = {}): RitualRun {
  return {
    runId: 'run-1',
    ritualId: RID,
    revisionNo: 1,
    status: 'completed',
    manaCharged: 20,
    startedAt: '2026-07-09T01:00:00Z',
    completedAt: '2026-07-09T01:00:02Z',
    ...overrides,
  };
}

describe('FamiliarRitualService', () => {
  let svc: FamiliarRitualService;
  let httpMock: HttpTestingController;
  const base = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}/rituals`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(FamiliarRitualService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listRituals GETs the rituals subtree and maps the envelope', () => {
    let out: RitualListing | null = null;
    svc.listRituals(FID).subscribe((r) => (out = r));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush({ rituals: [sampleRitual()], wiredSinks: ['chat'] });
    expect(out).not.toBeNull();
    expect(out!.rituals[0].ritualId).toBe(RID);
    // B3b: the composer greys from this, so the service must carry it through.
    expect(out!.wiredSinks).toEqual(['chat']);
  });

  it('listRituals reports NO wired sinks when the server serves none', () => {
    let out: RitualListing | null = null;
    svc.listRituals(FID).subscribe((r) => (out = r));
    httpMock.expectOne(base).flush({ rituals: [] });
    // Fail closed rather than defaulting to a client-side guess.
    expect(out!.wiredSinks).toEqual([]);
  });

  it('listRituals fails loud on a malformed response (no fabrication)', () => {
    let next: unknown = null;
    let err: unknown = null;
    svc.listRituals(FID).subscribe({ next: (r) => (next = r), error: (e) => (err = e) });
    httpMock.expectOne(base).flush({ wrong: 'shape' });
    expect(next).toBeNull();
    expect(err).not.toBeNull();
  });

  it('createRitual POSTs the camelCase draft body and returns the Ritual', () => {
    let out: Ritual | null = null;
    svc
      .createRitual(FID, { name: 'Warm-up', trigger: 'manual', sink: 'chat' })
      .subscribe((r) => (out = r));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Warm-up', trigger: 'manual', sink: 'chat' });
    req.flush(sampleRitual({ name: 'Warm-up' }));
    expect(out!.name).toBe('Warm-up');
  });

  it('getRitual GETs one ritual by id', () => {
    let out: Ritual | null = null;
    svc.getRitual(FID, RID).subscribe((r) => (out = r));
    const req = httpMock.expectOne(`${base}/${RID}`);
    expect(req.request.method).toBe('GET');
    req.flush(sampleRitual());
    expect(out!.ritualId).toBe(RID);
  });

  it('publishRitual POSTs steps to /publish and returns the updated Ritual', () => {
    let out: Ritual | null = null;
    svc
      .publishRitual(FID, RID, { steps: [{ skillKey: 'weakness_sight' }] })
      .subscribe((r) => (out = r));
    const req = httpMock.expectOne(`${base}/${RID}/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ steps: [{ skillKey: 'weakness_sight' }] });
    req.flush(sampleRitual({ currentRevision: 1, publishedPriceUnits: 20 }));
    expect(out!.currentRevision).toBe(1);
  });

  it('runRitual POSTs to /run with an empty body by default', () => {
    let out: RitualRun | null = null;
    svc.runRitual(FID, RID).subscribe((r) => (out = r));
    const req = httpMock.expectOne(`${base}/${RID}/run`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(sampleRun());
    expect(out!.status).toBe('completed');
  });

  it('runRitual carries an explicit triggerSource when supplied', () => {
    svc.runRitual(FID, RID, { triggerSource: 'manual' }).subscribe();
    const req = httpMock.expectOne(`${base}/${RID}/run`);
    expect(req.request.body).toEqual({ triggerSource: 'manual' });
    req.flush(sampleRun());
  });

  it('listRuns GETs the run history and maps {runs:[]}', () => {
    let out: readonly RitualRun[] | null = null;
    svc.listRuns(FID, RID).subscribe((r) => (out = r));
    const req = httpMock.expectOne(`${base}/${RID}/runs`);
    expect(req.request.method).toBe('GET');
    req.flush({ runs: [sampleRun()] });
    expect(out!.length).toBe(1);
  });

  it('propagates a BFF error fail-loud (no mock fallback)', () => {
    let next: unknown = null;
    let err: unknown = null;
    svc.listRituals(FID).subscribe({ next: (r) => (next = r), error: (e) => (err = e) });
    httpMock
      .expectOne(base)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(next).toBeNull();
    expect(err).not.toBeNull();
  });
});
