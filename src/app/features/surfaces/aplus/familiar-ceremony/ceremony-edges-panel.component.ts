/**
 * CeremonyEdgesPanelComponent — the binding-ceremony learning-edges panel
 * (CHO-2040, owner ruling R8-3; CR §8 R7-3 composed edge-scout runner).
 *
 * Revealed right after a successful Familiar→Goal attach on `/a/companion`
 * (the R3-5 familiar-side affordance — hosted by
 * FamiliarBindingCeremonyComponent). On reveal it AUTO-calls the propose
 * runner (skeleton while loading): the Familiar "scouts" the learner's past
 * (weaknesses ∪ graded comments) + the goal's surroundings (fog) and offers
 * a labelled checkbox list — REMEDIATE ("strengthen these") ∪ EXPLORE
 * ("venture here"), visually separated, nothing pre-ticked (learner
 * sovereignty). Confirm mints the ticked edges onto the knowledge map
 * (CHO-2038) THEN feeds the Familiar's memory; a memory-hook failure after
 * a successful mint is NON-blocking (warning + hook-only retry).
 *
 * States: skeleton / typed error + retry / fallback ("starting fresh",
 * explore-only) / empty (encouraging, re-scout stays) / confirm-in-flight /
 * success (celebratory beat + "See them on your map" deep-link to
 * /a/knowledge/{goalId}). 402 → the app's ManaTopupModal upsell pattern.
 * Selection is capped at 8 (mirrors edgescout.MaxCandidates).
 *
 * Design language: progressive staggered reveal, easing
 * `cubic-bezier(.165,.84,.44,1)`, glassmorphism tokens, tablet-first.
 * a11y: heading receives focus on reveal, `role="status"` on async regions,
 * native checkboxes for keyboard ticking.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ManaTopupModalComponent } from '../../../../shared/components/mana-topup-modal/mana-topup-modal.component';
import { MeManaService } from '../../../../core/services/me-mana.service';
import {
  recommendedManaPackSku,
  type InsufficientManaUpsell,
} from '../../../../core/services/me-mana.model';
import { CeremonyEdgesService } from './ceremony-edges.service';
import {
  CEREMONY_SELECTION_CAP,
  extractManaUpsell,
  mintErrorKey,
  proposeErrorKey,
  type CeremonyConfirmState,
  type CeremonyEdgeIntent,
  type CeremonyMemoryReceipt,
  type EdgeScoutCandidate,
  type EdgeScoutProposal,
  type EdgeScoutState,
} from './ceremony-edges.model';

/** A candidate paired with its stable index in the proposal array. */
interface IndexedCandidate {
  readonly candidate: EdgeScoutCandidate;
  readonly index: number;
}

@Component({
  selector: 'chora-aplus-ceremony-edges-panel',
  imports: [RouterLink, TranslatePipe, ManaTopupModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ceremony-edges-panel.component.html',
  styleUrl: './ceremony-edges-panel.component.scss',
})
export class CeremonyEdgesPanelComponent {
  private readonly ceremony = inject(CeremonyEdgesService);
  private readonly manaService = inject(MeManaService);
  private readonly destroyRef = inject(DestroyRef);

  /** The bound Familiar (the scout). */
  readonly familiarId = input.required<string>();
  /** The freshly attached Goal the ceremony orbits. */
  readonly goalId = input.required<string>();

  readonly selectionCap = CEREMONY_SELECTION_CAP;

  // ── State (discriminated unions per CLAUDE.md §3) ─────────────────────
  readonly scout = signal<EdgeScoutState>({ status: 'loading' });
  readonly confirmState = signal<CeremonyConfirmState>({ status: 'idle' });
  /** Ticked candidate indexes (into the proposal's candidates array). */
  readonly selected = signal<ReadonlySet<number>>(new Set<number>());
  /** Non-null → the 402 upsell modal is open. */
  readonly upsell = signal<InsufficientManaUpsell | null>(null);

  readonly manaTopupState = this.manaService.topupState;

  readonly heading =
    viewChild<ElementRef<HTMLElement>>('ceremonyHeading');

  // ── Derived views ─────────────────────────────────────────────────────
  readonly proposal = computed<EdgeScoutProposal | null>(() => {
    const s = this.scout();
    return s.status === 'success' ? s.proposal : null;
  });

  readonly remediateCandidates = computed<readonly IndexedCandidate[]>(() =>
    this.byIntent('remediate'),
  );

  readonly exploreCandidates = computed<readonly IndexedCandidate[]>(() =>
    this.byIntent('explore'),
  );

  readonly selectedCount = computed<number>(() => this.selected().size);
  readonly atCap = computed<boolean>(
    () => this.selectedCount() >= CEREMONY_SELECTION_CAP,
  );

  readonly confirmInflight = computed<boolean>(
    () => this.confirmState().status === 'inflight',
  );

  readonly confirmed = computed<boolean>(
    () => this.confirmState().status === 'success',
  );

  /** The minted-edge count for the success beat. */
  readonly mintedCount = computed<number>(() => {
    const c = this.confirmState();
    return c.status === 'success' ? c.outcome.minted.length : 0;
  });

  /** True when the mint landed but the Familiar memory hook failed. */
  readonly memorySyncFailed = computed<boolean>(() => {
    const c = this.confirmState();
    return c.status === 'success' && c.outcome.memory.status === 'failed';
  });

  readonly memoryRetrying = computed<boolean>(() => {
    const c = this.confirmState();
    return c.status === 'success' && c.retrying;
  });

  private focusedOnce = false;
  private proposedOnce = false;

  constructor() {
    // Auto-propose on reveal (the brief's locked choreography) — inputs are
    // only readable once bound, so an effect (not the constructor body)
    // kicks the first scout EXACTLY once per mount (re-scout is explicit;
    // an effect keyed on state would double-fire the charged call).
    effect(() => {
      const familiarId = this.familiarId();
      const goalId = this.goalId();
      if (familiarId && goalId && !this.proposedOnce) {
        this.proposedOnce = true;
        this.runPropose(familiarId, goalId);
      }
    });
    // Focus lands on the panel heading when the reveal settles (a11y:
    // the ceremony appears mid-page after the attach action).
    effect(() => {
      const el = this.heading()?.nativeElement;
      if (el && !this.focusedOnce) {
        this.focusedOnce = true;
        queueMicrotask(() => el.focus());
      }
    });
  }

  // ── Propose / re-scout ────────────────────────────────────────────────

  /** Re-run the scout (WILL charge — the mana chip shows the receipt). */
  rescout(): void {
    if (this.scout().status === 'loading' || this.confirmInflight()) return;
    this.scout.set({ status: 'loading' });
    this.confirmState.set({ status: 'idle' });
    this.selected.set(new Set<number>());
    this.runPropose(this.familiarId(), this.goalId());
  }

  private runPropose(familiarId: string, goalId: string): void {
    this.ceremony
      .propose(familiarId, goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proposal) => {
          this.scout.set({ status: 'success', proposal });
        },
        error: (err: unknown) => {
          const upsell = extractManaUpsell(err);
          if (upsell) {
            // Mana-short: surface the app's upsell modal and keep the
            // panel on an honest error state behind it (retry re-scouts).
            this.upsell.set(upsell);
          }
          this.scout.set({ status: 'error', error: proposeErrorKey(err) });
        },
      });
  }

  // ── Selection (learner sovereignty — nothing pre-ticked) ─────────────

  toggle(index: number): void {
    if (this.confirmInflight() || this.confirmed()) return;
    const current = new Set(this.selected());
    if (current.has(index)) {
      current.delete(index);
    } else {
      if (current.size >= CEREMONY_SELECTION_CAP) return; // cap: no 9th tick
      current.add(index);
    }
    this.selected.set(current);
  }

  isTickDisabled(index: number): boolean {
    if (this.confirmInflight() || this.confirmed()) return true;
    return this.atCap() && !this.selected().has(index);
  }

  // ── Confirm orchestration (mint → memory hook) ────────────────────────

  onConfirm(): void {
    const proposal = this.proposal();
    if (!proposal || this.confirmInflight() || this.selectedCount() === 0) {
      return;
    }
    const picks = [...this.selected()]
      .sort((a, b) => a - b)
      .map((i) => proposal.candidates[i])
      .filter((c): c is EdgeScoutCandidate => !!c)
      .map((c) => ({
        title: c.title,
        intent: c.intent,
        ...(c.atom_refs && c.atom_refs.length > 0
          ? { atomRefs: c.atom_refs }
          : {}),
      }));
    if (picks.length === 0) return;

    this.confirmState.set({ status: 'inflight' });
    this.ceremony
      .confirmSelection(this.familiarId(), this.goalId(), picks)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.confirmState.set({
            status: 'success',
            outcome,
            retrying: false,
          });
        },
        error: (err: unknown) => {
          // Mint failed — NOTHING was written; back to the list, fail-loud.
          this.confirmState.set({ status: 'error', error: mintErrorKey(err) });
        },
      });
  }

  /** Retry ONLY the memory hook (the edges are already minted). */
  retryMemorySync(): void {
    const c = this.confirmState();
    if (c.status !== 'success' || c.outcome.memory.status !== 'failed' || c.retrying) {
      return;
    }
    this.confirmState.set({ ...c, retrying: true });
    this.ceremony
      .confirmMemory(this.familiarId(), this.goalId(), c.outcome.minted)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (receipt: CeremonyMemoryReceipt) => {
          this.confirmState.set({
            status: 'success',
            outcome: {
              minted: c.outcome.minted,
              memory: { status: 'synced', receipt },
            },
            retrying: false,
          });
        },
        error: () => {
          // Still failed — keep the honest warning; retry stays available.
          this.confirmState.set({ ...c, retrying: false });
        },
      });
  }

  // ── 402 upsell (the app's ManaTopupModal pattern) ─────────────────────

  onTopupDismissed(): void {
    this.upsell.set(null);
    this.manaService.clearTopupState();
  }

  onTopupRequested(): void {
    const upsell = this.upsell();
    if (!upsell) return;
    const gap = Math.max(0, upsell.required_units - upsell.current_balance_units);
    const sku = recommendedManaPackSku(upsell.recommended_topup_units ?? gap);
    this.manaService.checkoutMana(sku);
  }

  // ── Template helpers ──────────────────────────────────────────────────

  sourceKey(c: EdgeScoutCandidate): string {
    return `familiar.ceremony.source_${c.source}`;
  }

  atomRefCount(c: EdgeScoutCandidate): number {
    return c.atom_refs?.length ?? 0;
  }

  private byIntent(intent: CeremonyEdgeIntent): readonly IndexedCandidate[] {
    const proposal = this.proposal();
    if (!proposal) return [];
    return proposal.candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter((e) => e.candidate.intent === intent);
  }
}
