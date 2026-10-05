/**
 * SurveyCompletionComponent — Thank-you page shown after survey submission.
 *
 * Route: /survey/:surveyId/complete
 *
 * Features:
 *   - Thank-you message after survey submission
 *   - Optional summary of completed survey title
 *   - Link to return to dashboard or browse more surveys
 *   - Accessible completion confirmation
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SurveyService } from '../../services/survey.service';

@Component({
  selector: 'chora-survey-completion',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './survey-completion.component.html',
  styleUrl: './survey-completion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyCompletionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly surveyService = inject(SurveyService);

  // --- State ---
  readonly surveyDetail = this.surveyService.surveyDetail;
  readonly responseState = this.surveyService.responseState;

  // --- Computed ---
  readonly surveyId = computed(() =>
    this.route.snapshot.paramMap.get('surveyId') ?? '',
  );

  readonly surveyTitle = computed(() => {
    const detail = this.surveyDetail();
    return detail?.title ?? '';
  });

  readonly hasResponse = computed(() =>
    this.responseState().status === 'success',
  );

  readonly completedAt = computed(() => {
    const state = this.responseState();
    if (state.status === 'success' && state.response.completed_at) {
      return this.formatDate(state.response.completed_at);
    }
    return '';
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
