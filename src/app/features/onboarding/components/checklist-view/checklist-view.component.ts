/**
 * ChecklistViewComponent — Learner-facing onboarding checklist with progress
 * tracking, expandable items, and status icons.
 *
 * Route: /onboarding/checklist
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
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChecklistService } from '../../services/checklist.service';
import type {
  ChecklistItemProgress,
  ChecklistItemStatus,
} from '../../models/checklist.model';

@Component({
  selector: 'chora-checklist-view',
  standalone: true,
  imports: [TranslatePipe, DatePipe],
  templateUrl: './checklist-view.component.html',
  styleUrl: './checklist-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChecklistViewComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly checklistService = inject(ChecklistService);

  // --- State ---
  readonly checklistState = this.checklistService.checklistState;
  readonly expandedItemId = signal<string | null>(null);

  // --- Computed ---
  readonly checklist = computed(() => {
    const state = this.checklistState();
    return state.status === 'success' ? state.data : null;
  });

  readonly completedCount = computed(() => this.checklist()?.completed_count ?? 0);
  readonly totalCount = computed(() => this.checklist()?.total_count ?? 0);
  readonly progressPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.completedCount() / total) * 100);
  });

  readonly items = computed(() => this.checklist()?.items ?? []);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(this.checklistService.getChecklist().subscribe());
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  toggleItem(itemId: string): void {
    if (this.expandedItemId() === itemId) {
      this.expandedItemId.set(null);
    } else {
      this.expandedItemId.set(itemId);
    }
  }

  isExpanded(itemId: string): boolean {
    return this.expandedItemId() === itemId;
  }

  navigateToResource(url: string | null): void {
    if (url) {
      if (url.startsWith('http')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        this.router.navigateByUrl(url);
      }
    }
  }

  markComplete(item: ChecklistItemProgress): void {
    this.subscriptions.add(
      this.checklistService.markItemComplete(item.id).subscribe(),
    );
  }

  getStatusIcon(status: ChecklistItemStatus): string {
    switch (status) {
      case 'pending':
        return 'radio_button_unchecked';
      case 'in_progress':
        return 'pending';
      case 'completed':
        return 'check_circle';
      case 'overdue':
        return 'warning';
    }
  }

  getStatusAriaLabel(status: ChecklistItemStatus): string {
    switch (status) {
      case 'pending':
        return 'onboarding.checklist.status_pending';
      case 'in_progress':
        return 'onboarding.checklist.status_in_progress';
      case 'completed':
        return 'onboarding.checklist.status_completed';
      case 'overdue':
        return 'onboarding.checklist.status_overdue';
    }
  }

  trackByItemId(_index: number, item: ChecklistItemProgress): string {
    return item.id;
  }
}
