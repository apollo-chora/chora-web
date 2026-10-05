/**
 * SearchFiltersComponent — Faceted filter panel for atom search.
 *
 * Displays atom type and difficulty facets with counts. Emits filter changes
 * to the parent search page for URL sync and re-querying.
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type {
  AtomSearchFacets,
  ActiveFilters,
  AtomType,
  DifficultyLevel,
} from '../../models/search.model';
import {
  ALL_ATOM_TYPES,
  ALL_DIFFICULTY_LEVELS,
  ATOM_TYPE_LABELS,
  DIFFICULTY_LABELS,
} from '../../models/search.model';

@Component({
  selector: 'chora-search-filters',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './search-filters.component.html',
  styleUrl: './search-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFiltersComponent {
  // --- Inputs ---
  readonly facets = input<AtomSearchFacets | null>(null);
  readonly activeFilters = input.required<ActiveFilters>();

  // --- Outputs ---
  readonly filtersChanged = output<ActiveFilters>();
  readonly filtersCleared = output<void>();

  // --- Constants ---
  readonly allAtomTypes = ALL_ATOM_TYPES;
  readonly allDifficultyLevels = ALL_DIFFICULTY_LEVELS;
  readonly atomTypeLabels = ATOM_TYPE_LABELS;
  readonly difficultyLabels = DIFFICULTY_LABELS;

  // --- Computed ---
  readonly hasActiveFilters = computed(() => {
    const f = this.activeFilters();
    return f.types.length > 0 || f.difficulties.length > 0 || f.topic !== null;
  });

  readonly activeFilterCount = computed(() => {
    const f = this.activeFilters();
    return f.types.length + f.difficulties.length + (f.topic ? 1 : 0);
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleType(type: AtomType): void {
    const current = this.activeFilters();
    const types = current.types.includes(type)
      ? current.types.filter((t) => t !== type)
      : [...current.types, type];
    this.filtersChanged.emit({ ...current, types });
  }

  toggleDifficulty(level: DifficultyLevel): void {
    const current = this.activeFilters();
    const difficulties = current.difficulties.includes(level)
      ? current.difficulties.filter((d) => d !== level)
      : [...current.difficulties, level];
    this.filtersChanged.emit({ ...current, difficulties });
  }

  setTopic(topic: string | null): void {
    const current = this.activeFilters();
    this.filtersChanged.emit({ ...current, topic });
  }

  clearAll(): void {
    this.filtersCleared.emit();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isTypeActive(type: string): boolean {
    return this.activeFilters().types.includes(type);
  }

  isDifficultyActive(level: DifficultyLevel): boolean {
    return this.activeFilters().difficulties.includes(level);
  }

  getTypeCount(type: string): number {
    const f = this.facets();
    return f?.atom_type[type] ?? 0;
  }

  getDifficultyCount(level: DifficultyLevel): number {
    const f = this.facets();
    return f?.difficulty[level.toString()] ?? 0;
  }
}
