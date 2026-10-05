/**
 * FamiliarAvatarComponent — Summoning ceremony + familiar display.
 *
 * If no Familiar exists, shows a full-screen archetype carousel with
 * 6 species (fox, owl, dragon, cat, robot, phoenix), personality preview,
 * and permanent selection flow. Once summoned, shows the avatar dashboard
 * with links to chat, persona, memory, evolution, and skins.
 *
 * @see docs/design/ux_familiar_companion.md (Summoning, StatAllocation)
 * @see CHO-1342
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FamiliarService } from '../../services/familiar.service';
import {
  FAMILIAR_ARCHETYPES,
  type ArchetypeDefinition,
  type PersonalityTraits,
} from '../../models/familiar.model';

/** Personality dimension keys for display */
const TRAIT_KEYS: (keyof PersonalityTraits)[] = [
  'curiosity',
  'encouragement',
  'humor',
  'detail',
  'formality',
];

const TRAIT_LABEL_KEYS: Record<keyof PersonalityTraits, string> = {
  curiosity: 'choraverse.summoning.trait_curiosity',
  encouragement: 'choraverse.summoning.trait_encouragement',
  humor: 'choraverse.summoning.trait_humor',
  detail: 'choraverse.summoning.trait_detail',
  formality: 'choraverse.summoning.trait_formality',
};

@Component({
  selector: 'chora-familiar-avatar',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-avatar.component.html',
  styleUrl: './familiar-avatar.component.scss',
})
export class FamiliarAvatarComponent implements OnInit, OnDestroy {
  protected readonly familiarService = inject(FamiliarService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** All available archetypes */
  readonly archetypes = FAMILIAR_ARCHETYPES;
  readonly traitKeys = TRAIT_KEYS;
  readonly traitLabelKeys = TRAIT_LABEL_KEYS;

  /** Currently selected archetype index */
  readonly selectedIndex = signal(0);

  /** Confirmation dialog open */
  readonly showConfirmDialog = signal(false);

  /** Currently selected archetype (derived) */
  readonly selectedArchetype = computed<ArchetypeDefinition>(
    () => this.archetypes[this.selectedIndex()],
  );

  /** Is the service submitting? */
  readonly isSubmitting = computed(
    () => this.familiarService.summoningState().status === 'submitting',
  );

  /** Is the familiar already summoned? */
  readonly isSummoned = this.familiarService.isSummoned;

  /** Familiar profile (when summoned) */
  readonly profile = computed(() => {
    const s = this.familiarService.state();
    return s.status === 'success' ? s.profile : null;
  });

  /** Is the familiar state loading? */
  readonly isLoading = computed(
    () => this.familiarService.state().status === 'loading',
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.familiarService.loadProfile().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Carousel navigation
  // -------------------------------------------------------------------------

  selectArchetype(index: number): void {
    this.selectedIndex.set(index);
  }

  previousArchetype(): void {
    const current = this.selectedIndex();
    this.selectedIndex.set(
      current === 0 ? this.archetypes.length - 1 : current - 1,
    );
  }

  nextArchetype(): void {
    const current = this.selectedIndex();
    this.selectedIndex.set(
      current === this.archetypes.length - 1 ? 0 : current + 1,
    );
  }

  // -------------------------------------------------------------------------
  // Summoning flow
  // -------------------------------------------------------------------------

  openConfirmDialog(): void {
    this.showConfirmDialog.set(true);
  }

  cancelConfirm(): void {
    this.showConfirmDialog.set(false);
  }

  confirmSummon(): void {
    const archetype = this.selectedArchetype();
    this.subscriptions.add(
      this.familiarService
        .summonFamiliar(
          archetype.species,
          archetype.species.charAt(0).toUpperCase() + archetype.species.slice(1),
          archetype.defaultTraits,
        )
        .subscribe({
          next: (profile) => {
            if (profile) {
              this.showConfirmDialog.set(false);
              this.toast.show('choraverse.summoning.success', 'success');
              this.router.navigate(['/choraverse', 'stats']);
            }
          },
          error: () => {
            this.toast.show('choraverse.summoning.error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Dashboard navigation
  // -------------------------------------------------------------------------

  navigateTo(path: string): void {
    this.router.navigate(['/choraverse', path]);
  }

  /** Trait percentage for preview bar (each point = 5% of 100) */
  traitPercent(value: number): number {
    return (value / 20) * 100;
  }
}
