/**
 * H+ Familiar Egg SKU editor: `/h/marketplace/companion-eggs/:sku`.
 *
 * Tenant admin form for editing a single egg SKU's `breed_distribution`
 * JSONB. One slider per CANONICAL hero species (range 0-100); a live total
 * widget shows the sum and flags non-100 totals.
 *
 * D6. The slider list used to be the pre-CHO-2032 gacha roster of eight, four
 * of which were retired from the roll authority, and it had no penguin slider
 * at all although penguin is one of the five live hero species. A distribution
 * saved through it either failed ValidateBreedDistribution on an unknown
 * species or silently dropped penguin from the SKU. The list is now DERIVED
 * from CANON_BREEDS, which the CHO-2037 drift guard pins to
 * chora-contracts/companion/species_registry.json, so onboarding species N+1
 * cannot leave this screen behind.
 *
 * D6. `save()` used to be a setTimeout that flipped the "saved" pill and called
 * no backend at all, so every edit was discarded while the screen reported
 * success. It now reads the FULL entry and posts the whole thing back through
 * chora-tenancy's admin upsert. The upsert REPLACES the row, so the entry is
 * round-tripped intact: sending only the distribution would wipe the price, the
 * expiry windows and the purchasable flag off a live SKU.
 *
 * Per ADR-149 §"Breed lootbox + transparency" — every distribution
 * edit must be auditable. The component emits an audit-pending pill
 * on save until the BE responds; an audit-log preview surfaces past
 * edits.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import type { AdminEggCatalogEntry } from '../../../../core/familiar/familiar-growth.model';
import { CANON_BREEDS } from '../../../../shared/components/breed-art/breed-art.component';
import type { BreedSpecies } from '../../../../shared/components/breed-art/breed-art.component';

/**
 * The rollable species, derived rather than restated. CANON_BREEDS is the
 * frontend's copy of the hero roster and is drift-tested against the canonical
 * registry (CHO-2037), so a hand-written list here would be a second source
 * that could silently fall behind it. Sorted for a stable slider order.
 */
const ALL_BREEDS: readonly Exclude<BreedSpecies, ''>[] = [...CANON_BREEDS]
  .filter((b): b is Exclude<BreedSpecies, ''> => b !== '')
  .sort();

/**
 * Pull chora-tenancy's own refusal text out of the error envelope, so the admin
 * is told WHY the distribution was rejected (an unknown species, a total that
 * is not 100) rather than just that it failed. Falls back to a translated
 * generic line when the body carries nothing usable, which keeps the honest
 * "it did not save" claim without inventing a reason for it.
 */
function refusalMessage(err: unknown): string {
  const body = httpErrorView(err)?.body;
  if (body !== null && typeof body === 'object') {
    const inner = (body as { error?: unknown }).error;
    if (inner !== null && typeof inner === 'object') {
      const msg = (inner as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim() !== '') return msg;
    }
  }
  return 'hplus.familiar_eggs_edit.save_error';
}

/** A zeroed draft map over exactly the canonical species. */
function emptyDrafts(): Record<string, number> {
  return Object.fromEntries(ALL_BREEDS.map((b) => [b, 0]));
}

@Component({
  selector: 'chora-hplus-familiar-eggs-edit',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-eggs-edit.component.html',
  styleUrl: './familiar-eggs-edit.component.scss',
})
export class FamiliarEggsEditComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly growth = inject(FamiliarGrowthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sku = signal<string>(this.route.snapshot.paramMap.get('sku') ?? '');

  /**
   * The FULL source-of-truth entry (loaded from the BFF). Held whole because
   * the save posts it back whole.
   */
  private readonly initial = toSignal<AdminEggCatalogEntry | null>(
    this.route.paramMap.pipe(
      switchMap((p) => this.growth.getAdminEggEntry(p.get('sku') ?? '')),
    ),
    { initialValue: null },
  );

  /** Editable per-breed % map, over the canonical species only. */
  private readonly drafts = signal<Record<string, number>>(emptyDrafts());

  constructor() {
    // Seed drafts from the entry when it lands. Keys outside the canonical set
    // are dropped on purpose: a legacy row still carrying a retired breed must
    // not be handed back to a validator that no longer accepts it.
    effect(() => {
      const entry = this.initial();
      if (!entry) return;
      const next = emptyDrafts();
      for (const [species, weight] of Object.entries(entry.breedDistribution)) {
        if (species in next) next[species] = weight;
      }
      this.drafts.set(next);
    });
  }

  readonly breeds = ALL_BREEDS;

  readonly totalWeight = computed<number>(() => {
    const d = this.drafts();
    return ALL_BREEDS.reduce((sum, b) => sum + (d[b] ?? 0), 0);
  });

  readonly isBalanced = computed<boolean>(() => this.totalWeight() === 100);

  readonly distributionUpdatedAt = computed<string>(
    () => this.initial()?.distributionUpdatedAt ?? '',
  );

  readonly saving = signal<boolean>(false);
  readonly savedAt = signal<string | null>(null);
  /** Non-empty ⇒ the last save was REFUSED. Never set alongside savedAt. */
  readonly saveError = signal<string>('');

  weight(breed: string): number {
    return this.drafts()[breed] ?? 0;
  }

  onWeightInput(breed: string, value: string | number): void {
    const n = Math.max(0, Math.min(100, Math.round(Number(value))));
    if (!Number.isFinite(n)) return;
    this.drafts.update((cur) => ({ ...cur, [breed]: n }));
    this.savedAt.set(null);
  }

  /** Distribute a percentage point delta across other breeds to keep
   *  the total close to 100. Helper for the "balance" button. */
  rebalanceToHundred(): void {
    const cur = this.drafts();
    const total = this.totalWeight();
    if (total === 0) return;
    const scale = 100 / total;
    const scaled: Record<string, number> = {};
    let running = 0;
    for (let i = 0; i < ALL_BREEDS.length - 1; i++) {
      const b = ALL_BREEDS[i];
      const v = Math.round((cur[b] ?? 0) * scale);
      scaled[b] = v;
      running += v;
    }
    // Last breed absorbs the rounding remainder.
    scaled[ALL_BREEDS[ALL_BREEDS.length - 1]] = Math.max(0, 100 - running);
    this.drafts.set(scaled);
    this.savedAt.set(null);
  }

  /**
   * Post the whole entry back with the edited distribution.
   *
   * Fail-loud: `savedAt` is set ONLY once chora-tenancy has confirmed, and a
   * refusal renders its own message rather than a success pill. The entry is
   * spread first so every field the upsert consumes survives the round trip;
   * the read-only projections tenancy recomputes are dropped.
   */
  save(): void {
    const entry = this.initial();
    if (this.saving() || !this.isBalanced() || !entry) return;
    this.saving.set(true);
    this.saveError.set('');
    this.savedAt.set(null);

    const { odds: _odds, distributionTotalWeight: _total, distributionUpdatedAt: _stamp, ...writable } =
      entry;
    this.growth
      .saveAdminEggEntry({ ...writable, breedDistribution: { ...this.drafts() } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.savedAt.set(new Date().toISOString());
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.saveError.set(refusalMessage(err));
        },
      });
  }

  rarityFor(breed: string): string {
    const odds = this.initial()?.odds?.find((o) => o.species === breed);
    return odds?.rarity ?? 'common';
  }
}
