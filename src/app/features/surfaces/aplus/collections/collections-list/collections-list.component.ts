/**
 * CollectionsListComponent — A+ personal collections list (WS-6b).
 *
 * Route: `/a/study/collections` — the Collections tab of the Study hub
 * (study.routes.ts). MOVED there from the surface-level `/a/collections` by
 * CHO-2217, which redirects. Collections are the SOURCE a study list is derived
 * from, so they live beside it under one hub; before that this page was in no
 * navigation at all and could only be reached by typing the URL.
 *
 * Shows a glass-panel grid of the authenticated user's personal Collections.
 * Each card links to /a/study/collections/{collection_id}.
 * Empty state provides a "Create your first" CTA to /a/study/collections/new.
 *
 * Fail-loud per feedback_no_stubs_real_wiring: BFF endpoint not yet proxied
 * in chora-gateway as of 2026-05-26 → surfaces as contract-gap banner
 * (WS-6b-BE-A1). No mock fallback.
 *
 * Domain vocabulary: Collection = curated ordered list of LearningAtoms.
 * NOT "playlist", "folder", or "album".
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { TranslateService } from '../../../../../core/services/translate.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { StudySubNavComponent } from '../../study/study-sub-nav/study-sub-nav.component';
import { CoursesSubNavComponent } from '../../courses-sub-nav/courses-sub-nav.component';
import { CollectionsService } from '../collections.service';
import type { Collection, CollectionVisibility } from '../collections.model';

/**
 * Map an audience to its FA icon (ADR-233 D7: private | friends | tenant).
 * `tenant` is a SHARED collection — it must never wear a padlock.
 */
function visibilityIcon(v: CollectionVisibility): string {
  if (v === 'friends') return 'fa-solid fa-user-group';
  if (v === 'tenant') return 'fa-solid fa-building';
  return 'fa-solid fa-lock';
}

/**
 * Map an audience to its i18n KEY (never a literal — the label is translated at
 * the render boundary, same contract as `exclusionReasonKey` in the detail view).
 */
function visibilityLabelKey(v: CollectionVisibility): string {
  if (v === 'friends') return 'aplus.collections.visibility_friends';
  if (v === 'tenant') return 'aplus.collections.visibility_tenant';
  return 'aplus.collections.visibility_private';
}

/** Derive atom count from atoms array or default to 0. */
function atomCount(c: Collection): number {
  return c.atoms?.length ?? 0;
}

@Component({
  selector: 'chora-aplus-collections-list',
  imports: [RouterLink, DatePipe, TranslatePipe, StudySubNavComponent, CoursesSubNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collections-list.component.html',
  styleUrl: './collections-list.component.scss',
})
export class CollectionsListComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly translate = inject(TranslateService);

  // ── AsyncState from service ───────────────────────────────────────────────
  readonly state = this.collectionsService.listState;
  readonly collections = this.collectionsService.collections;

  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });
  readonly isEmpty = computed<boolean>(
    () => this.state().status === 'success' && this.collections().length === 0,
  );

  /**
   * Whether the error is the known WS-6b-BE-A1 contract gap (Collection
   * endpoints not yet proxied in chora-gateway).
   */
  readonly isContractGap = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'error' && s.error === 'aplus.collections.error_gateway_not_wired';
  });

  // ── Display helpers ───────────────────────────────────────────────────────
  readonly visibilityIcon = visibilityIcon;
  readonly visibilityLabelKey = visibilityLabelKey;
  readonly atomCount = atomCount;

  /**
   * Screen-reader label for the audience badge, e.g. "Audience: Organisation".
   * Built from a parameterised key rather than concatenating a prefix onto the
   * label — word order is not universal, so the whole sentence must be
   * translatable.
   */
  visibilityAria(v: CollectionVisibility): string {
    return this.translate.instant('aplus.collections.visibility_badge_aria', {
      audience: this.translate.instant(visibilityLabelKey(v)),
    });
  }

  constructor() {
    // Load on init.
    effect(() => {
      this.collectionsService.loadList();
    }, { allowSignalWrites: false });
  }

  retryLoad(): void {
    this.collectionsService.loadList();
  }
}
