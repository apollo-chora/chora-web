/**
 * FamiliarComponent — A+ Familiar surface (dual-mode).
 *
 * Two route shapes:
 *   - `/a/companion/:familiarId` → PROFILE mode. Per-Familiar growth view
 *     (ADR-149: breed art / stage / EXP / unlocked tools / KG reach /
 *     resonant atom). Refactored Iter G.5 W2.
 *
 * The Aha-moment LINK is gone (owner ruling D5, 2026-09-02): it pointed at
 * `/a/companion/:familiarId/source-revelation`, a route `aplus.routes.ts` has
 * never mounted. The preview itself came BACK as a control (owner R47 / D7,
 * 2026-09-03): `openSourceRevelation()` below opens the existing overlay in
 * place, so nothing routes anywhere.
 *
 * CORRECTION to what this docblock used to say, and to the C-SR finding that
 * came from it: the overlay is NOT "driven by a realtime event". It is a
 * complete component with NO production trigger. `source_revelation` has no
 * channel topic (`familiar-realtime.service.ts:15`); the stream's only
 * producers are `emit()` and `emitSourceRevelation()`, both documented dev
 * seams, and nothing outside specs and stories calls either. The overlay's own
 * docblock asserts a path through `FamiliarHatchingComponent.commit()` that
 * component never calls, and quoting it rather than grepping the invoker is
 * how the wrong claim reached a commit message on main. The control below is
 * therefore the overlay's FIRST production door.
 *   - `/a/companion` (no param)  → FRONT-DOOR mode (CHO-2095). Resolves the
 *     learner's active familiar and redirects to its PROFILE (replaceUrl);
 *     an empty cast redirects to `/a/companion/marketplace`. The Phase-N
 *     roster LIST is retired — the dashboard "Your Cast" strip is the
 *     switcher, and retire + chat live on the profile.
 *
 * Mode is decided from `route.paramMap` and computed once per emission.
 * The legacy OLD Eira-Three-Currency view (XP / mana / quests /
 * artifacts / relationship — ADR-116 era) is superseded by ADR-149's
 * single canonical growth_stage axis.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import {
  FamiliarRealtimeService,
  type FamiliarStageTransition,
  type FamiliarSourceRevelationPayload,
} from '../../../../core/familiar/familiar-realtime.service';
import { breedStageLabel } from '../../../../core/familiar/familiar-growth.model';
import type { FamiliarGrowthState } from '../../../../core/familiar/familiar-growth.model';
import { FamiliarService } from './familiar.service';
import { hasMemorySummary } from './familiar.model';
import { FamiliarStageUpOverlayComponent } from '../familiar-stage-up/familiar-stage-up-overlay.component';
import { FamiliarSourceRevelationOverlayComponent } from '../familiar-source-revelation/familiar-source-revelation-overlay.component';
import { FamiliarLoadoutComponent } from '../../../../shared/components/familiar-loadout/familiar-loadout.component';
import { FamiliarBindingCeremonyComponent } from '../familiar-ceremony/familiar-binding-ceremony.component';
import { IncubationCardComponent } from '../familiar-incubation/incubation-card.component';
import { AiTransparencyNoticeComponent } from '../../../../shared/components/ai-transparency-notice/ai-transparency-notice.component';
import { AiCompanionBadgeComponent } from '../../../../shared/components/ai-companion-badge/ai-companion-badge.component';

type FrontDoorState =
  | { readonly status: 'resolving' }
  | { readonly status: 'error'; readonly error: string };

/**
 * Map a roster-fetch failure to an i18n key — mirrors
 * `FamiliarService.errorKey()`. A 401/403 means the session lapsed (surface
 * a "sign in again" message); anything else is the generic "couldn't load"
 * copy so an expired session isn't misreported as a server fault.
 */
function rosterErrorKey(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) {
    return 'aplus.familiar_list.error_unauthorised';
  }
  return 'aplus.familiar_list.error';
}

@Component({
  selector: 'chora-aplus-familiar',
  imports: [
    DecimalPipe,
    RouterLink,
    TranslatePipe,
    RelativeTimePipe,
    BreedArtComponent,
    FamiliarStageUpOverlayComponent,
    FamiliarSourceRevelationOverlayComponent,
    FamiliarLoadoutComponent,
    FamiliarBindingCeremonyComponent,
    IncubationCardComponent,
    AiTransparencyNoticeComponent,
    AiCompanionBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar.component.html',
  styleUrl: './familiar.component.scss',
})
export class FamiliarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly growthService = inject(FamiliarGrowthService);
  private readonly familiarService = inject(FamiliarService);
  private readonly active = inject(ActiveFamiliarService);
  private readonly realtime = inject(FamiliarRealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  // ── WS-2: overlay state ─────────────────────────────────────────────
  /** Non-null when a stage-up overlay should be visible. */
  readonly stageUpOverlay = signal<FamiliarStageTransition | null>(null);
  /** Non-null when a source-revelation overlay should be visible. */
  readonly sourceRevelationOverlay =
    signal<FamiliarSourceRevelationPayload | null>(null);

  /** True while the binding-ceremony modal is open (bond-footer CTA → modal,
   *  rendered at the profile root so it escapes the card's containing block). */
  readonly ceremonyOpen = signal<boolean>(false);

  /** 'front-door' when route has no `:familiarId`, else 'profile'. */
  readonly mode = toSignal(
    this.route.paramMap.pipe(
      map((params): 'front-door' | 'profile' =>
        params.get('familiarId') ? 'profile' : 'front-door',
      ),
    ),
    { initialValue: 'front-door' as 'front-door' | 'profile' },
  );

  /** Resolve the familiar to render in PROFILE mode (route param only —
   *  the CHO-2095 front-door redirects before any profile could render). */
  readonly familiar = toSignal<FamiliarGrowthState | null>(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('familiarId');
        if (!id) {
          return of<FamiliarGrowthState | null>(null);
        }
        return this.growthService.getGrowth(id).pipe(
          catchError(() => of<FamiliarGrowthState | null>(null)),
        );
      }),
    ),
    { initialValue: null },
  );

  /** FRONT-DOOR resolution state (CHO-2095) — only surfaces when the bare
   *  route cannot redirect (roster fetch failed). Resolution is driven from
   *  the paramMap subscription in the constructor. */
  readonly frontDoor = signal<FrontDoorState>({ status: 'resolving' });
  /** Error key for the front-door fail-loud banner. */
  readonly frontDoorError = computed(() => {
    const s = this.frontDoor();
    return s.status === 'error' ? s.error : '';
  });

  // ── CHO-2095: bare-route FRONT-DOOR resolution ──────────────────────
  /** Resolve the cast and redirect: active familiar's profile, first
   *  familiar as fallback, marketplace when the cast is empty. replaceUrl
   *  keeps the back button sane (the bare route never stays in history). */
  private resolveFrontDoor(): void {
    this.frontDoor.set({ status: 'resolving' });
    this.familiarService
      .getMyFamiliars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (familiars) => {
          if (familiars.length === 0) {
            void this.router.navigate(['/a/companion/marketplace'], { replaceUrl: true });
            return;
          }
          const pick = familiars.find((f) => f.isActive) ?? familiars[0];
          void this.router.navigate(['/a/companion', pick.familiarId], { replaceUrl: true });
        },
        error: (err: unknown) =>
          this.frontDoor.set({ status: 'error', error: rosterErrorKey(err) }),
      });
  }

  /** Fail-loud retry CTA on the front-door error banner. */
  retryFrontDoor(): void {
    this.resolveFrontDoor();
  }

  // ── CHO-2095: retire (release) THIS familiar from its profile ────────
  // Relocated from the retired roster list (CHO-2033). The confirm names
  // the irreversibility contract: retiring permanently deletes the records
  // the familiar retains about the learner's goals (CHO-2096 purges the
  // memory rows server-side) and releases its goal-map bond.
  /** True while the retire POST is in flight (disables the button). */
  readonly retiring = signal<boolean>(false);

  async retireFamiliar(): Promise<void> {
    const f = this.familiar();
    if (!f || this.retiring()) return;

    const ok = await this.confirmDialog.confirm({
      title: 'aplus.familiar.retire_confirm_title',
      message: 'aplus.familiar.retire_confirm_message',
      confirmText: 'aplus.familiar.retire_confirm_confirm',
      variant: 'danger',
    });
    if (!ok) return;

    this.retiring.set(true);
    this.growthService.retire(f.familiarId).subscribe({
      next: () => {
        this.retiring.set(false);
        this.toast.show('aplus.familiar.retire_success', 'success');
        void this.router.navigate(['/a/dashboard']);
      },
      error: () => {
        this.retiring.set(false);
        this.toast.show('aplus.familiar.retire_error', 'error');
      },
    });
  }

  // ── F5: real Familiar-instance signal (Memory Bank + identity) ──────
  // The PROFILE-mode growth view above is fed by FamiliarGrowthService
  // (ADR-149 growth axis). The instance GET (`GET /api/v1/me/familiars/
  // {id}`) carries the identity + OPTIONAL `memory_summary` recap the
  // FamiliarService un-mock surfaces. Exposed fail-loud so the Memory
  // Bank panel renders loading / recap / graceful-empty / error+retry.
  /** Fail-loud profile-load state from the real instance GET. */
  readonly profileState = this.familiarService.state;
  /** True once the loaded instance carries a non-empty Memory-Bank recap. */
  readonly hasMemory = computed<boolean>(() => {
    const p = this.familiarService.profile();
    return p ? hasMemorySummary(p) : false;
  });
  /** The Memory-Bank recap text, or undefined when absent/empty. */
  readonly memorySummary = computed<string | undefined>(() => {
    const p = this.familiarService.profile();
    return p && hasMemorySummary(p) ? p.memorySummary : undefined;
  });

  /** Re-trigger the instance fetch (Memory Bank panel retry CTA). */
  retryProfile(): void {
    const id =
      this.route.snapshot.paramMap.get('familiarId') ??
      this.active.active()?.familiarId;
    if (id) {
      this.familiarService.loadProfile(id);
    }
  }

  readonly stageLabel = computed<string>(() => {
    const f = this.familiar();
    if (!f) return '';
    return breedStageLabel(f.species, f.growthStage);
  });

  readonly expPct = computed<number>(() => {
    const f = this.familiar();
    if (!f || f.expNextThreshold === 0) return 100;
    return Math.min(100, Math.round((f.expCurrent / f.expNextThreshold) * 100));
  });

  /**
   * Is the server reporting a live Aha window? The gate for the on-demand
   * preview (owner R47, D7). Server data, never a client guess: without a
   * window there is nothing truthful to show, so the control is ABSENT rather
   * than disabled.
   */
  readonly hasAhaMoment = computed<boolean>(() => {
    const f = this.familiar();
    return !!f?.ahaMomentActiveUntil;
  });

  readonly atMaturedStage = computed<boolean>(() => {
    return (this.familiar()?.growthStage ?? 0) >= 6;
  });

  /**
   * CHO-2047: map the internal LLM-tier enum → a learner-facing "mind"
   * i18n key. Three-Audience Explainability (ADR-215) — the learner sees a
   * plain capability phrase ("Quick thinker" … "Deepest thinker"), never
   * the operator tier token ("flash-lite"/"pro") or the token ceiling.
   */
  readonly mindLabelKey = computed<string>(() => {
    switch (this.familiar()?.effectiveLlmTier) {
      case 'pro':
        return 'aplus.familiar.mind_pro';
      case 'flash-reasoning':
        return 'aplus.familiar.mind_flash_reasoning';
      case 'flash':
        return 'aplus.familiar.mind_flash';
      case 'flash-lite':
      default:
        return 'aplus.familiar.mind_flash_lite';
    }
  });

  constructor() {
    // F5: drive the real Familiar-instance fetch (identity + Memory Bank)
    // off the route param; a bare route (no :id) is the CHO-2095 front-door
    // and resolves → redirects instead of rendering.
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const routeID = params.get('familiarId');
        if (!routeID) {
          this.resolveFrontDoor();
          return;
        }
        const id = routeID ?? this.active.active()?.familiarId;
        if (id) {
          this.familiarService.loadProfile(id);
        }
      });

    // WS-2: subscribe to realtime stage-up events → show overlay
    this.realtime.stageTransition$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => this.stageUpOverlay.set(t));

    // WS-2: subscribe to source-revelation events → show overlay
    this.realtime.sourceRevelation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => this.sourceRevelationOverlay.set(p));
  }

  /** Dismiss the stage-up overlay. */
  dismissStageUp(): void {
    this.stageUpOverlay.set(null);
  }

  /**
   * Open the source-revelation overlay on demand (owner R47, D7, 2026-09-03).
   *
   * Every field is traced to the profile the server sent: `familiarId` and
   * `species` as-is, and `ahaMomentActiveUntil` as `source`, which is exactly
   * what the dev-seam event path puts there (`windowExpiresAt`,
   * `familiar-realtime.service.ts:126-128`), so the two doors agree instead of
   * each inventing a meaning. Nothing is fabricated, which matters more than it
   * looks: the overlay renders NO field of its payload (its single read of
   * `payload()` is a focus-change trigger), so a placeholder here would be
   * invisible rather than obviously wrong.
   *
   * A no-op without a window or a profile. The template already hides the
   * control in that state; this refuses it a second time rather than trusting
   * the caller, because the method is public.
   */
  openSourceRevelation(): void {
    const f = this.familiar();
    if (!f?.ahaMomentActiveUntil) return;
    this.sourceRevelationOverlay.set({
      familiarId: f.familiarId,
      breed: f.species,
      source: f.ahaMomentActiveUntil,
    });
  }

  /** Dismiss the source-revelation overlay. */
  dismissSourceRevelation(): void {
    this.sourceRevelationOverlay.set(null);
  }

}
