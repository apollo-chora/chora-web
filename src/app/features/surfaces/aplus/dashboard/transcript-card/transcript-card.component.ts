/**
 * TranscriptCardComponent — the A+ dashboard `transcript` wrapper (CHO-2237).
 *
 * WHY THIS EXISTS: the transcript shipped behind a top-level "Transcript"
 * sidebar entry (W6 outcome spine — there was no Learn sub-nav to house it),
 * and CHO-2218 later ADDED the Learn sub-nav tab without removing that entry —
 * its own close comment recorded "'Move' is really 'add' — nothing was moved".
 * The transcript is the OUTCOME of Learn's assessments, so it lives INSIDE
 * Learn: this card is the glance, the CHO-2218 sub-nav tab stays the full hub.
 * `transcript` is LAST in DEFAULT_ORDER — outcomes close the dashboard's
 * narrative (their curriculum → your curation → your record).
 *
 * Reads `MeTranscriptService` (providedIn root — the same StudentTranscript
 * projection the full page renders, newest-first from the BE; no client
 * re-sort). The card owns its fetch like StudyListsCard: /me/transcript is a
 * distinct endpoint the dashboard shell does not call.
 *
 * 🔴 A null `scorePercent` renders as an em-dash, NEVER a fabricated 0% — a
 * certification carries no score, and a submitted-but-unreleased assessment
 * can exist before it has one (the model normalises both to null).
 *
 * Ungated (W6 integrative-UI decision, restated in CHO-2218's close): an empty
 * transcript renders its own honest empty state rather than hiding the card.
 *
 * Fail-loud: the error arm is first-class and can never render as "you have no
 * outcomes". Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush,
 * i18n via the translate pipe, tablet-first, axe-clean.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { TimeAgoPipe } from '../../../../../shared/pipes/time-ago.pipe';
import { MeTranscriptService } from '../../me-transcript/me-transcript.service';
import type { TranscriptEntry } from '../../me-transcript/me-transcript.model';

/** The dashboard is a GLANCE surface — the full record lives at /a/me/transcript. */
const CARD_LIMIT = 3;

@Component({
  selector: 'chora-aplus-transcript-card',
  standalone: true,
  imports: [RouterLink, TranslatePipe, TimeAgoPipe],
  templateUrl: './transcript-card.component.html',
  styleUrl: './transcript-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranscriptCardComponent {
  private readonly transcript = inject(MeTranscriptService);

  readonly state = this.transcript.state;

  /** Newest-first, straight from the projection — the card never re-sorts. */
  private readonly all = this.transcript.items;

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly isError = computed(() => this.state().status === 'error');

  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Empty is true ONLY for a successful fetch that returned nothing. */
  readonly isEmpty = computed(
    () => this.state().status === 'success' && this.all().length === 0,
  );

  readonly rows = computed<readonly TranscriptEntry[]>(() =>
    this.all().slice(0, CARD_LIMIT),
  );

  /** How many outcomes are NOT shown on the card (0 = no overflow hint). */
  readonly moreCount = computed(() => Math.max(0, this.all().length - CARD_LIMIT));

  constructor() {
    // Full fetch + local slice (the StudyListsCard pattern): the service state
    // is root-shared with the /a/me/transcript page, so a limit param here
    // would truncate what a subsequent page visit briefly renders.
    this.transcript.loadTranscript();
  }

  retryLoad(): void {
    this.transcript.loadTranscript();
  }

  /** Em-dash for null — never coerce a missing score to 0%. */
  scoreLabel(entry: TranscriptEntry): string {
    return entry.scorePercent === null ? '—' : `${Math.round(entry.scorePercent)}%`;
  }

  kindIcon(entry: TranscriptEntry): string {
    return entry.kind === 'certification'
      ? 'fa-solid fa-graduation-cap'
      : 'fa-solid fa-clipboard-check';
  }

  kindLabelKey(entry: TranscriptEntry): string {
    return entry.kind === 'certification'
      ? 'aplus.me_transcript.list.kind_certification'
      : 'aplus.me_transcript.list.kind_assessment';
  }
}
