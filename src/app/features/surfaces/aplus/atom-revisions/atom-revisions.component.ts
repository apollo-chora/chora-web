/**
 * AtomRevisionsComponent — A+ atom revision timeline (WS-7).
 *
 * Route: `/a/atoms/:atomId/revisions` (parent adds to aplus.routes.ts — not
 * in scope here; uses withComponentInputBinding so `:atomId` maps to the
 * `atomId` signal input automatically).
 *
 * Shows the append-only AtomRevision timeline (most recent first). Each card
 * shows revision_number, published_at (formatted), published_by_gcid (short
 * form), summary, and an expandable diff view (before/after content panels).
 *
 * Fail-loud per feedback_no_stubs_real_wiring: if the BFF endpoint returns
 * any error, a visible error banner with retry CTA is shown. A specific
 * "contract gap" banner is shown for the WS-7-BE-A1 gap (endpoint not yet
 * wired in chora-gateway as of 2026-05-26).
 *
 * AtomRevision is append-only per ddd-enforcement.md invariant #4.
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
import { DatePipe } from '@angular/common';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AtomRevisionsService } from './atom-revisions.service';
import type { AtomRevision, RevisionDiff } from './models';

/** GCID short-form: first 8 chars of the UUIDv7. */
function gcidShort(gcid: string): string {
  return gcid.slice(0, 8) + '…';
}

/** Stringify JSONB content for diff display. Returns '(empty)' on null/undefined. */
function contentToString(content: Record<string, unknown> | undefined): string {
  if (content == null) return '(content not included in listing response)';
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return '(unable to serialise content)';
  }
}

@Component({
  selector: 'chora-aplus-atom-revisions',
  imports: [DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atom-revisions.component.html',
  styleUrl: './atom-revisions.component.scss',
})
export class AtomRevisionsComponent {
  /** Route param injected via withComponentInputBinding. */
  readonly atomId = input.required<string>();

  private readonly revisionsService = inject(AtomRevisionsService);

  // ── AsyncState from service ────────────────────────────────────────
  readonly state = this.revisionsService.state;
  readonly revisions = this.revisionsService.revisions;

  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });
  readonly isEmpty = computed<boolean>(
    () => this.state().status === 'success' && this.revisions().length === 0,
  );

  /**
   * Whether the error is the known WS-7-BE-A1 contract gap (endpoint not yet
   * wired in chora-gateway). Surface as an explicit "not yet available" banner
   * distinct from a real upstream failure.
   */
  readonly isContractGap = computed<boolean>(() => {
    const s = this.state();
    if (s.status !== 'error') return false;
    // Both generic and not-found map to the contract gap until the endpoint lands.
    return (
      s.error === 'aplus.atom_revisions.error_generic' ||
      s.error === 'aplus.atom_revisions.error_not_found'
    );
  });

  // ── Diff expand/collapse (per-revision) ───────────────────────────
  /** Set of expanded revision_ids. */
  private readonly _expanded = signal<ReadonlySet<string>>(new Set());

  isExpanded(revisionId: string): boolean {
    return this._expanded().has(revisionId);
  }

  toggleDiff(revisionId: string): void {
    const current = this._expanded();
    const next = new Set(current);
    if (next.has(revisionId)) {
      next.delete(revisionId);
    } else {
      next.add(revisionId);
    }
    this._expanded.set(next);
  }

  // ── Diff computation ──────────────────────────────────────────────
  /**
   * Build a simple before/after diff for a revision.
   * "Before" = the previous revision's content snapshot (if available);
   * "After"  = this revision's content snapshot.
   *
   * No external diff library needed — the canonical diff format for revision
   * history is a side-by-side JSON before/after panel. If a package.json
   * diff library lands later, replace this with it.
   */
  buildDiff(revision: AtomRevision, index: number): RevisionDiff {
    const all = this.revisions();
    // revisions[] is most-recent first; index 0 = newest.
    // Previous (older) revision is at index + 1.
    const prevRevision = all[index + 1];
    const before = prevRevision
      ? contentToString(prevRevision.content)
      : '(first revision: no prior state)';
    const after = contentToString(revision.content);
    return { before, after };
  }

  // ── Display helpers ───────────────────────────────────────────────
  gcidShort = gcidShort;

  constructor() {
    // Load on init and whenever atomId param changes.
    effect(() => {
      const id = this.atomId();
      if (id) {
        this.revisionsService.load(id);
      }
    });
  }

  retryLoad(): void {
    this.revisionsService.load(this.atomId());
  }
}
