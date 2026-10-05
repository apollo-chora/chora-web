import {
  Component, ChangeDetectionStrategy, inject, computed, OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { TenantContextService } from '../../../core/auth/tenant-context.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-settings',
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="settings" data-testid="settings-page">
      <h1 class="settings__title">{{ 'settings.title' | translate }}</h1>

      <!-- Profile Section -->
      <section class="settings__section" data-testid="settings-profile">
        <h2 class="settings__section-title">{{ 'settings.profile' | translate }}</h2>
        <div class="settings__card">
          <div class="settings__avatar" aria-hidden="true">
            {{ initial() }}
          </div>
          <div class="settings__info">
            <div class="settings__row">
              <span class="settings__label">{{ 'identity.profile.display_name' | translate }}</span>
              <span class="settings__value" data-testid="settings-name">{{ displayName() }}</span>
            </div>
            <div class="settings__row">
              <span class="settings__label">{{ 'identity.profile.email' | translate }}</span>
              <span class="settings__value" data-testid="settings-email">{{ email() }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Organization Section -->
      <section class="settings__section" data-testid="settings-org">
        <h2 class="settings__section-title">Organization</h2>
        <div class="settings__card">
          <div class="settings__row">
            <span class="settings__label">Current</span>
            <span class="settings__value" data-testid="settings-tenant">{{ tenantName() }}</span>
          </div>
          <div class="settings__row">
            <span class="settings__label">Roles</span>
            <span class="settings__value settings__value--roles" data-testid="settings-roles">
              @for (role of roles(); track role) {
                <span class="settings__role-badge">{{ role }}</span>
              }
            </span>
          </div>
        </div>
      </section>

      <!-- Quick Links -->
      <section class="settings__section" data-testid="settings-links">
        <h2 class="settings__section-title">Quick Links</h2>
        <nav class="settings__links" role="list">
          <a routerLink="/settings/security" class="settings__link" role="listitem" data-testid="settings-security-link">
            <span class="material-icons-outlined" aria-hidden="true">security</span>
            {{ 'settings.security' | translate }}
          </a>
          <a routerLink="/settings/notifications" class="settings__link" role="listitem">
            <span class="material-icons-outlined" aria-hidden="true">notifications</span>
            {{ 'settings.notifications' | translate }}
          </a>
          <a routerLink="/settings/identity" class="settings__link" role="listitem">
            <span class="material-icons-outlined" aria-hidden="true">swap_horiz</span>
            {{ 'settings.data' | translate }}
          </a>
          <a routerLink="/settings/account/delete" class="settings__link settings__link--danger" role="listitem">
            <span class="material-icons-outlined" aria-hidden="true">delete_forever</span>
            {{ 'account_deletion.title' | translate }}
          </a>
        </nav>
      </section>
    </div>
  `,
  styles: [`
    .settings {
      max-width: 680px;
      margin: 0 auto;
      padding: var(--chora-space-lg);
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-lg);

      &__title {
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--chora-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 var(--chora-space-sm);
      }

      &__card {
        display: flex;
        align-items: flex-start;
        gap: var(--chora-space-md);
        padding: var(--chora-space-md);
        background: var(--chora-color-surface-1);
        border: 1px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
      }

      &__avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--chora-radius-full);
        background: var(--chora-color-primary);
        color: #fff;
        font-size: 20px;
        font-weight: 700;
        flex-shrink: 0;
      }

      &__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--chora-space-sm);
      }

      &__row {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      &__label {
        font-size: 12px;
        font-weight: 500;
        color: var(--chora-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      &__value {
        font-size: 15px;
        color: var(--chora-color-text-primary);

        &--roles {
          display: flex;
          flex-wrap: wrap;
          gap: var(--chora-space-xs);
        }
      }

      &__role-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: var(--chora-radius-full);
        background: rgba(25, 118, 210, 0.08);
        color: var(--chora-color-primary);
        font-size: 12px;
        font-weight: 500;
      }

      &__links {
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
        overflow: hidden;
      }

      &__link {
        display: flex;
        align-items: center;
        gap: var(--chora-space-sm);
        padding: var(--chora-space-md);
        background: var(--chora-color-surface-1);
        color: var(--chora-color-text-primary);
        text-decoration: none;
        font-size: 15px;
        transition: background var(--chora-transition-fast);

        .material-icons-outlined { font-size: 20px; color: var(--chora-color-text-secondary); }

        &:hover { background: var(--chora-color-surface-2); }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: -2px; }

        &--danger {
          color: var(--chora-color-danger);
          .material-icons-outlined { color: var(--chora-color-danger); }
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly tenantCtx = inject(TenantContextService);

  // Fall back to email-local-part when the cached profile has no
  // displayName — common right after sign-in if the IdP federation never
  // populated one. Refreshing from /api/me on init picks up admin-set
  // display names that were applied after the session JWT was minted.
  readonly displayName = computed(() => {
    const cached = this.auth.user()?.displayName?.trim();
    if (cached) return cached;
    const email = this.auth.user()?.email ?? '';
    return email.split('@')[0] || '';
  });
  readonly email = computed(() => this.auth.user()?.email ?? '');
  readonly initial = computed(() => this.displayName().charAt(0).toUpperCase());
  readonly roles = computed(() => this.auth.user()?.roles ?? []);
  readonly tenantName = computed(() => this.tenantCtx.currentTenant()?.name || this.tenantCtx.currentTenant()?.id || 'None');

  ngOnInit(): void {
    // Pull a fresh /api/me on view init so the displayName the admin set
    // via H+ Members Editor (CHO-1817) lands here without requiring a
    // sign-out + sign-in cycle.
    this.auth.refreshProfile();
  }
}
