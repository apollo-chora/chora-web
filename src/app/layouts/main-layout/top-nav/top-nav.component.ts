import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  OnInit,
  OnDestroy,
  HostListener,
  computed,
  effect,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/realtime/notification.service';
import { RealtimeChannelService } from '../../../core/realtime/realtime-channel.service';
import { MeManaService } from '../../../core/services/me-mana.service';
import { environment } from '../../../../environments/environment';
import { NotificationCenterComponent } from '../../../shared/components/notification-center/notification-center.component';
import { TenantSwitcherComponent } from '../tenant-switcher/tenant-switcher.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { YieldsStripComponent } from './yields-strip/yields-strip.component';

/**
 * Suppression window for the "Reconnecting…" aria-live announcement.
 *
 * WCAG 2.1 AA — `aria-live="polite"` should fire on FIRST entry into the
 * reconnecting state; subsequent flapping (WebSocket backoff retries that
 * keep cycling back into `'reconnecting'`) must NOT re-announce or the
 * screen reader spam-reads "Reconnecting…" every second.
 *
 * After this window the live region flips to `aria-live="off"` while the
 * visual pill stays rendered. The window re-arms whenever the connection
 * leaves `'reconnecting'` (e.g. a successful `connected` cycle).
 *
 * Per `docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md` §Accessibility.
 */
const RECONNECT_ANNOUNCE_SUPPRESS_MS = 10_000;

@Component({
  selector: 'chora-top-nav',
  imports: [
    RouterLink,
    TenantSwitcherComponent,
    NotificationCenterComponent,
    TranslatePipe,
    YieldsStripComponent,
  ],
  templateUrl: './top-nav.component.html',
  styleUrl: './top-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  readonly notificationService = inject(NotificationService);
  private readonly realtime = inject(RealtimeChannelService);
  private readonly manaService = inject(MeManaService);

  sidebarCollapsed = input(false);
  toggleSidebar = output<void>();

  /**
   * True on the A+ shell, where the compass bar replaces the sidebar.
   *
   * Two consequences in the top bar: the yields strip renders, and the sidebar
   * toggle does NOT, because a control that collapses a column A+ no longer has
   * is a button that visibly does nothing.
   */
  compassShell = input(false);

  readonly user = this.authService.user;
  readonly unreadCount = this.notificationService.unreadCount;
  readonly isNotificationOpen = this.notificationService.isOpen;
  readonly connectionState = this.notificationService.connectionState;

  // aria-live gate: true only during the first RECONNECT_ANNOUNCE_SUPPRESS_MS
  // after entering the reconnecting state.
  private readonly _liveAnnounceArmed = signal<boolean>(false);
  private suppressionTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * aria-live value bound on the "Reconnecting…" pill. Returns `'polite'`
   * during the first-announce window, otherwise `'off'` so screen readers
   * don't re-announce on every backoff cycle.
   */
  readonly reconnectingAriaLive = computed<'polite' | 'off'>(() =>
    this._liveAnnounceArmed() ? 'polite' : 'off',
  );

  constructor() {
    // Arm the live region on FIRST entry into reconnecting; disarm + clear
    // the timer whenever the state moves away from reconnecting so a fresh
    // disconnect after a successful reconnect can announce again.
    effect(() => {
      const state = this.connectionState();
      if (state === 'reconnecting') {
        if (this.suppressionTimer === null && !this._liveAnnounceArmed()) {
          this._liveAnnounceArmed.set(true);
          this.suppressionTimer = setTimeout(() => {
            this._liveAnnounceArmed.set(false);
            this.suppressionTimer = null;
          }, RECONNECT_ANNOUNCE_SUPPRESS_MS);
        }
      } else {
        if (this.suppressionTimer !== null) {
          clearTimeout(this.suppressionTimer);
          this.suppressionTimer = null;
        }
        if (this._liveAnnounceArmed()) {
          this._liveAnnounceArmed.set(false);
        }
      }
    });
  }

  ngOnInit(): void {
    if (this.user()) {
      this.notificationService.initialize();
      // Open the learner-scoped realtime channel (ADR-183) once and bind the
      // mana pill to it. Flag-gated until chora-realtime + the gateway ticket
      // endpoint are LIVE, so we don't 404-loop on the ticket fetch.
      if (environment.realtimeEnabled) {
        this.realtime.connect();
        this.manaService.connectRealtime();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.suppressionTimer !== null) {
      clearTimeout(this.suppressionTimer);
      this.suppressionTimer = null;
    }
    this.notificationService.teardown();
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleNotifications(event: Event): void {
    event.stopPropagation();
    this.notificationService.togglePanel();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('[data-testid="notification-panel"]') && !target.closest('[data-testid="notification-bell"]')) {
      this.notificationService.closePanel();
    }
  }

  logout(): void {
    this.notificationService.teardown();
    this.authService.logout();
  }
}
