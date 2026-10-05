/**
 * MyKnowledgeComponent — the "My Knowledge" Atlas (L0 home, WS-B).
 *
 * The learner's set of maps (each a Goal, ADR-214), rendered as glass summary
 * cards echoing the `kg-map-hero` altitude pattern: the root-concept title, a
 * north-star subtitle, the concept count, a terrain line (shaky / solid), a
 * mastered count, and a Continue link into L1 (`/a/knowledge/:goalId`).
 *
 * "＋ New map" opens a minimal inline form (name a theme) → the 2-step create
 * (`MapsService.createMap`: mint a root concept → curiosity goal) → refresh.
 *
 * DARK: reachable by URL only for now — no sidebar entry (the nav collapse is
 * WS-F). Fail-loud: honest loading / error(retry) / empty / success; a create
 * failure renders inline and never fabricates success (no-stubs mandate).
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { MapsService } from './maps.service';
import type { MapCard } from './maps.model';
import { WeaknessReviewService } from '../growth-edge-review/weakness-review.service';
import { PendingReviewStore } from '../growth-edge-review/pending-review.store';

/** Max length of a new map's name (keeps the north-star note tidy). */
const MAX_MAP_NAME = 80;

@Component({
  selector: 'chora-aplus-my-knowledge',
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-knowledge.component.html',
  styleUrl: './my-knowledge.component.scss',
})
export class MyKnowledgeComponent implements OnInit {
  private readonly mapsService = inject(MapsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly weaknessReview = inject(WeaknessReviewService);
  private readonly pendingReview = inject(PendingReviewStore);

  /** The Atlas load state (loading / success / error) — drives the template. */
  readonly state = this.mapsService.state;
  /** The learner's maps (empty on loading / error). */
  readonly maps = this.mapsService.maps;
  /** See MapsService.coolingPartial: a zero count is not evidence when true. */
  readonly coolingPartial = this.mapsService.coolingPartial;
  /** Retired fog clusters offered for re-projection into maps (ADR-223). */
  readonly legacyClusters = this.mapsService.legacyClusters;
  /** The clusterId being converted (disables its button); null when idle. */
  readonly converting = signal<string | null>(null);
  /** i18n error key shown inline when a convert fails; null when clear. */
  readonly convertError = signal<string | null>(null);

  readonly maxNameLength = MAX_MAP_NAME;

  /** Whether the inline "＋ New map" form is open. */
  readonly formOpen = signal(false);
  /** In-flight guard for the 2-step create (disables submit, blocks re-entry). */
  readonly creating = signal(false);
  /** i18n error key shown inline when a create fails; `null` when clear. */
  readonly createError = signal<string | null>(null);

  /** The goalId currently being deleted (in-flight guard); `null` when idle. */
  readonly deletingId = signal<string | null>(null);

  /**
   * The upload id of a Growth-Edge review the learner parked but never resumed
   * (CHO-2337); `null` when none is pending or it has self-healed. Drives the
   * persistent resume-review banner.
   */
  readonly pendingReviewId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_MAP_NAME)]],
  });

  ngOnInit(): void {
    this.mapsService.load();
    this.mapsService.loadLegacyClusters();
    this.checkPendingReview();
  }

  /**
   * Re-offer a Growth-Edge review the learner parked at the HITL interrupt but
   * never resumed (CHO-2337). The only in-app link was an ephemeral in-drawer
   * CTA, so this reads the persisted upload id and self-heals it against the
   * existing GET /uploads/{id} poll (there is no "list pending reviews" API):
   *   - AWAITING_REVIEW  → show the banner (deep-links to the review page);
   *   - any other status → clear the store + stay hidden (never a stale banner);
   *   - a transient poll error → stay hidden but KEEP the id, so the next visit
   *     retries. A network blip is not a verdict on the review.
   */
  private checkPendingReview(): void {
    const uploadId = this.pendingReview.get();
    if (!uploadId) return;
    this.weaknessReview
      .pollUpload(uploadId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          if (job.status === 'AWAITING_REVIEW') {
            this.pendingReviewId.set(uploadId);
            return;
          }
          this.pendingReview.clear();
          this.pendingReviewId.set(null);
        },
        error: () => this.pendingReviewId.set(null),
      });
  }

  /**
   * Re-project a retired fog cluster into a sovereign map (ADR-223) → navigate
   * to the new map. Fail-loud: a failure shows an inline error and clears the
   * busy flag; guards against double-convert while in-flight.
   */
  convert(clusterId: string): void {
    if (this.converting()) return;
    this.converting.set(clusterId);
    this.convertError.set(null);
    this.mapsService
      .convertCluster(clusterId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (goalId) => {
          this.converting.set(null);
          if (!goalId) {
            this.convertError.set('aplus.knowledge.convert_error');
            return;
          }
          this.mapsService.load();
          this.mapsService.loadLegacyClusters();
          void this.router.navigate(['/a/knowledge', goalId]);
        },
        error: () => {
          this.converting.set(null);
          this.convertError.set('aplus.knowledge.convert_error');
        },
      });
  }

  /** Retry the Atlas load after an error. */
  retry(): void {
    this.mapsService.load();
  }

  /** Open the inline new-map form (clearing any stale error). */
  openForm(): void {
    this.createError.set(null);
    this.formOpen.set(true);
  }

  /** Cancel + reset the inline form. */
  cancelForm(): void {
    this.form.reset({ name: '' });
    this.createError.set(null);
    this.formOpen.set(false);
  }

  /**
   * The card's display title: the root-concept title, else the north-star note,
   * else '' — the template then shows the "Untitled map" label.
   */
  cardTitle(map: MapCard): string {
    return map.title || map.northStarNote;
  }

  /**
   * Submit the new-map form → 2-step create → on success reset + refresh the
   * Atlas. Fail-loud: a failure shows an inline i18n error and clears the busy
   * flag; nothing is fabricated. Guards against double-submit while in-flight.
   */
  submit(): void {
    if (this.form.invalid || this.creating()) return;
    const name = this.form.controls.name.value.trim();
    if (!name) return;

    this.creating.set(true);
    this.createError.set(null);
    this.mapsService
      .createMap(name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.form.reset({ name: '' });
          this.formOpen.set(false);
          this.mapsService.load();
        },
        error: () => {
          this.creating.set(false);
          this.createError.set('aplus.knowledge.create_error');
        },
      });
  }

  /**
   * Trash clicked → open the confirm MODAL (danger). Delete only if confirmed.
   * A custom overlay dialog, NOT window.confirm (automation-safe, non-blocking).
   */
  async promptDeleteMap(goalId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'aplus.knowledge.map_delete',
      message: 'aplus.knowledge.map_delete_confirm',
      confirmText: 'aplus.knowledge.map_delete_yes',
      cancelText: 'aplus.knowledge.cancel',
      variant: 'danger',
    });
    if (ok) this.deleteMap(goalId);
  }

  /**
   * Soft-delete a whole map (a Goal, ADR-214). A "Map removed" toast on success;
   * a fail-loud error toast on failure. Guards against double-delete; refreshes
   * the Atlas so the removed map drops out of the grid.
   */
  deleteMap(goalId: string): void {
    if (this.deletingId()) return;
    this.deletingId.set(goalId);
    this.mapsService
      .deleteMap(goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deletingId.set(null);
          this.toast.show('aplus.knowledge.map_removed', 'success');
          this.mapsService.load();
        },
        error: () => {
          this.deletingId.set(null);
          this.toast.show('aplus.knowledge.map_delete_error', 'error');
        },
      });
  }
}
