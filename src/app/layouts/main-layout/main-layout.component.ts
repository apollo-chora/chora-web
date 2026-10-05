import {
  Component,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './sidebar/sidebar.component';
import { CompassBarComponent } from '../../shared/components/compass/compass-bar.component';
import { HudComponent } from '../../shared/components/hud/hud.component';
import { resolveActiveSurface } from '../../features/surfaces/surface-nav';
import { SurfaceRailComponent } from './surface-rail/surface-rail.component';
import { TopNavComponent } from './top-nav/top-nav.component';
import { LayoutService } from '../../core/services/layout.service';
import { RbacService } from '../../core/services/rbac.service';
import { canSeeSurfaceRail } from '../../features/surfaces/surface-access';

function responsiveDefaultCollapsed(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? !window.matchMedia('(min-width: 1280px)').matches
    : false;
}

@Component({
  selector: 'chora-main-layout',
  imports: [
    RouterOutlet,
    SidebarComponent,
    CompassBarComponent,
    HudComponent,
    SurfaceRailComponent,
    TopNavComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
  private readonly layout = inject(LayoutService);
  private readonly rbac = inject(RbacService);
  private readonly router = inject(Router);

  /** Bumped on every NavigationEnd so `activeSurface` recomputes. */
  private readonly navTick = signal(0);

  /**
   * A+ gets the compass bar; every other surface keeps the sidebar (plan
   * section 3.1). `resolveActiveSurface` defaults to `'aplus'` for any
   * unprefixed path, so the surface-agnostic Group-4 routes (`/home`,
   * `/dashboard`, `/learning`) wear the A+ shell too, which is what the
   * learner expects on the one screen that can be reached without a prefix.
   */
  readonly usesCompass = computed<boolean>(() => {
    this.navTick();
    return resolveActiveSurface(this.router.url) === 'aplus';
  });

  readonly sidebarCollapsed = signal(responsiveDefaultCollapsed());

  /**
   * Whether this session sees the CHORA rail (R39, owner ruling 2026-09-02).
   *
   * The SAME predicate the rail itself calls, so the grid column and the chips
   * can never disagree. When false the rail element is not rendered at all and
   * the content column takes the full width from the left edge, which is also
   * where the HUD's bottom-left anchor moves to.
   */
  readonly railVisible = computed<boolean>(() => canSeeSurfaceRail(this.rbac));

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navTick.update((n) => n + 1));

    // A route can request the nav collapse (wide authoring surfaces). When the
    // request clears (null) we restore the responsive default. This only fires
    // when the request CHANGES, so a user's manual toggle on a normal page is
    // never overridden. (2026-06-21)
    effect(
      () => {
        const req = this.layout.collapseRequest();
        this.sidebarCollapsed.set(req ?? responsiveDefaultCollapsed());
      },
      { allowSignalWrites: true },
    );
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
