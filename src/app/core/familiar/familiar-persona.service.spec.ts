import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { FamiliarPersonaService } from './familiar-persona.service';
import { environment } from '../../../environments/environment';
import type { PersonaEditRequest, PersonaView } from './familiar-persona.model';

const FID = 'ember-001';

function sampleView(overrides: Partial<PersonaView> = {}): PersonaView {
  return {
    tone: 'encouraging',
    hintProgression: 'ladder',
    maxHintsBeforeReveal: 2,
    difficultyCap: 'intermediate',
    language: 'en',
    citationStrictness: 'strict',
    archetype: 'curious-explorer',
    addressStyle: 'first_name',
    interestChips: ['space'],
    guidanceNote: 'be kind',
    version: 1,
    ...overrides,
  };
}

function sampleEdit(): PersonaEditRequest {
  return {
    tone: 'direct',
    hintProgression: 'uniform',
    maxHintsBeforeReveal: 0,
    difficultyCap: 'advanced',
    language: 'en',
    citationStrictness: 'lenient',
    archetype: 'space-cadet',
    addressStyle: 'nickname',
    interestChips: ['rockets', 'black holes'],
    guidanceNote: 'Use space analogies.',
  };
}

describe('FamiliarPersonaService', () => {
  let svc: FamiliarPersonaService;
  let httpMock: HttpTestingController;
  const url = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}/persona`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(FamiliarPersonaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getPersona GETs the persona route and returns the view', () => {
    let out: PersonaView | null = null;
    svc.getPersona(FID).subscribe((v) => (out = v));
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    req.flush(sampleView());
    expect(out).not.toBeNull();
    expect(out!.version).toBe(1);
    expect(out!.tone).toBe('encouraging');
  });

  it('updatePersona PUTs the camelCase edit body VERBATIM and returns the view', () => {
    let out: PersonaView | null = null;
    const body = sampleEdit();
    svc.updatePersona(FID, body).subscribe((v) => (out = v));
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    // camelCase pass-through — the body reaches the gateway verbatim.
    expect(req.request.body).toEqual(body);
    req.flush(sampleView({ tone: 'direct', addressStyle: 'nickname', version: 2 }));
    expect(out!.version).toBe(2);
  });

  it('getPersona fails loud on a malformed response (no fabrication)', () => {
    let next: unknown = null;
    let err: unknown = null;
    svc.getPersona(FID).subscribe({ next: (v) => (next = v), error: (e) => (err = e) });
    httpMock.expectOne(url).flush({ wrong: 'shape' });
    expect(next).toBeNull();
    expect(err).not.toBeNull();
  });

  it('updatePersona propagates a 422 note-blocked conflict fail-loud', () => {
    let next: unknown = null;
    let err: unknown = null;
    svc
      .updatePersona(FID, sampleEdit())
      .subscribe({ next: (v) => (next = v), error: (e) => (err = e) });
    httpMock
      .expectOne(url)
      .flush(
        { code: 'PERSONA_NOTE_BLOCKED', message: 'modelarmor match: pi_and_jailbreak' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(next).toBeNull();
    expect((err as { status?: number }).status).toBe(422);
  });

  it('propagates a BFF transport error fail-loud (no mock fallback)', () => {
    let next: unknown = null;
    let err: unknown = null;
    svc.getPersona(FID).subscribe({ next: (v) => (next = v), error: (e) => (err = e) });
    httpMock
      .expectOne(url)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(next).toBeNull();
    expect(err).not.toBeNull();
  });
});
