import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import {
  LearningAtom,
  ATOM_TYPE_LABELS,
  ATOM_TYPE_ICONS,
} from '../../../features/atomic/models/atom.models';
import { QualityBadgeComponent } from '../../../features/atomic/components/quality-badge/quality-badge.component';
import { BloomsLevel } from '../../../features/atomic/services/content-quality.service';

@Component({
  selector: 'chora-atom-card',
  imports: [QualityBadgeComponent],
  templateUrl: './atom-card.component.html',
  styleUrl: './atom-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomCardComponent {
  atom = input.required<LearningAtom>();
  compact = input(false);

  /** AI-derived quality indicators (optional, shown when available) */
  difficultyScore = input<number | null>(null);
  qualityScore = input<number | null>(null);
  bloomsLevel = input<BloomsLevel | null>(null);

  selected = output<LearningAtom>();

  readonly typeLabel = computed(() => ATOM_TYPE_LABELS[this.atom().atom_type]);
  readonly typeIcon = computed(() => ATOM_TYPE_ICONS[this.atom().atom_type]);
  readonly difficultyStars = computed(() => Array.from({ length: 5 }, (_, i) => i < this.atom().difficulty));
  readonly title = computed(() => {
    const rev = this.atom().latest_revision;
    if (rev) {
      const content = rev.content as Record<string, unknown>;
      const stem = (content['stem'] as string) ?? (content['question'] as string) ?? (content['front'] as string);
      if (stem) return stem;
    }
    // Fallback: capitalize and join tags (always available from list API)
    const tags = this.atom().tags;
    if (tags.length > 0) {
      return tags.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' · ');
    }
    return ATOM_TYPE_LABELS[this.atom().atom_type];
  });
  readonly statusBadge = computed(() => this.atom().status);

  onSelect(): void {
    this.selected.emit(this.atom());
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onSelect();
    }
  }
}
