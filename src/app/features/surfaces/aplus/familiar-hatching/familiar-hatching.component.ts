/**
 * FamiliarHatchingComponent: `/a/companion/hatching/:familiarId`.
 *
 * Single-page 4-step ceremony wizard (CHO-2229, ADR-228 Phase 2 — the
 * reveal precedes naming). Steps:
 *
 *   1. CRACK      — pod shaking + cracks appearing; the "open" tap fires
 *                   the SINGLE POST /reveal (rolls + PERSISTS the breed;
 *                   idempotent — a re-POST returns the same roll)
 *   2. REVEAL     — the real rolled breed: "It's a {breed}!" with
 *                   per-rarity celebration treatment (common /
 *                   uncommon sparkle / rare glow / legendary screen-
 *                   wide light wash; shiny adds palette-swap)
 *   3. IDENTITY   — name + tone + persona, composed AGAINST the revealed
 *                   art: the learner names a companion they can see
 *   4. COMMIT     — review + confirm → the SINGLE POST /hatch (commit-only:
 *                   the BE reads the persisted roll; Stage 0 → 1; a second
 *                   POST 422s ALREADY_HATCHED) → the welcome panel with the
 *                   F-I2 first-Skill award + "Meet {name}"
 *
 * Re-entering the ceremony on a revealed-but-unnamed pod resumes at
 * IDENTITY via the idempotent reveal re-POST — the species can never
 * change once seen (it locks the account species server-side).
 *
 * Tones mirror the backend canonical set (growth.canonicalTones):
 * socratic | direct | encouraging. The resonant atom is optional at
 * hatch ("resolved post-hatch", mig 0038) so the ceremony no longer
 * asks for one.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import {
  breedStageLabel,
  normalizeAwakeningClass,
} from '../../../../core/familiar/familiar-growth.model';
import type {
  AwakeningClass,
  Rarity,
  RevealBreedResponse,
} from '../../../../core/familiar/familiar-growth.model';
import type {
  BreedSpecies,
} from '../../../../shared/components/breed-art/breed-art.component';

type StepId = 'crack' | 'reveal' | 'identity' | 'commit';
type Tone = 'socratic' | 'direct' | 'encouraging';

const STEP_ORDER: readonly StepId[] = ['crack', 'reveal', 'identity', 'commit'];
const TONES: readonly Tone[] = ['socratic', 'direct', 'encouraging'];
const PERSONAS: readonly string[] = [
  'cert-focused',
  'curious-explorer',
  'social-leader',
];

@Component({
  selector: 'chora-aplus-familiar-hatching',
  imports: [TranslatePipe, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-hatching.component.html',
  styleUrl: './familiar-hatching.component.scss',
})
export class FamiliarHatchingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly growth = inject(FamiliarGrowthService);

  readonly familiarId = signal<string>(
    this.route.snapshot.paramMap.get('familiarId') ?? '',
  );

  readonly currentStep = signal<StepId>('crack');
  readonly stepIndex = computed<number>(() =>
    STEP_ORDER.indexOf(this.currentStep()),
  );

  // ── Roll result (filled by the successful reveal POST) ────────────
  readonly rolledSpecies = signal<BreedSpecies | null>(null);
  readonly rolledShiny = signal<boolean>(false);
  readonly rolledRarity = signal<Rarity>('');
  readonly rolledProbability = signal<number>(0);
  /**
   * CHO-2235 — the reveal metaphor for the rolled species (art brief §2:
   * avian/mythic/reptile HATCH, mammal WAKE, machine POWER-ON). Resolved
   * by the backend on the reveal response; the FE renders it verbatim and
   * never maps species→class itself.
   */
  readonly awakeningClass = signal<AwakeningClass>('hatch');
  /** The hatched Familiar's id from the commit response (routing target). */
  readonly hatchedFamiliarId = signal<string>('');

  /**
   * F-I2 (CHO-2089) AWARD MOMENT: the first Skill (progress_mirror) minted
   * auto-equipped at hatch (ADR-228 st1 band). Surfaced on the post-commit
   * welcome panel as a named, usable award — not a tease. Empty until the
   * post-hatch loadout resolves; a loadout-read failure leaves it empty
   * (award panel omitted, never blocking the welcome — the Skill is
   * equipped server-side regardless).
   */
  readonly awardedSkillKey = signal<string>('');

  // ── Identity form state ───────────────────────────────────────────
  readonly displayName = signal<string>('');
  readonly tone = signal<Tone>('encouraging');
  readonly learnerPersona = signal<string>('cert-focused');

  // ── Reveal state (CHO-2229: the roll happens at the crack tap) ────
  readonly revealing = signal<boolean>(false);
  readonly revealError = signal<string | null>(null);

  // ── Commit state ──────────────────────────────────────────────────
  readonly committing = signal<boolean>(false);
  readonly commitError = signal<string | null>(null);
  /** True once the hatch commit landed — renders the welcome panel. */
  readonly committed = signal<boolean>(false);

  // ── Computed display helpers ──────────────────────────────────────
  readonly revealLabel = computed<string>(() => {
    const species = this.rolledSpecies();
    if (!species) return '';
    // Stage 1 — hatching takes the Familiar from Stage 0 (Egg) to
    // Stage 1 (Baby); the label is the per-breed stage-1 adjective.
    return breedStageLabel(species, 1);
  });

  /** English indefinite article for the reveal headline ("an Owlet",
   *  "a Kit"). Breed labels are English constants in the FE model, so an
   *  article helper here matches that reality. */
  readonly revealArticle = computed<string>(() =>
    /^[aeiou]/i.test(this.revealLabel()) ? 'an' : 'a',
  );

  /** Class-flavoured tagline key (CHO-2235): the reveal metaphor verb. */
  readonly revealTaglineKey = computed<string>(
    () => `aplus.familiar_hatching.reveal_tagline_${this.awakeningClass()}`,
  );

  // ── Awaken art (CHO-2235) ─────────────────────────────────────────
  // The per-species birth-moment image (<species>-awaken.png) is owner-
  // generated and may not exist yet (0 of 10 shipped). The stage-1
  // BreedArt render carries the step until the image LOADS; a load error
  // drops the image for the session — never a broken img.
  readonly awakenArtLoaded = signal<boolean>(false);
  readonly awakenArtFailed = signal<boolean>(false);
  readonly awakenArtReady = computed<boolean>(
    () => this.awakenArtLoaded() && !this.awakenArtFailed(),
  );
  readonly awakenArtUrl = computed<string>(() => {
    const species = this.rolledSpecies();
    return species
      ? `/assets/familiars/${species}/${species}-awaken.png`
      : '';
  });

  readonly canAdvanceFromIdentity = computed<boolean>(() => {
    return this.displayName().trim().length >= 2;
  });

  // ── Available options for the identity form ──────────────────────
  readonly tones = TONES;
  readonly personas = PERSONAS;
  readonly steps = STEP_ORDER;

  constructor() {
    const id = this.familiarId();
    if (!id) {
      this.router.navigate(['/a/companion']);
      return;
    }
    // Already-hatched guard: the ceremony is single-shot. A Stage ≥ 1
    // Familiar has nothing to hatch — send the learner to its profile.
    // A revealed-but-unnamed pod RESUMES at identity: the idempotent
    // reveal re-POST hydrates the persisted roll (it can never re-roll).
    this.growth.getGrowth(id).subscribe({
      next: (state) => {
        if (state.growthStage > 0) {
          this.router.navigate(['/a/companion', id]);
          return;
        }
        if (state.revealedAt) {
          this.resumeFromReveal(id);
        }
      },
      error: () => {
        // Leave the ceremony rendered — a transient growth-read failure
        // must not block hatching; revealPod()/commit() surface real
        // errors loudly.
      },
    });
  }

  /** Hydrate the persisted roll on re-entry and skip to the naming step. */
  private resumeFromReveal(id: string): void {
    this.growth.reveal(id).subscribe({
      next: (resp) => {
        this.applyRoll(resp);
        this.currentStep.set('identity');
      },
      error: () => {
        // Fall back to the normal flow — the crack tap retries the reveal.
      },
    });
  }

  private applyRoll(resp: RevealBreedResponse): void {
    this.rolledSpecies.set(resp.species);
    this.rolledShiny.set(resp.shinyVariant);
    this.rolledRarity.set(resp.rarity);
    this.rolledProbability.set(resp.rolledProbability);
    this.awakeningClass.set(normalizeAwakeningClass(resp.awakeningClass));
    this.awakenArtLoaded.set(false);
    this.awakenArtFailed.set(false);
  }

  onAwakenArtLoad(): void {
    this.awakenArtLoaded.set(true);
  }

  onAwakenArtError(): void {
    this.awakenArtFailed.set(true);
  }

  // ── Step 1: crack — the single reveal POST (the roll moment) ──────
  revealPod(): void {
    if (this.revealing()) return;
    this.revealing.set(true);
    this.revealError.set(null);
    this.growth.reveal(this.familiarId()).subscribe({
      next: (resp) => {
        this.revealing.set(false);
        this.applyRoll(resp);
        this.currentStep.set('reveal');
      },
      error: () => {
        // Fail loud: no silent species fallback. The pod is untouched
        // server-side (or already revealed — the retry replays it).
        this.revealing.set(false);
        this.revealError.set('aplus.familiar_hatching.reveal_error');
      },
    });
  }

  // ── Step navigation ───────────────────────────────────────────────
  next(): void {
    const idx = this.stepIndex();
    if (idx < 0 || idx >= STEP_ORDER.length - 1) return;
    if (this.currentStep() === 'crack') {
      // The reveal is entered ONLY by a successful revealPod() — there is
      // no rolled breed to show until the POST returns.
      return;
    }
    this.currentStep.set(STEP_ORDER[idx + 1]);
  }

  prev(): void {
    const step = this.currentStep();
    if (step === 'reveal' || step === 'crack') {
      // The reveal cannot be walked back: the roll is PERSISTED the moment
      // it is seen (it locks the account species), so the crack step has
      // nothing left to open.
      return;
    }
    if (this.committed()) {
      // Post-commit: the ceremony cannot be walked back.
      return;
    }
    const idx = this.stepIndex();
    if (idx <= 0) return;
    this.currentStep.set(STEP_ORDER[idx - 1]);
  }

  // ── Tone + persona setters ────────────────────────────────────────
  setTone(t: Tone): void {
    this.tone.set(t);
  }
  setPersona(p: string): void {
    this.learnerPersona.set(p);
  }
  onNameInput(value: string): void {
    this.displayName.set(value);
  }
  isTone(t: Tone): boolean {
    return this.tone() === t;
  }
  isPersona(p: string): boolean {
    return this.learnerPersona() === p;
  }

  // ── Step 4: commit — the single hatch POST (commit-only) ──────────
  commit(): void {
    if (this.committing()) return;
    this.committing.set(true);
    this.commitError.set(null);
    this.growth
      .hatch(this.familiarId(), {
        displayName: this.displayName().trim(),
        tone: this.tone(),
        learnerPersona: this.learnerPersona(),
        // resonantAtomId intentionally omitted — optional at hatch
        // (CHO-2028); it is bound later through real flows.
      })
      .subscribe({
        next: (resp) => {
          this.committing.set(false);
          this.committed.set(true);
          this.hatchedFamiliarId.set(resp.state.familiarId);
          // The roll signals stay as revealed — the BE commits the
          // PERSISTED roll, so the species the learner named against is
          // the species they meet.
          // F-I2 award moment: surface the first Skill auto-equipped at hatch.
          this.loadAward(resp.state.familiarId);
        },
        error: () => {
          // Fail loud: no silent species fallback. The pod is still
          // Stage-0 server-side (roll persisted), so the learner can retry.
          this.committing.set(false);
          this.commitError.set('aplus.familiar_hatching.commit_error');
        },
      });
  }

  /**
   * F-I2 award moment: read the post-hatch loadout and surface the first
   * auto-equipped active Skill (progress_mirror, st1 band). Best-effort — a
   * loadout-read failure omits the award panel but never blocks the welcome.
   */
  private loadAward(familiarId: string): void {
    this.growth.getLoadout(familiarId).subscribe({
      next: (loadout) => {
        const award = loadout.grants.find(
          (g) => g.equipped && g.skillKind === 'active',
        );
        this.awardedSkillKey.set(award?.skillKey ?? '');
      },
      error: () => {
        // Celebratory garnish only — the Skill is equipped server-side
        // regardless. Leave the award panel omitted on failure.
      },
    });
  }

  /** Welcome CTA: leave the ceremony for the new Familiar's profile. */
  meetFamiliar(): void {
    const id = this.hatchedFamiliarId() || this.familiarId();
    this.router.navigate(['/a/companion', id]);
  }

  // ── Step helpers ──────────────────────────────────────────────────
  isStep(step: StepId): boolean {
    return this.currentStep() === step;
  }

  stepLabel(step: StepId): string {
    return `aplus.familiar_hatching.step_${step}`;
  }
}
