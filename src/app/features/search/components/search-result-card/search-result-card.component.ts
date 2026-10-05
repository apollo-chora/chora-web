/**
 * SearchResultCardComponent — Displays a single atom search result.
 *
 * Shows atom title, content excerpt with highlighted matches, difficulty badge,
 * atom type label, and topic tags.
 *
 * The content_excerpt from Meilisearch contains `<em>` tags around matched
 * terms. This component renders them via innerHTML with sanitization.
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { AtomSearchHit } from '../../models/search.model';
import { ATOM_TYPE_LABELS, DIFFICULTY_LABELS } from '../../models/search.model';

@Component({
  selector: 'chora-search-result-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './search-result-card.component.html',
  styleUrl: './search-result-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultCardComponent {
  // --- Inputs ---
  readonly hit = input.required<AtomSearchHit>();

  // --- Constants ---
  readonly atomTypeLabels = ATOM_TYPE_LABELS;
  readonly difficultyLabels = DIFFICULTY_LABELS;

  // --- Computed ---
  readonly difficultyClass = computed(() => {
    const level = this.hit().difficulty;
    return `search-result-card__difficulty--level-${level}`;
  });

  readonly typeLabel = computed(() => {
    return this.atomTypeLabels[this.hit().atom_type];
  });

  readonly difficultyLabel = computed(() => {
    return this.difficultyLabels[this.hit().difficulty];
  });

  readonly hasTopics = computed(() => {
    return (this.hit().topic_names?.length ?? 0) > 0;
  });

  readonly hasLabels = computed(() => {
    return (this.hit().labels?.length ?? 0) > 0;
  });

  readonly hasExcerpt = computed(() => {
    return !!this.hit().content_excerpt;
  });
}
