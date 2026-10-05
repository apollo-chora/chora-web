import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker, SwUpdate } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withViewTransitions(),
    ),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Angular's ngsw, wrapped by `public/chora-service-worker.js` so
    // cross-origin requests are declined instead of re-issued inside the
    // worker. ngsw calls respondWith() on EVERY request and turns any throw in
    // its safeFetch into a synthetic 504, which silently killed cross-origin
    // subresource loads under the worker (measured 2026-09-06, and a HEALTHY
    // worker failed identically, so it was not a manifest problem). The
    // wrapper's comment carries the measurement and the reasoning.
    provideServiceWorker('chora-service-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      // When a new deployment is ready, reload so the tab picks up the new
      // bundle instead of keep serving the stale precached shell. Without
      // this, an already-open tab keeps running the old version indefinitely.
      const swUpdate = inject(SwUpdate);
      if (swUpdate.isEnabled) {
        swUpdate.versionUpdates.subscribe((event) => {
          if (event.type === 'VERSION_READY') {
            document.location.reload();
          }
        });
        // A tab left open for days should still converge on the latest deploy.
        setInterval(() => swUpdate.checkForUpdate(), 60 * 60 * 1000);
      }
      return firstValueFrom(authService.initialize());
    }),
  ],
};
