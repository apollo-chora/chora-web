/**
 * CollectionsDetailComponent — A+ personal collection detail view (WS-6b).
 *
 * Route: `/a/study/collections/:collectionId` (parent adds to aplus.routes.ts;
 * uses withComponentInputBinding so `:collectionId` maps to the
 * `collectionId` signal input automatically).
 *
 * Shows the Collection's title, description, visibility, and ordered atom
 * list. Provides edit and delete CTAs. Delete uses an inline confirm flow
 * (role="dialog" on the confirm overlay) rather than a separate route.
 *
 * Fail-loud per feedback_no_stubs_real_wiring: BFF endpoint not yet proxied
 * in chora-gateway (WS-6b-BE-A1). No mock fallback.
 *
 * Domain vocabulary: Collection = curated ordered list of LearningAtoms.
 * LearningAtom remains the PRIMARY AGGREGATE ROOT — this component displays
 * atom references but does NOT own atom content.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { catchError, of } from 'rxjs';

import { TranslateService } from '../../../../../core/services/translate.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { CollectionsService } from '../collections.service';
import type {
  CollectionAtomRef,
  CollectionVisibility,
  StudyListExclusion,
} from '../collections.model';

/**
 * WS-4 / ADR-233 D11 — map a wire reason code to a human i18n key.
 *
 * The learner is owed an explanation, never a reason code. The four cases below
 * are the codes the backend emits; the `default` arm is what keeps a raw string
 * off the screen if a future code ever ships ahead of this UI.
 */
function exclusionReasonKey(reason: string): string {
  switch (reason) {
    case 'REUSE_VISIBILITY_NARROWED':
      return 'aplus.collections.convert_excluded_reason_narrowed';
    case 'ATOM_NOT_PUBLISHED':
      return 'aplus.collections.convert_excluded_reason_not_published';
    case 'NOT_IN_FRIEND_SET':
      return 'aplus.collections.convert_excluded_reason_not_friend';
    case 'ATOM_NOT_FOUND':
      return 'aplus.collections.convert_excluded_reason_unavailable';
    default:
      return 'aplus.collections.convert_excluded_reason_unavailable';
  }
}

/**
 * Map an audience to its FA icon (ADR-233 D7: private | friends | tenant).
 * `tenant` is a SHARED collection — it must never wear a padlock.
 */
function visibilityIcon(v: CollectionVisibility): string {
  if (v === 'friends') return 'fa-solid fa-user-group';
  if (v === 'tenant') return 'fa-solid fa-building';
  return 'fa-solid fa-lock';
}

/** Map an audience to its i18n KEY — never a literal (see exclusionReasonKey). */
function visibilityLabelKey(v: CollectionVisibility): string {
  if (v === 'friends') return 'aplus.collections.visibility_friends';
  if (v === 'tenant') return 'aplus.collections.visibility_tenant';
  return 'aplus.collections.visibility_private';
}

/** GCID short-form: first 8 chars. */
function gcidShort(gcid: string): string {
  return gcid.slice(0, 8) + '…';
}

@Component({
  selector: 'chora-aplus-collections-detail',
  imports: [RouterLink, DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collections-detail.component.html',
  styleUrl: './collections-detail.component.scss',
})
export class CollectionsDetailComponent {
  /** Route param injected via withComponentInputBinding. */
  readonly collectionId = input.required<string>();

  private readonly collectionsService = inject(CollectionsService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  // ── AsyncState from service ────────────────────────────────────────────
  readonly state = this.collectionsService.detailState;
  readonly collection = this.collectionsService.detailCollection;

  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Whether the error is the known WS-6b-BE-A1 contract gap. */
  readonly isContractGap = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'error' && s.error === 'aplus.collections.error_gateway_not_wired';
  });

  readonly isNotFound = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'error' && s.error === 'aplus.collections.error_not_found';
  });

  /** Ordered atoms from the collection. */
  readonly atoms = computed<readonly CollectionAtomRef[]>(() => {
    const c = this.collection();
    return c?.atoms ?? [];
  });

  // ── Delete confirm flow (inline dialog) ───────────────────────────────────
  readonly showDeleteConfirm = signal<boolean>(false);
  readonly deleteInProgress = signal<boolean>(false);
  readonly deleteError = signal<string | null>(null);

  openDeleteConfirm(): void {
    this.showDeleteConfirm.set(true);
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const id = this.collectionId();
    if (!id) return;
    this.deleteInProgress.set(true);
    this.deleteError.set(null);
    this.collectionsService
      .delete(id)
      .pipe(catchError(() => of(null)))
      .subscribe({
        complete: () => {
          this.deleteInProgress.set(false);
          this.showDeleteConfirm.set(false);
          this.router.navigate(['/a/study/collections']);
        },
        error: () => {
          this.deleteInProgress.set(false);
          this.deleteError.set('aplus.collections.error_delete_failed');
        },
      });
  }

  // ── Remove atom ───────────────────────────────────────────────────────────
  readonly atomOpState = this.collectionsService.atomOpState;

  /** Atom-op error message when status is 'error', else empty string. */
  readonly atomOpError = computed<string>(() => {
    const s = this.atomOpState();
    return s.status === 'error' ? s.error : '';
  });

  removeAtom(atomId: string): void {
    const id = this.collectionId();
    if (!id) return;
    this.collectionsService.removeAtom(id, atomId).pipe(catchError(() => of(null))).subscribe();
  }

  // ── Convert to study list (WS-4 · ADR-233) ────────────────────────────────
  //
  // D11: conversion is a PARTIAL SUCCESS. chora-creation re-evaluates the
  // reuse gate per atom against THIS learner, right now. Atoms whose author has
  // since restricted them are dropped and NAMED. The collection is untouched,
  // so if the author re-widens, converting again picks them up.

  readonly convertState = this.collectionsService.convertState;
  readonly convertResult = this.collectionsService.convertResult;

  readonly showConvertConfirm = signal<boolean>(false);

  readonly convertInProgress = computed<boolean>(
    () => this.convertState().status === 'submitting',
  );

  /** i18n key for the convert failure, else empty string. */
  readonly convertError = computed<string>(() => {
    const s = this.convertState();
    return s.status === 'error' ? s.error : '';
  });

  /** Atoms left behind by the last conversion (D11 named exclusions). */
  readonly convertExclusions = computed<readonly StudyListExclusion[]>(
    () => this.convertResult()?.excluded ?? [],
  );

  /** How many atoms actually made it into the study list. */
  readonly convertedCount = computed<number>(() => this.convertResult()?.atom_count ?? 0);

  openConvertConfirm(): void {
    this.showConvertConfirm.set(true);
  }

  cancelConvert(): void {
    this.showConvertConfirm.set(false);
  }

  confirmConvert(): void {
    const id = this.collectionId();
    if (!id) return;
    this.collectionsService
      .convertToStudyList(id)
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        // Close the dialog either way — success surfaces the result panel,
        // failure surfaces the error banner. Both live on the page, not in
        // the dialog, so the learner keeps the collection in view.
        this.showConvertConfirm.set(false);
      });
  }

  dismissConvertResult(): void {
    this.collectionsService.resetConvertState();
  }

  // ── Display helpers ───────────────────────────────────────────────────────
  readonly visibilityIcon = visibilityIcon;
  readonly visibilityLabelKey = visibilityLabelKey;
  readonly gcidShort = gcidShort;
  readonly exclusionReasonKey = exclusionReasonKey;

  /** Screen-reader label for the audience badge, e.g. "Audience: Friends". */
  visibilityAria(v: CollectionVisibility): string {
    return this.translate.instant('aplus.collections.visibility_badge_aria', {
      audience: this.translate.instant(visibilityLabelKey(v)),
    });
  }

  constructor() {
    // Load on init and whenever collectionId param changes.
    effect(() => {
      const id = this.collectionId();
      if (id) {
        this.collectionsService.loadDetail(id);
      }
    });
  }

  retryLoad(): void {
    this.collectionsService.loadDetail(this.collectionId());
  }
}
