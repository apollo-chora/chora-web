/**
 * ChecklistWidgetComponent — Compact dashboard widget showing onboarding
 * checklist progress summary with a "View All" link.
 *
 * Usage: embed in learner dashboard via <chora-checklist-widget />
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChecklistService } from '../../services/checklist.service';

@Component({
  selector: 'chora-checklist-widget',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  template: `
    <div class="checklist-widget" data-testid="checklist-widget">
      @if (summaryState().status === 'loading') {
        <div class="checklist-widget__loading" aria-live="polite">
          <div class="checklist-widget__skeleton"></div>
        </div>
      }

      @if (summary(); as s) {
        <div class="checklist-widget__header">
          <h3 class="checklist-widget__title">
            {{ 'onboarding.widget.title' | translate }}
          </h3>
          @if (s.has_overdue) {
            <span class="checklist-widget__overdue-badge"
                  [attr.aria-label]="'onboarding.widget.has_overdue' | translate">
              {{ 'onboarding.widget.overdue' | translate }}
            </span>
          }
        </div>

        <div class="checklist-widget__progress">
          <div
            class="checklist-widget__progress-bar"
            role="progressbar"
            [attr.aria-valuenow]="s.percentage"
            [attr.aria-valuemin]="0"
            [attr.aria-valuemax]="100"
            [attr.aria-label]="'onboarding.widget.progress' | translate">
            <div
              class="checklist-widget__progress-fill"
              [style.width.%]="s.percentage">
            </div>
          </div>
          <span class="checklist-widget__progress-text" data-testid="widget-progress">
            {{ s.completed_count }} / {{ s.total_count }}
          </span>
        </div>

        <a
          routerLink="/onboarding/checklist"
          class="checklist-widget__link"
          [attr.aria-label]="'onboarding.widget.view_all' | translate"
          data-testid="widget-view-all">
          {{ 'onboarding.widget.view_all' | translate }}
        </a>
      }

      @if (summaryState().status === 'error') {
        <p class="checklist-widget__error" role="alert">
          {{ 'onboarding.widget.load_error' | translate }}
        </p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .checklist-widget {
      padding: var(--chora-space-md, 16px);
      border: 1px solid var(--chora-color-border, #e5e5e5);
      border-radius: var(--chora-radius-md, 8px);
      background: var(--chora-color-surface-0, #fff);

      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-block-end: var(--chora-space-sm, 8px);
      }

      &__title {
        font-size: 0.9375rem;
        font-weight: 600;
        margin: 0;
      }

      &__overdue-badge {
        font-size: 0.6875rem;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--chora-color-warning-surface, #fffbeb);
        color: var(--chora-color-warning, #d97706);
      }

      &__progress {
        display: flex;
        align-items: center;
        gap: var(--chora-space-sm, 8px);
        margin-block-end: var(--chora-space-sm, 8px);
      }

      &__progress-bar {
        flex: 1;
        height: 8px;
        background: var(--chora-color-surface-1, #e5e7eb);
        border-radius: 4px;
        overflow: hidden;
      }

      &__progress-fill {
        height: 100%;
        background: var(--chora-color-primary, #2563eb);
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      &__progress-text {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--chora-color-text-secondary, #475569);
        white-space: nowrap;
      }

      &__link {
        display: inline-block;
        font-size: 0.8125rem;
        color: var(--chora-color-primary, #2563eb);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }

        &:focus-visible {
          outline: 2px solid var(--chora-color-primary, #2563eb);
          outline-offset: 2px;
        }
      }

      &__loading {
        padding: var(--chora-space-sm, 8px) 0;
      }

      &__skeleton {
        height: 60px;
        background: var(--chora-color-surface-1, #f0f0f0);
        border-radius: var(--chora-radius-sm, 4px);
        animation: widget-pulse 1.5s ease-in-out infinite;
      }

      &__error {
        font-size: 0.8125rem;
        color: var(--chora-color-error, #dc2626);
        margin: 0;
      }
    }

    @keyframes widget-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChecklistWidgetComponent implements OnInit, OnDestroy {
  private readonly checklistService = inject(ChecklistService);

  readonly summaryState = this.checklistService.summaryState;

  readonly summary = computed(() => {
    const state = this.summaryState();
    return state.status === 'success' ? state.data : null;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(this.checklistService.getChecklistSummary().subscribe());
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
