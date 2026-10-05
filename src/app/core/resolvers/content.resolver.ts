import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { BffClientService } from '../services/bff-client.service';

export interface ContentResolverConfig {
  paramName: string;
  endpoint: (param: string) => string;
}

export function createContentResolver<T>(config: ContentResolverConfig): ResolveFn<T | null> {
  return (route) => {
    const bff = inject(BffClientService);
    const router = inject(Router);
    const param = route.paramMap.get(config.paramName);

    if (!param) {
      router.navigate(['/not-found']);
      return of(null);
    }

    return bff.get<T>(config.endpoint(param)).pipe(
      catchError(() => {
        router.navigate(['/not-found']);
        return of(null);
      }),
    );
  };
}
