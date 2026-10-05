import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  input,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SupportService } from '../../services/support.service';

@Component({
  selector: 'chora-satisfaction-survey',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './satisfaction-survey.component.html',
  styleUrl: './satisfaction-survey.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SatisfactionSurveyComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);
  private readonly toast = inject(ToastService);

  readonly ticketId = input.required<string>();

  readonly ticketState = this.supportService.ticketDetailState;

  readonly selectedRating = signal<number>(0);
  readonly comment = signal('');
  readonly submitted = signal(false);

  readonly ratingOptions = [1, 2, 3, 4, 5] as const;

  readonly isValid = computed(() => this.selectedRating() > 0);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.supportService.loadTicketDetail(this.ticketId()).subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  setRating(rating: number): void {
    this.selectedRating.set(rating);
  }

  updateComment(value: string): void {
    this.comment.set(value);
  }

  submitSurvey(): void {
    if (!this.isValid()) return;

    this.subscriptions.add(
      this.supportService.submitSatisfaction(this.ticketId(), {
        rating: this.selectedRating(),
        comment: this.comment() || undefined,
      }).subscribe({
        next: (result) => {
          if (result) {
            this.submitted.set(true);
            this.toast.show('support.satisfaction_submitted', 'success');
          }
        },
      }),
    );
  }

  ratingLabel(rating: number): string {
    const labels: Record<number, string> = {
      1: 'support.rating_very_dissatisfied',
      2: 'support.rating_dissatisfied',
      3: 'support.rating_neutral',
      4: 'support.rating_satisfied',
      5: 'support.rating_very_satisfied',
    };
    return labels[rating] ?? '';
  }
}
