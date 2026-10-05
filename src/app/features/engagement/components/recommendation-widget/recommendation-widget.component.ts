import {
  Component, ChangeDetectionStrategy, inject, OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RecommendationService } from '../../services/recommendation.service';
import type { RecommendedAtom } from '../../services/recommendation.service';

@Component({
  selector: 'chora-recommendation-widget',
  imports: [TranslatePipe],
  templateUrl: './recommendation-widget.component.html',
  styleUrl: './recommendation-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecommendationWidgetComponent implements OnInit {
  private readonly recommendationService = inject(RecommendationService);
  private readonly router = inject(Router);

  readonly state = this.recommendationService.recommendationState;
  readonly recommendations = this.recommendationService.recommendations;

  ngOnInit(): void {
    if (this.state().status === 'idle') {
      this.recommendationService.loadRecommendations('me', undefined, 10).subscribe();
    }
  }

  openAtom(atomId: string): void {
    this.router.navigate(['/atoms', atomId]);
  }

  difficultyClass(difficulty: RecommendedAtom['difficulty']): string {
    return `recommendation-widget__badge--${difficulty}`;
  }

  trackByAtomId(_index: number, atom: RecommendedAtom): string {
    return atom.atom_id;
  }
}
