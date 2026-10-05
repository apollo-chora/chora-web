/**
 * TriggerRuleManagerComponent — Data table of trigger rules with inline create form.
 *
 * Route: /admin/communication/trigger-rules
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
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { CommunicationService } from '../../services/communication.service';
import type {
  TriggerRule,
  TriggerRuleStatus,
  NotificationChannel,
  EmailTemplate,
} from '../../models/communication.model';
import { ALL_CHANNELS, CHANNEL_LABELS } from '../../models/communication.model';

@Component({
  selector: 'chora-trigger-rule-manager',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './trigger-rule-manager.component.html',
  styleUrl: './trigger-rule-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TriggerRuleManagerComponent implements OnInit, OnDestroy {
  private readonly communicationService = inject(CommunicationService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly rules = signal<TriggerRule[]>([]);
  readonly templates = signal<EmailTemplate[]>([]);
  readonly showCreateForm = signal(false);

  // --- Create form fields ---
  readonly newRuleName = signal('');
  readonly newRuleEventType = signal('');
  readonly newRuleChannel = signal<NotificationChannel>('in_app');
  readonly newRuleTemplateId = signal<string | null>(null);

  // --- Constants ---
  readonly allChannels = ALL_CHANNELS;
  readonly channelLabels = CHANNEL_LABELS;

  // --- Computed ---
  readonly isEmpty = computed(
    () => !this.loading() && this.rules().length === 0,
  );

  readonly canSubmitCreate = computed(
    () => this.newRuleName().trim() !== '' && this.newRuleEventType().trim() !== '',
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadRules();
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadRules(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.communicationService.loadTriggerRules().subscribe({
        next: (rules) => {
          if (rules) {
            this.rules.set(rules);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.communication.rules_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  private loadTemplates(): void {
    this.subscriptions.add(
      this.communicationService.loadEmailTemplates().subscribe({
        next: (templates) => {
          if (templates) {
            this.templates.set(templates);
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleRuleStatus(rule: TriggerRule): void {
    const newStatus: TriggerRuleStatus = rule.status === 'active' ? 'disabled' : 'active';

    this.subscriptions.add(
      this.communicationService.updateTriggerRule(rule.id, { status: newStatus }).subscribe({
        next: (updated) => {
          if (updated) {
            const updatedRules = this.rules().map((r) => (r.id === rule.id ? updated : r));
            this.rules.set(updatedRules);
          } else {
            this.toast.show('admin.communication.rule_update_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.communication.rule_update_error', 'error');
        },
      }),
    );
  }

  openCreateForm(): void {
    this.showCreateForm.set(true);
    this.newRuleName.set('');
    this.newRuleEventType.set('');
    this.newRuleChannel.set('in_app');
    this.newRuleTemplateId.set(null);
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
  }

  submitCreate(): void {
    if (!this.canSubmitCreate()) return;

    this.subscriptions.add(
      this.communicationService
        .createTriggerRule({
          name: this.newRuleName().trim(),
          event_type: this.newRuleEventType().trim(),
          channel: this.newRuleChannel(),
          template_id: this.newRuleTemplateId(),
          status: 'active',
        })
        .subscribe({
          next: (created) => {
            if (created) {
              this.rules.set([...this.rules(), created]);
              this.showCreateForm.set(false);
              this.toast.show('admin.communication.rule_created', 'success');
            } else {
              this.toast.show('admin.communication.rule_create_error', 'error');
            }
          },
          error: () => {
            this.toast.show('admin.communication.rule_create_error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  onNameChange(value: string): void {
    this.newRuleName.set(value);
  }

  onEventTypeChange(value: string): void {
    this.newRuleEventType.set(value);
  }

  onChannelChange(value: string): void {
    this.newRuleChannel.set(value as NotificationChannel);
  }

  onTemplateChange(value: string): void {
    this.newRuleTemplateId.set(value || null);
  }

  statusClass(status: TriggerRuleStatus): string {
    return `trigger-rule-manager__status--${status}`;
  }

  templateName(templateId: string | null): string {
    if (!templateId) return '–';
    const template = this.templates().find((t) => t.id === templateId);
    return template?.name ?? templateId;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
