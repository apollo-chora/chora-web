import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { environment } from '../../../../../../environments/environment';
import { DosePreferencesService } from './dose-preferences.service';

const URL = `${environment.bffBaseUrl}/api/v1/me/dose-preferences`;

describe('DosePreferencesService', () => {
  let service: DosePreferencesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DosePreferencesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the sparse excluded set on success', () => {
    service.load();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({ excludedMapIds: ['g-1', 'g-2'] });

    expect(service.status()).toBe('success');
    expect([...service.excluded()].sort()).toEqual(['g-1', 'g-2']);
  });

  it('sets status=error on a load failure (fail-loud)', () => {
    service.load();
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'err' });
    expect(service.status()).toBe('error');
  });

  it('optimistically excludes a map and PUTs { included:false }', () => {
    service.setIncluded('g-9', false).subscribe();
    expect(service.excluded().has('g-9')).toBe(true); // optimistic before flush

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mapId: 'g-9', included: false });
    req.flush({ mapId: 'g-9', included: false });

    expect(service.excluded().has('g-9')).toBe(true);
  });

  it('reverts the optimistic flip on a PUT error and re-throws', () => {
    let errored = false;
    service.setIncluded('g-5', false).subscribe({ error: () => (errored = true) });
    expect(service.excluded().has('g-5')).toBe(true); // optimistic

    http.expectOne(URL).flush('nope', { status: 500, statusText: 'err' });

    expect(service.excluded().has('g-5')).toBe(false); // reverted
    expect(errored).toBe(true);
  });

  it('re-includes a map (removes it from the excluded set) and PUTs { included:true }', () => {
    service.load();
    http.expectOne(URL).flush({ excludedMapIds: ['g-1'] });

    service.setIncluded('g-1', true).subscribe();
    expect(service.excluded().has('g-1')).toBe(false); // optimistic re-include

    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ mapId: 'g-1', included: true });
    req.flush({ mapId: 'g-1', included: true });
  });
});
