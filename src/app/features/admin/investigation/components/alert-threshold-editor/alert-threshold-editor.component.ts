/**
 * AlertThresholdEditorComponent — Configure metric alert thresholds and notification channels.
 *
 * Route: /admin/investigation/alerts
 *
 * Features:
 *   - Metric threshold sliders (latency_p99, error_rate, token_usage)
 *   - Min/max/current display per metric
 *   - Notification channel selectors (email, Slack, PagerDuty)
 *   - SLA breach rules (severity + threshold + action)
 *   - Reactive forms for configuration
 *   - Role-gated: super_admin only
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
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface MetricThreshold {
  metric_key: string;
  label: string;
  min: number;
  max: number;
  current: number;
  unit: string;
}

type NotificationChannel = 'email' | 'slack' | 'pagerduty';

type BreachSeverity = 'critical' | 'high' | 'medium' | 'low';

interface SlaBreachRule {
  severity: BreachSeverity;
  metric_key: string;
  threshold: number;
  action: string;
}

interface AlertConfig {
  thresholds: MetricThreshold[];
  channels: NotificationChannel[];
  breach_rules: SlaBreachRule[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'email', label: 'admin.investigation.channel_email' },
  { value: 'slack', label: 'admin.investigation.channel_slack' },
  { value: 'pagerduty', label: 'admin.investigation.channel_pagerduty' },
];

const ALL_SEVERITIES: { value: BreachSeverity; label: string }[] = [
  { value: 'critical', label: 'admin.investigation.severity_critical' },
  { value: 'high', label: 'admin.investigation.severity_high' },
  { value: 'medium', label: 'admin.investigation.severity_medium' },
  { value: 'low', label: 'admin.investigation.severity_low' },
];

const ALL_ACTIONS: { value: string; label: string }[] = [
  { value: 'notify', label: 'admin.investigation.action_notify' },
  { value: 'quarantine', label: 'admin.investigation.action_quarantine' },
  { value: 'throttle', label: 'admin.investigation.action_throttle' },
  { value: 'failover', label: 'admin.investigation.action_failover' },
];

const DEFAULT_THRESHOLDS: MetricThreshold[] = [
  { metric_key: 'latency_p99', label: 'admin.investigation.metric_latency_p99', min: 0, max: 5000, current: 500, unit: 'ms' },
  { metric_key: 'error_rate', label: 'admin.investigation.metric_error_rate', min: 0, max: 100, current: 5, unit: '%' },
  { metric_key: 'token_usage', label: 'admin.investigation.metric_token_usage', min: 0, max: 1000000, current: 50000, unit: 'tokens' },
  { metric_key: 'cpu_utilization', label: 'admin.investigation.metric_cpu', min: 0, max: 100, current: 80, unit: '%' },
  { metric_key: 'memory_utilization', label: 'admin.investigation.metric_memory', min: 0, max: 100, current: 85, unit: '%' },
];

@Component({
  selector: 'chora-alert-threshold-editor',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './alert-threshold-editor.component.html',
  styleUrl: './alert-threshold-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertThresholdEditorComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly thresholds = signal<MetricThreshold[]>(DEFAULT_THRESHOLDS);

  // --- Constants ---
  readonly allChannels = ALL_CHANNELS;
  readonly allSeverities = ALL_SEVERITIES;
  readonly allActions = ALL_ACTIONS;

  // --- Form ---
  readonly form: FormGroup = this.fb.group({
    channels: this.fb.group({
      email: [true],
      slack: [false],
      pagerduty: [false],
    }),
    breachRules: this.fb.array([]),
  });

  // --- Computed ---
  readonly enabledChannelCount = computed(() => {
    const channels = this.form.get('channels') as FormGroup;
    if (!channels) return 0;
    let count = 0;
    if (channels.get('email')?.value) count++;
    if (channels.get('slack')?.value) count++;
    if (channels.get('pagerduty')?.value) count++;
    return count;
  });

  readonly hasUnsavedChanges = signal(false);

  private subscriptions = new Subscription();

  get breachRules(): FormArray {
    return this.form.get('breachRules') as FormArray;
  }

  ngOnInit(): void {
    this.loadConfig();
    this.addBreachRule();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadConfig(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.bff.get<AlertConfig>('/api/v1/admin/alerts/config').subscribe({
        next: (config) => {
          if (config.thresholds?.length) {
            this.thresholds.set(config.thresholds);
          }
          if (config.channels) {
            const channelsGroup = this.form.get('channels') as FormGroup;
            channelsGroup.patchValue({
              email: config.channels.includes('email'),
              slack: config.channels.includes('slack'),
              pagerduty: config.channels.includes('pagerduty'),
            });
          }
          if (config.breach_rules?.length) {
            this.breachRules.clear();
            for (const rule of config.breach_rules) {
              this.addBreachRule(rule);
            }
          }
          this.loading.set(false);
        },
        error: () => {
          // Fall back to defaults on load error
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Threshold sliders
  // -------------------------------------------------------------------------

  onThresholdChange(metricKey: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.thresholds.update((list) =>
      list.map((t) => (t.metric_key === metricKey ? { ...t, current: value } : t)),
    );
    this.hasUnsavedChanges.set(true);
  }

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  onChannelChange(): void {
    this.hasUnsavedChanges.set(true);
  }

  // -------------------------------------------------------------------------
  // SLA Breach Rules
  // -------------------------------------------------------------------------

  addBreachRule(rule?: SlaBreachRule): void {
    const group = this.fb.group({
      severity: [rule?.severity ?? 'high', Validators.required],
      metric_key: [rule?.metric_key ?? 'latency_p99', Validators.required],
      threshold: [rule?.threshold ?? 1000, [Validators.required, Validators.min(0)]],
      action: [rule?.action ?? 'notify', Validators.required],
    });
    this.breachRules.push(group);
    this.hasUnsavedChanges.set(true);
  }

  removeBreachRule(index: number): void {
    this.breachRules.removeAt(index);
    this.hasUnsavedChanges.set(true);
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);

    const channelsGroup = this.form.get('channels') as FormGroup;
    const enabledChannels: NotificationChannel[] = [];
    if (channelsGroup.get('email')?.value) enabledChannels.push('email');
    if (channelsGroup.get('slack')?.value) enabledChannels.push('slack');
    if (channelsGroup.get('pagerduty')?.value) enabledChannels.push('pagerduty');

    const payload: AlertConfig = {
      thresholds: this.thresholds(),
      channels: enabledChannels,
      breach_rules: this.breachRules.value as SlaBreachRule[],
    };

    this.subscriptions.add(
      this.bff.put<void>('/api/v1/admin/alerts/config', payload).subscribe({
        next: () => {
          this.toast.show('admin.investigation.alerts_saved', 'success');
          this.saving.set(false);
          this.hasUnsavedChanges.set(false);
        },
        error: () => {
          this.toast.show('admin.investigation.alerts_save_error', 'error');
          this.saving.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  metricOptions(): { value: string; label: string }[] {
    return this.thresholds().map((t) => ({
      value: t.metric_key,
      label: t.label,
    }));
  }
}
