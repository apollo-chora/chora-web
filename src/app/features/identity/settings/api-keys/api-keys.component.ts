/**
 * ApiKeysComponent — User-facing PlatformAPIKey management.
 *
 * Allows learners/admins to create, view, and revoke their own API keys.
 *
 * Route: /settings/api-keys
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
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KeyEnvironment = 'live' | 'test';
type KeyStatus = 'active' | 'revoked';

interface PlatformApiKey {
  id: string;
  name: string;
  prefix: string;
  environment: KeyEnvironment;
  status: KeyStatus;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyListResponse {
  data: PlatformApiKey[];
}

interface ApiKeyCreateRequest {
  name: string;
  environment: KeyEnvironment;
}

interface ApiKeyCreateResponse {
  data: {
    id: string;
    key: string;
    name: string;
    prefix: string;
    environment: KeyEnvironment;
  };
}

@Component({
  selector: 'chora-api-keys',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './api-keys.component.html',
  styleUrl: './api-keys.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly keys = signal<PlatformApiKey[]>([]);
  readonly isLoading = signal(true);

  /** Create-key form visibility */
  readonly showCreateForm = signal(false);

  /** Create-key form fields */
  readonly newKeyName = signal('');
  readonly newKeyEnv = signal<KeyEnvironment>('test');
  readonly isCreating = signal(false);

  /** Shown once after successful creation */
  readonly createdKeyValue = signal<string | null>(null);
  readonly copied = signal(false);

  /** Track which key is being revoked (spinner per row) */
  readonly revokingId = signal<string | null>(null);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  readonly isEmpty = computed(() => !this.isLoading() && this.keys().length === 0);
  readonly canCreate = computed(() => this.newKeyName().trim().length > 0 && !this.isCreating());

  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadKeys();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  private loadKeys(): void {
    this.isLoading.set(true);
    this.subscriptions.add(
      this.bff.get<ApiKeyListResponse>('/api/v1/iam/api-keys').subscribe({
        next: (response) => {
          this.keys.set(response.data ?? []);
          this.isLoading.set(false);
        },
        error: () => {
          this.keys.set([]);
          this.isLoading.set(false);
          this.toast.show('settings.api_keys.load_error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Create Key
  // ---------------------------------------------------------------------------

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
    if (!this.showCreateForm()) {
      this.resetCreateForm();
    }
  }

  onNameInput(value: string): void {
    this.newKeyName.set(value);
  }

  onEnvChange(value: string): void {
    this.newKeyEnv.set(value as KeyEnvironment);
  }

  createKey(): void {
    const name = this.newKeyName().trim();
    if (!name) return;

    this.isCreating.set(true);

    const body: ApiKeyCreateRequest = {
      name,
      environment: this.newKeyEnv(),
    };

    this.subscriptions.add(
      this.bff.post<ApiKeyCreateResponse>('/api/v1/iam/api-keys', body).subscribe({
        next: (response) => {
          this.isCreating.set(false);
          this.showCreateForm.set(false);
          this.resetCreateForm();

          // Show the full key once
          this.createdKeyValue.set(response.data.key);
          this.copied.set(false);

          // Reload list
          this.loadKeys();
          this.toast.show('settings.api_keys.created', 'success');
        },
        error: () => {
          this.isCreating.set(false);
          this.toast.show('settings.api_keys.create_error', 'error');
        },
      }),
    );
  }

  dismissCreatedKey(): void {
    this.createdKeyValue.set(null);
    this.copied.set(false);
  }

  async copyKey(): Promise<void> {
    const key = this.createdKeyValue();
    if (!key) return;

    try {
      await navigator.clipboard.writeText(key);
      this.copied.set(true);
      this.toast.show('settings.api_keys.copied', 'success');
    } catch {
      this.toast.show('settings.api_keys.copy_error', 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // Revoke Key
  // ---------------------------------------------------------------------------

  async revokeKey(apiKey: PlatformApiKey): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'settings.api_keys.revoke_title',
      message: 'settings.api_keys.revoke_message',
      confirmText: 'settings.api_keys.revoke_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.revokingId.set(apiKey.id);

    this.subscriptions.add(
      this.bff.delete(`/api/v1/iam/api-keys/${apiKey.id}`).subscribe({
        next: () => {
          this.revokingId.set(null);
          // Update the key status in-place
          this.keys.update((current) =>
            current.map((k) =>
              k.id === apiKey.id ? { ...k, status: 'revoked' as KeyStatus } : k,
            ),
          );
          this.toast.show('settings.api_keys.revoked', 'success');
        },
        error: () => {
          this.revokingId.set(null);
          this.toast.show('settings.api_keys.revoke_error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }

  statusClass(status: KeyStatus): string {
    return `api-keys__status-badge--${status}`;
  }

  envClass(env: KeyEnvironment): string {
    return `api-keys__env-badge--${env}`;
  }

  private resetCreateForm(): void {
    this.newKeyName.set('');
    this.newKeyEnv.set('test');
    this.isCreating.set(false);
  }
}
