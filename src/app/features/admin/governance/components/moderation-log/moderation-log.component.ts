/**
 * ModerationLogComponent — Read-only chronological moderation action log.
 *
 * Route: /admin/governance/moderation
 *
 * Features:
 *   - Chronological list of moderation actions
 *   - Filter by action type
 *   - Action badge coloring
 *   - No action buttons (read-only)
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
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { GovernanceService } from '../../services/governance.service';
import type {
  ModerationActionType,
} from '../../models/governance.model';
import {
  ALL_MODERATION_ACTIONS,
  MODERATION_ACTION_LABELS,
} from '../../models/governance.model';

@Component({
  selector: 'chora-moderation-log',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './moderation-log.component.html',
  styleUrl: './moderation-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationLogComponent implements OnInit, OnDestroy {
  private readonly governanceService = inject(GovernanceService);

  // --- State ---
  readonly loading = computed(() => this.governanceService.moderationState().status === 'loading');
  readonly filterAction = signal<ModerationActionType | null>(null);

  // --- Constants ---
  readonly allActions = ALL_MODERATION_ACTIONS;
  readonly actionLabels = MODERATION_ACTION_LABELS;

  // --- Computed ---
  readonly filteredActions = computed(() => {
    let result = this.governanceService.moderationActions();
    const action = this.filterAction();

    if (action) {
      result = result.filter((a) => a.action === action);
    }

    return result;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.filteredActions().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadModerationLog();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadModerationLog(): void {
    this.subscriptions.add(
      this.governanceService.loadModerationLog().subscribe(),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onActionFilter(value: string): void {
    this.filterAction.set(value === '' ? null : value as ModerationActionType);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  actionClass(action: string): string {
    return `moderation-log__action--${action}`;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  formatTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  }
}
