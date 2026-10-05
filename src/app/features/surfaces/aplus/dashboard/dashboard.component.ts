/**
 * DashboardComponent — A+ learner+instructor dashboard ("My Knowledge" hub).
 *
 * SP2.2 dashboard-as-hub — the learner view is a THREE-TIER shell:
 *   1. a fixed Header — greeting + GCID pill + goal control + Today's Dose CTA
 *      (absorbs the old standalone "set a goal" block);
 *   2. a conditional NotificationsTicker — always mounted, self-collapses when it
 *      has no items; it is now the SOLE celebration detector on this route (the
 *      old in-shell grew-edge / goal-graduated toasts are retired);
 *   3. a `cdkDropList` column of self-contained draggable wrapper cards
 *      (map / cast / courses) ordered by `DashboardLayoutService.order()`, each
 *      with a drag handle so its inner links still click.
 *
 * The old map hero, the credential/curiosity adaptive lens, the streak pill, the
 * growth-edges tally, the learner course tiles, and the Familiar switcher strip
 * are RETIRED from the shell — those concerns now live inside the wrapper
 * components + the ticker, each with its own spec.
 *
 * Role-driven feature visibility is integrative (Tier 4 D16, NEVER a toggle):
 * the learner hub shows for `learner`, the authoring card for `author`, the
 * courses card for `instructor`. The three are additive, so a user holding all
 * three (the common case for an owner account) sees all three at once.
 *
 * Wired LIVE to the BFF `GET /api/me/dashboard` via `DashboardService` —
 * fail-loud `DashboardState` (loading panel / error banner+retry / success).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DashboardService } from './dashboard.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { GoalService } from './goal/goal.service';
import { HeaderGoalControlComponent } from './header-goal-control/header-goal-control.component';
import { DashboardLayoutService } from './dashboard-layout.service';
import type { WrapperKey } from './dashboard-layout.model';
import { MapPreviewCardComponent } from './map-preview-card/map-preview-card.component';
import { CastCardComponent } from './cast-card/cast-card.component';
import { ContinueLearningCardComponent } from './continue-learning-card/continue-learning-card.component';
import { StudyListsCardComponent } from './study-lists-card/study-lists-card.component';
import { TranscriptCardComponent } from './transcript-card/transcript-card.component';
import { NotificationsTickerComponent } from './notifications-ticker/notifications-ticker.component';

/**
 * A single identity role badge: its i18n label plus whether it is an elevated
 * (admin/auditor) role, which renders as a shielded, filled pill.
 */
export interface RoleBadge {
  readonly key: string;
  readonly labelKey: string;
  readonly elevated: boolean;
}

/**
 * The badged roles, in display order. Per CHO-2340 the A+ dashboard shows ONLY
 * the tenant-membership roles that H+ Members shows (learner, author,
 * instructor, admin, auditor), so one identity reads the same in both places.
 * CONTENT roles (learner/author/instructor) render as accent pills; the
 * ELEVATED membership roles (admin/auditor) render as a shielded, filled pill
 * (clearly legible, not a muted grey).
 *
 * The JWT-only / non-membership labels (training_admin, tenant_admin,
 * platform_operator, owner) are deliberately NOT badged: they are session
 * capabilities rather than a tenant membership, and badging them made "Admin"
 * look absent behind a wall of grey ops pills. They still resolve to
 * capabilities in `core/auth/role-capabilities.ts` (guards need them); they are
 * simply not shown as identity here. A role not in this list is ignored (never
 * rendered as a raw key). Labels reuse the canonical `aplus.dashboard.role_*`
 * i18n keys.
 *
 * Exported so `core/auth/role-capabilities.spec.ts` can assert that every role
 * we render a badge for actually resolves to capabilities. That test derives
 * its role list from THIS array rather than hand-copying it: a hand-copied list
 * is exactly the drift this pairing exists to prevent.
 */
export const ROLE_BADGES: readonly RoleBadge[] = [
  { key: 'learner', labelKey: 'aplus.dashboard.role_learner', elevated: false },
  { key: 'author', labelKey: 'aplus.dashboard.role_author', elevated: false },
  { key: 'instructor', labelKey: 'aplus.dashboard.role_instructor', elevated: false },
  { key: 'admin', labelKey: 'aplus.dashboard.role_admin', elevated: true },
  { key: 'auditor', labelKey: 'aplus.dashboard.role_auditor', elevated: true },
];

@Component({
  selector: 'chora-aplus-dashboard',
  imports: [
    RouterLink,
    DragDropModule,
    TranslatePipe,
    HeaderGoalControlComponent,
    MapPreviewCardComponent,
    CastCardComponent,
    ContinueLearningCardComponent,
    StudyListsCardComponent,
    TranscriptCardComponent,
    NotificationsTickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);
  private readonly goalService = inject(GoalService);
  private readonly manaSvc = inject(MeManaService);
  private readonly layoutService = inject(DashboardLayoutService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Fail-loud discriminated state from the service (loading/success/error). */
  readonly state = this.dashboardService.state;
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Success-state summary (or `null`). */
  readonly summary = this.dashboardService.summary;

  /**
   * One-shot banner key, derived from query params at navigation:
   *   ?course_submitted=1  → "Your course is in review …"
   *   ?course_resubmitted=1 → "Your draft has been resubmitted …"
   *   ?course_saved=1       → "Your draft changes are saved."
   * Cleared by `dismissBanner()` (which also strips the query param).
   */
  readonly banner = signal<string | null>(null);

  /** BE graceful-degradation flag — drives the subtle inline notice. */
  readonly isPartial = computed<boolean>(() => this.summary()?.partial === true);

  // ── Integrative role-driven visibility (Tier 4 D16) ───────────────
  /**
   * Derived from the JWT roles array in AuthService. NEVER a toggle —
   * the three role views below are ADDITIVE, so a user holding several roles
   * sees several of them at once.
   */
  private readonly userRoles = computed<readonly string[]>(
    () => this.authService.user()?.roles ?? [],
  );

  /** True when the authenticated user holds the `learner` role. */
  readonly isLearnerRole = computed<boolean>(() =>
    this.userRoles().includes('learner'),
  );

  /**
   * `author` and `instructor` are deliberately SEPARATE computeds: authoring
   * content and teaching a class are different jobs done by different people.
   * A learner can author LearningAtoms without ever running a cohort, and an
   * instructor can run a cohort without authoring a single atom. They were
   * previously ORed into one `isInstructorRole`, which is exactly why the panel
   * they gated had to call itself "Courses you authored or instruct" and then
   * show one person's work under the other person's heading.
   */
  readonly isAuthorRole = computed<boolean>(() =>
    this.userRoles().includes('author'),
  );

  /** True when the authenticated user holds the `instructor` role, and ONLY
   *  that role. Authoring is `isAuthorRole` and is not implied here. */
  readonly isInstructorRole = computed<boolean>(() =>
    this.userRoles().includes('instructor'),
  );

  /**
   * The identity role badges — the KNOWN roles the user holds, in display order
   * (content roles first, elevated roles after). Derived from the JWT `roles`
   * claim; unknown roles are dropped (never a raw key). "One identity, many
   * roles" shown, not asserted.
   */
  readonly roleBadges = computed<readonly RoleBadge[]>(() => {
    const held = this.userRoles();
    return ROLE_BADGES.filter((b) => held.includes(b.key));
  });

  // ── Today strip: streak + mana (folded in from the retired slabs) ─────────
  /** Current-streak days from the summary (structured `streak`, legacy fallback). */
  readonly streakDays = computed<number>(() => {
    const s = this.summary();
    if (!s) return 0;
    return s.streak?.current_streak_days ?? s.currentStreakDays;
  });

  /** Mana balance (stale-while-revalidate) + fail-loud display mode. */
  readonly manaUnits = this.manaSvc.balanceUnits;
  readonly manaDisplay = computed<'ready' | 'loading' | 'error'>(() => {
    const s = this.manaSvc.loadState();
    if (s.status === 'error') return 'error';
    if (s.status === 'loading' && this.manaSvc.mana() === null) return 'loading';
    return 'ready';
  });

  // ── SP2.1/2.2: draggable wrapper order ────────────────────────────────
  /**
   * The persisted, local-first order of the draggable wrapper cards
   * (map / cast / courses). Rendered instantly from localStorage + reconciled
   * Last-Write-Wins against the server on `load()`.
   */
  readonly layoutOrder = this.layoutService.order;

  /**
   * Explicit "reorder mode" — OFF by default so the cards keep a clean,
   * handle-free top-down layout. Entered via the `⋯` control; it reveals the
   * drag handles (immediate drag) + a Done affordance, then hides them again.
   */
  readonly reorderMode = signal<boolean>(false);

  /**
   * cdkDragStartDelay for the default (handle-free) path: a card is draggable
   * by press-and-hold (long-press) — a quick tap/click still passes through to
   * the card's own links/buttons. In reorder mode the delay is 0 (immediate
   * drag from the visible handle).
   */
  readonly longPressDelay = { touch: 600, mouse: 2000 };

  constructor() {
    this.dashboardService.load();
    this.goalService.load();
    this.manaSvc.load();
    this.layoutService.load();
    this.detectBanner();
  }

  // ── Wrapper drag reorder ──────────────────────────────────────────────
  /** Reveal the drag handles + Done affordance for an explicit reorder pass. */
  enterReorderMode(): void {
    this.reorderMode.set(true);
  }

  /** Leave reorder mode — the handles disappear, the clean layout returns. */
  exitReorderMode(): void {
    this.reorderMode.set(false);
  }

  /**
   * A drag settled: move the dragged card in a COPY of the current order and
   * persist via the layout service (local-first + debounced server save). The
   * `order()` signal update re-renders the `@for` in the new sequence.
   */
  onDrop(event: CdkDragDrop<readonly WrapperKey[]>): void {
    const next = [...this.layoutOrder()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.layoutService.reorder(next);
  }

  // ── Actions ───────────────────────────────────────────────────────────
  /** Retry CTA — re-fires the dashboard BFF call. */
  retry(): void {
    this.dashboardService.load();
  }

  /** Dismiss the banner + strip the query param so it doesn't replay on
   *  back-button navigation. */
  dismissBanner(): void {
    this.banner.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        course_submitted: null,
        course_resubmitted: null,
        course_saved: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private detectBanner(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('course_submitted') === '1') {
      this.banner.set('aplus.dashboard.banner_course_submitted');
    } else if (qp.get('course_resubmitted') === '1') {
      this.banner.set('aplus.dashboard.banner_course_resubmitted');
    } else if (qp.get('course_saved') === '1') {
      this.banner.set('aplus.dashboard.banner_course_saved');
    }
    // Auto-dismiss after 8s — non-blocking, only removes the visible toast.
    if (this.banner() !== null) {
      setTimeout(() => {
        if (this.banner() !== null) this.dismissBanner();
      }, 8000);
    }
  }
}
