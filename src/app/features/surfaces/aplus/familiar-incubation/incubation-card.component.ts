/**
 * IncubationCardComponent — F-I2 (CHO-2089, ADR-228 incubation arc).
 *
 * The pre-hatch "incubation card" surfaced on the roster/profile for a bound,
 * unhatched (Stage-0) egg. It shows:
 *   - a MYSTERY-species egg visual (breed-neutral iridescent egg per ADR-149
 *     §3.3). For a learner's FIRST egg the species itself is the mystery; for a
 *     LATER egg the species is already committed (one-species-per-user — the
 *     species of the oldest revealed sibling) so the mystery is rarity/shiny;
 *   - a WARMING BAR = incubation EXP / hatch threshold. When it fills the egg
 *     is "stirring" and the hatch ceremony CTA appears (F-I1 gates the hatch on
 *     the same threshold server-side; a premature POST /hatch 409s NOT_STIRRING);
 *   - the BOUND-GOAL name (the Goal whose `attachedFamiliarId` is this egg).
 *
 * ── API-GAP (flagged) ────────────────────────────────────────────────────
 * The warming-bar NUMERATOR is exposed (`growth_state.exp` == cumulative
 * incubation EXP at Stage 0), but the DENOMINATOR — the hatch threshold — is
 * NOT surfaced by the growth-state DTO. `exp_next_threshold` is the STAGE curve
 * and is 0 at Stage 0 (StageForExp/NextThreshold), while the real gate is the
 * runtime-config `FAMILIAR_HATCH_EXP_THRESHOLD` (domain default
 * growth.DefaultHatchExpThreshold = 25). There is also no `stirring`/ready
 * boolean on the wire. Until the DTO surfaces `hatch_exp_threshold` + a
 * `stirring` flag, this card MIRRORS the domain default via {@link
 * HATCH_EXP_THRESHOLD} and DERIVES `stirring` = exp >= threshold. See the F-I2
 * report + CHO-2089.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../dashboard/goal/goal.service';
import type { FamiliarGrowthState } from '../../../../core/familiar/familiar-growth.model';

/**
 * Hatch EXP threshold FALLBACK, mirrored from the consumption domain default
 * (growth.DefaultHatchExpThreshold). Since CHO-2089's BE read enrichment the
 * Stage-0 growth read surfaces the real gate as `expNextThreshold` — the card
 * prefers the wire value and only falls back here when it is absent/zero
 * (older cached reads).
 */
export const HATCH_EXP_THRESHOLD = 25;

@Component({
  selector: 'chora-aplus-incubation-card',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './incubation-card.component.html',
  styleUrl: './incubation-card.component.scss',
})
export class IncubationCardComponent implements OnInit {
  private readonly growthService = inject(FamiliarGrowthService);
  private readonly goalService = inject(GoalService);

  /** The egg's Familiar id (the card is `[familiarId]`-driven). */
  readonly familiarId = input.required<string>();

  // ── Fetched state ───────────────────────────────────────────────────
  private readonly growth = signal<FamiliarGrowthState | null>(null);
  /** Fail-loud: a growth-read failure renders the error banner + retry. */
  readonly loadError = signal<boolean>(false);

  /**
   * The hatch gate: the wire's `expNextThreshold` (surfaced for Stage-0 reads
   * since CHO-2089's BE enrichment), falling back to the mirrored domain
   * default for absent/zero values.
   */
  readonly hatchThreshold = computed<number>(() => {
    const wire = this.growth()?.expNextThreshold ?? 0;
    return wire > 0 ? wire : HATCH_EXP_THRESHOLD;
  });

  // ── Derived view state ──────────────────────────────────────────────
  /** True only for a genuine pre-hatch egg (Stage 0, never hatched). */
  readonly isEgg = computed<boolean>(() => {
    const g = this.growth();
    return !!g && g.growthStage === 0 && !g.hatchedAt;
  });

  /** Incubation EXP accrued (warming-bar numerator). */
  readonly expCurrent = computed<number>(() => this.growth()?.expCurrent ?? 0);

  /** Warming-bar fill 0–100 (clamped). */
  readonly warmthPct = computed<number>(() =>
    Math.max(
      0,
      Math.min(
        100,
        Math.round((this.expCurrent() / this.hatchThreshold()) * 100),
      ),
    ),
  );

  /** Ready to hatch — the bar is full (the BE enforces the same gate; 409). */
  readonly stirring = computed<boolean>(
    () => this.expCurrent() >= this.hatchThreshold(),
  );

  // The species is DELIBERATELY not surfaced here: on the incubation card the
  // breed stays a mystery until the companion HATCHES — the ceremony reveal is
  // the only place it is shown (owner directive 2026-07-16; supersedes ADR-228's
  // later-egg committed-species reveal). So the card fetches no roster.

  /** The bound Goal's north-star note (empty when no Goal is attached). */
  readonly boundGoalName = computed<string>(() => {
    const myId = this.familiarId();
    const g = this.goalService.goals().find((x) => x.attachedFamiliarId === myId);
    return g?.northStarNote ?? '';
  });

  // The NAME is deliberately not surfaced here. A pre-hatch pod has no
  // learner-chosen name: the name is committed by the hatch POST
  // (FamiliarGrowthService.hatch(id, { displayName })), which is the same call
  // that moves the Familiar off Stage 0, and there is no pre-hatch rename
  // route. The `name` the wire carries at Stage 0 is the server-side NOT NULL
  // placeholder that chora-consumption seeds "so the row satisfies NOT NULL
  // constraints" while the "UI computes the breed-aware nickname at display
  // time": never something the learner typed. This card is gated on isEgg(),
  // so it renders the untitled-Pod string unconditionally rather than leaking
  // that placeholder (it read "Egg" on a screen whose vocabulary is Pod).
  // See learnerFamiliarName() for the same rule where a screen mixes stages.

  ngOnInit(): void {
    this.reload();
  }

  /** (Re)fetch the egg growth + goals. Retry CTA target. */
  reload(): void {
    const id = this.familiarId();
    if (!id) return;
    this.loadError.set(false);
    this.growthService.getGrowth(id).subscribe({
      next: (s) => this.growth.set(s),
      error: () => this.loadError.set(true),
    });
    // Goals populate GoalService.goals() (signal) — the bound-goal computed
    // reads it reactively. Degraded goals never break the card (ADR-204 §3).
    this.goalService.load();
  }
}
