import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { createContentResolver } from './content.resolver';
import { BffClientService } from '../services/bff-client.service';

describe('createContentResolver', () => {
  let bff: { get: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bff = { get: vi.fn() };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: BffClientService, useValue: bff },
        { provide: Router, useValue: router },
      ],
    });
  });

  function makeRoute(paramValue: string | null): ActivatedRouteSnapshot {
    return {
      paramMap: { get: () => paramValue },
    } as unknown as ActivatedRouteSnapshot;
  }

  it('should resolve content from BFF', async () => {
    bff.get.mockReturnValue(of({ id: 'atom-1', title: 'Test Atom' }));

    const resolver = createContentResolver<{ id: string }>({
      paramName: 'id',
      endpoint: (id) => `/api/v1/atoms/${id}`,
    });

    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        resolver(makeRoute('atom-1'), {} as never),
      ) as Observable<unknown>,
    );

    expect(bff.get).toHaveBeenCalledWith('/api/v1/atoms/atom-1');
    expect(result).toEqual({ id: 'atom-1', title: 'Test Atom' });
  });

  it('should navigate to /not-found when param is missing', async () => {
    const resolver = createContentResolver<{ id: string }>({
      paramName: 'id',
      endpoint: (id) => `/api/v1/atoms/${id}`,
    });

    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        resolver(makeRoute(null), {} as never),
      ) as Observable<unknown>,
    );

    expect(result).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/not-found']);
  });

  it('should navigate to /not-found on HTTP error', async () => {
    bff.get.mockReturnValue(throwError(() => new Error('404')));

    const resolver = createContentResolver<{ id: string }>({
      paramName: 'id',
      endpoint: (id) => `/api/v1/atoms/${id}`,
    });

    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        resolver(makeRoute('missing'), {} as never),
      ) as Observable<unknown>,
    );

    expect(result).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/not-found']);
  });
});
