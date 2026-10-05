import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AtomCardComponent } from '../../../../shared/components/atom-card/atom-card.component';
import { TopicExplorerComponent } from '../topic-explorer/topic-explorer.component';
import { AtomService, AtomFilterParams } from '../../services/atom.service';
import { TopicService } from '../../services/topic.service';
import { LearningAtom, TopicNode, AtomType } from '../../models/atom.models';

@Component({
  selector: 'chora-atom-list',
  imports: [TranslatePipe, AtomCardComponent, TopicExplorerComponent],
  templateUrl: './atom-list.component.html',
  styleUrl: './atom-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomListComponent implements OnInit {
  private readonly atomService = inject(AtomService);
  private readonly topicService = inject(TopicService);
  private readonly router = inject(Router);

  readonly atomListState = this.atomService.listState;
  readonly atoms = this.atomService.atoms;
  readonly topicTreeState = this.topicService.treeState;
  readonly topics = this.topicService.topics;
  readonly selectedTopic = this.topicService.selectedTopic;

  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly typeFilter = signal<AtomType | null>(null);
  readonly difficultyFilter = signal<number | null>(null);

  readonly atomTypes: AtomType[] = [
    'multiple_choice', 'fill_blank', 'true_false', 'short_answer',
    'matching', 'ordering', 'code', 'essay', 'multimedia', 'simulation',
  ];

  readonly isLoading = computed(() =>
    this.atomListState().status === 'loading' || this.topicTreeState().status === 'loading'
  );

  readonly hasNextPage = computed(() => {
    const state = this.atomListState();
    return state.status === 'success' && state.pageInfo.has_next_page;
  });

  ngOnInit(): void {
    this.topicService.loadTopicTree().subscribe();
    this.loadAtoms();
  }

  onTopicSelected(topic: TopicNode): void {
    this.topicService.selectTopic(topic);
    this.loadAtoms();
  }

  onAtomSelected(atom: LearningAtom): void {
    this.router.navigate(['/learning', 'player', atom.id]);
  }

  onTypeFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.typeFilter.set(value ? value as AtomType : null);
    this.loadAtoms();
  }

  onDifficultyFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.difficultyFilter.set(value ? Number(value) : null);
    this.loadAtoms();
  }

  toggleViewMode(): void {
    this.viewMode.update((m) => m === 'grid' ? 'list' : 'grid');
  }

  loadMore(): void {
    const state = this.atomListState();
    if (state.status === 'success' && state.pageInfo.end_cursor) {
      this.loadAtoms(state.pageInfo.end_cursor);
    }
  }

  clearTopicFilter(): void {
    this.topicService.selectTopic(null);
    this.loadAtoms();
  }

  private loadAtoms(cursor?: string): void {
    const params: AtomFilterParams = { limit: 20 };
    const topic = this.selectedTopic();
    if (topic) params.topicId = topic.id;
    if (this.typeFilter()) params.atomType = this.typeFilter()!;
    if (this.difficultyFilter()) params.difficulty = this.difficultyFilter()!;
    if (cursor) params.cursor = cursor;

    this.atomService.loadAtoms(params).subscribe();
  }
}
