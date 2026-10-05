import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../../environments/environment';
import { FamiliarMapService } from './familiar-map.service';

const BFF = environment.bffBaseUrl;
const BASE = `${BFF}/api/v1/me/familiars`;

describe('FamiliarMapService', () => {
  let service: FamiliarMapService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FamiliarMapService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('acquire POSTs the request and returns the acquired familiar', async () => {
    const promise = firstValueFrom(
      service.acquire({
        goalId: 'goal-1',
        familiarName: 'Sage',
        mode: 'dev_hatched',
      }),
    );

    const req = httpMock.expectOne(`${BASE}/acquire`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      goalId: 'goal-1',
      familiarName: 'Sage',
      mode: 'dev_hatched',
    });
    req.flush({
      familiarId: 'fam-1',
      name: 'Sage',
      goalId: 'goal-1',
      acquisition: 'dev_hatched',
    });

    const acquired = await promise;
    expect(acquired.familiarId).toBe('fam-1');
    expect(acquired.goalId).toBe('goal-1');
  });

  it('listBindings GETs the bindings envelope', async () => {
    const promise = firstValueFrom(service.listBindings());

    const req = httpMock.expectOne(`${BASE}/bindings`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          bindingId: 'bind-1',
          mapTheme: 'Algebra',
          familiarId: 'fam-1',
          acquisition: 'dev_hatched',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
    });

    expect((await promise).items).toHaveLength(1);
  });

  it('getMemory GETs the encoded familiar memory endpoint', async () => {
    const promise = firstValueFrom(service.getMemory('fam 1'));

    const req = httpMock.expectOne(`${BASE}/fam%201/memory`);
    expect(req.request.method).toBe('GET');
    req.flush({
      familiarId: 'fam 1',
      name: 'Sage',
      focus: 'Algebra',
      persona: 'Patient mentor',
      rules: {},
      evolutionTier: 'hatchling',
      skills: ['hint'],
      hasMemory: false,
      memories: [],
      visibleNeighbors: [],
    });

    const memory = await promise;
    expect(memory.familiarId).toBe('fam 1');
    expect(memory.hasMemory).toBe(false);
  });

  it('getMemory fails loud on error', async () => {
    const promise = firstValueFrom(service.getMemory('fam-1'));
    httpMock.expectOne(`${BASE}/fam-1/memory`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await expect(promise).rejects.toBeTruthy();
  });
});
