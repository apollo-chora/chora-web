/**
 * MeTranscriptComponent — `/a/me/transcript`.
 *
 * The learner's own transcript: every graded outcome (assessment submission /
 * course certification) projected into chora-consumption's StudentTranscript,
 * newest-first. Wired LIVE to `MeTranscriptService.loadTranscript()` → real
 * `GET /api/v1/me/transcript`. No stubs, no fixtures. Fail-loud: a spinner, an
 * error banner with a retry CTA, an honest empty-state, then the rows.
 *
 * A null score renders as an em-dash "—" (certifications carry no score),
 * NEVER a fabricated 0%. A null pass flag renders no pass/fail chip.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MeTranscriptService } from './me-transcript.service';
import type { TranscriptEntry, TranscriptKind } from './me-transcript.model';
import { CoursesSubNavComponent } from '../courses-sub-nav/courses-sub-nav.component';

/** Pass/fail chip state; `null` ⇒ render no chip (score-less certification). */
type PassState = 'pass' | 'fail' | null;

interface TranscriptRowVm {
  readonly entryId: string;
  readonly title: string;
  readonly kind: TranscriptKind;
  /** Rounded percent string ("80%"), or an em-dash "—" when there is no score. */
  readonly scoreDisplay: string;
  readonly passState: PassState;
  readonly dateDisplay: string;
}

@Component({
  selector: 'chora-aplus-me-transcript',
  imports: [TranslatePipe, CoursesSubNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me-transcript.component.html',
  styleUrl: './me-transcript.component.scss',
})
export class MeTranscriptComponent {
  private readonly service = inject(MeTranscriptService);

  readonly state = this.service.state;

  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  readonly isEmpty = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'success' && s.items.length === 0;
  });

  /** BE returns newest-first; the VM preserves that order (no client re-sort). */
  readonly rows = computed<readonly TranscriptRowVm[]>(() =>
    this.service.items().map((e) => this.buildRowVm(e)),
  );

  constructor() {
    this.service.loadTranscript();
  }

  retry(): void {
    this.service.loadTranscript();
  }

  private buildRowVm(e: TranscriptEntry): TranscriptRowVm {
    return {
      entryId: e.entryId,
      title: e.title,
      kind: e.kind,
      scoreDisplay: this.formatScore(e.scorePercent),
      passState: this.derivePassState(e.passed),
      dateDisplay: this.formatDate(e.occurredAt),
    };
  }

  /** Null score ⇒ hyphen (never 0%). A real 0 renders "0%". */
  private formatScore(scorePercent: number | null): string {
    if (scorePercent === null) {
      return '-';
    }
    return `${Math.round(scorePercent)}%`;
  }

  private derivePassState(passed: boolean | null): PassState {
    if (passed === null) {
      return null;
    }
    return passed ? 'pass' : 'fail';
  }

  /**
   * Format the ISO occurred_at as a short UTC date ("20 May 2026"). UTC keeps
   * the render deterministic across the viewer's timezone; an unparseable
   * value falls through to the raw string (fail-visible, never crashes).
   */
  private formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
}
