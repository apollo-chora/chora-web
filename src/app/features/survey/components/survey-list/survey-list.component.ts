/**
 * SurveyListComponent — Lists available and completed surveys with status badges.
 *
 * Route: /survey/list
 *
 * Features:
 *   - Display survey templates with status (draft, published, archived)
 *   - Filter by status
 *   - Navigate to respond (learner). Results are an R+ admin concern.
 *   - Empty state when no surveys available
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
import { SurveyService } from '../../services/survey.service';
import {
  SURVEY_STATUS_LABELS,
  type SurveyStatus,
  type SurveyTemplate,
} from '../../models/survey.model';

@Component({
  selector: 'chora-survey-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './survey-list.component.html',
  styleUrl: './survey-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyListComponent implements OnInit, OnDestroy {
  private readonly surveyService = inject(SurveyService);
  private readonly router = inject(Router);

  // --- State ---
  readonly surveyListState = this.surveyService.surveyListState;
  readonly surveys = this.surveyService.surveys;

  // --- Filter ---
  readonly activeFilter = signal<SurveyStatus | 'all'>('all');

  // --- Constants ---
  readonly statusLabels = SURVEY_STATUS_LABELS;

  // --- Computed ---
  readonly filteredSurveys = computed(() => {
    const filter = this.activeFilter();
    const all = this.surveys();
    if (filter === 'all') return all;
    return all.filter((s) => s.status === filter);
  });

  readonly surveyCount = computed(() => this.filteredSurveys().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.surveyService.loadSurveys().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  setFilter(filter: SurveyStatus | 'all'): void {
    this.activeFilter.set(filter);
  }

  navigateToRespond(survey: SurveyTemplate): void {
    this.router.navigate(['/survey', survey.id, 'respond']);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `survey-list__status--${status}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  trackBySurveyId(_index: number, survey: SurveyTemplate): string {
    return survey.id;
  }
}
