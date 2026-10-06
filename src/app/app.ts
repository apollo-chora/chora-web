import { Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslateService } from './core/services/translate.service';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'chora-root',
  imports: [RouterOutlet, ToastContainerComponent, ConfirmDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  // The pre-auth screens render under AuthLayout, which has no in-page
  // navigation for a skip link to bypass, so it is omitted there.
  protected readonly showSkipLink = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => !isAuthScreen(event.urlAfterRedirects)),
    ),
    { initialValue: !isAuthScreen(this.router.url) },
  );

  ngOnInit(): void {
    this.translate.initFromStorage();
  }
}

const AUTH_SCREEN_PREFIXES = ['/login', '/suspended', '/select-tenant', '/welcome'];

function isAuthScreen(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return AUTH_SCREEN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
