/**
 * EvolutionTimelineComponent — displays Familiar evolution milestones
 * as a vertical timeline with current/future progress indicators.
 *
 * Route: /choraverse/evolution
 *
 * @see docs/design/ux_familiar_companion.md (EvolutionLoop)
 * @see PLAN.md §3.43 (Familiar & Choraverse)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarService } from '../../services/familiar.service';
import type { EvolutionMilestone } from '../../models/familiar.model';

@Component({
  selector: 'chora-evolution-timeline',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './evolution-timeline.component.html',
  styleUrl: './evolution-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvolutionTimelineComponent implements OnInit, OnDestroy {
  protected readonly familiarService = inject(FamiliarService);

  readonly state = this.familiarService.state;
  readonly milestones = this.familiarService.milestones;
  readonly currentLevel = this.familiarService.evolutionLevel;

  /** Next upcoming milestone (first unlocked === null entry) */
  readonly nextMilestone = computed<EvolutionMilestone | null>(() => {
    const list = this.milestones();
    return list.find((m) => m.unlockedAt === null) ?? null;
  });

  /** Progress percentage toward the next milestone (0-100) */
  readonly progressPercent = computed(() => {
    const level = this.currentLevel();
    const next = this.nextMilestone();
    if (!next) return 100;
    const prevLevel = next.level > 1 ? next.level - 1 : 0;
    const range = next.level - prevLevel;
    if (range <= 0) return 0;
    const progress = ((level - prevLevel) / range) * 100;
    return Math.min(Math.max(Math.round(progress), 0), 99);
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.familiarService.loadProfile().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  isAchieved(milestone: EvolutionMilestone): boolean {
    return milestone.unlockedAt !== null;
  }

  isCurrent(milestone: EvolutionMilestone): boolean {
    const level = this.currentLevel();
    return milestone.level === level;
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
