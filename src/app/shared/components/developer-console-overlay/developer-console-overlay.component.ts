/**
 * DeveloperConsoleOverlayComponent — global slide-down overlay for the developer console.
 *
 * Activated by pressing tilde (~) anywhere in the app.
 * Role-gated via DeveloperConsoleOverlayService.
 * Desktop-only (>=1280px), monospace dark theme.
 * PII-safe: never displays email, display name, or raw API keys (AC-6).
 *
 * Phase 57.2 (CHO-117).
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeveloperConsoleOverlayService } from '../../../core/services/developer-console-overlay.service';

@Component({
  selector: 'chora-developer-console-overlay',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isVisible()) {
      <div class="dev-overlay" role="dialog" aria-label="Developer Console">
        <div class="dev-overlay__header">
          <span class="dev-overlay__title">Developer Console</span>
          <span class="dev-overlay__hint">Press ~ to close</span>
          <button
            class="dev-overlay__close"
            (click)="overlay.close()"
            aria-label="Close developer console"
          >
            &times;
          </button>
        </div>
        <div class="dev-overlay__body">
          <nav class="dev-overlay__nav">
            <a [routerLink]="['/admin/developer']" class="dev-overlay__link" (click)="overlay.close()">
              Full Console
            </a>
            <a [routerLink]="['/admin/developer/api-inspector']" class="dev-overlay__link" (click)="overlay.close()">
              API Inspector
            </a>
            <a [routerLink]="['/admin/developer/feature-flags']" class="dev-overlay__link" (click)="overlay.close()">
              Feature Flags
            </a>
            <a [routerLink]="['/admin/developer/event-bus']" class="dev-overlay__link" (click)="overlay.close()">
              Event Bus
            </a>
            <a [routerLink]="['/admin/developer/rls-context']" class="dev-overlay__link" (click)="overlay.close()">
              RLS Context
            </a>
          </nav>
          <div class="dev-overlay__info">
            <p class="dev-overlay__item">
              <span class="dev-overlay__label">Status:</span>
              <span class="dev-overlay__value dev-overlay__value--ok">Connected</span>
            </p>
            <p class="dev-overlay__item">
              <span class="dev-overlay__label">Build:</span>
              <span class="dev-overlay__value">dev</span>
            </p>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      pointer-events: none;
    }

    .dev-overlay {
      pointer-events: auto;
      background: rgba(18, 18, 24, 0.96);
      color: #e0e0e0;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      border-bottom: 2px solid #00ff88;
      animation: slideDown 0.2s ease-out;
      max-height: 40vh;
      overflow-y: auto;
    }

    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .dev-overlay__header {
      display: flex;
      align-items: center;
      gap: var(--chora-space-md, 16px);
      padding: var(--chora-space-sm, 8px) var(--chora-space-md, 16px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dev-overlay__title {
      font-weight: 700;
      color: #00ff88;
      letter-spacing: 0.5px;
    }

    .dev-overlay__hint {
      margin-inline-start: auto;
      color: rgba(255, 255, 255, 0.4);
      font-size: 11px;
    }

    .dev-overlay__close {
      background: none;
      border: none;
      color: #ff5555;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }

    .dev-overlay__close:hover {
      color: #ff8888;
    }

    .dev-overlay__body {
      padding: var(--chora-space-sm, 8px) var(--chora-space-md, 16px);
    }

    .dev-overlay__nav {
      display: flex;
      gap: var(--chora-space-md, 16px);
      margin-bottom: var(--chora-space-sm, 8px);
      flex-wrap: wrap;
    }

    .dev-overlay__link {
      color: #66b3ff;
      text-decoration: none;
      padding: 4px 8px;
      border-radius: var(--chora-radius-sm, 4px);

      &:hover {
        background: rgba(102, 179, 255, 0.15);
      }

      &:focus-visible {
        outline: 2px solid #00ff88;
        outline-offset: 2px;
      }
    }

    .dev-overlay__info {
      display: flex;
      gap: var(--chora-space-lg, 24px);
    }

    .dev-overlay__item {
      margin: 0;
    }

    .dev-overlay__label {
      color: rgba(255, 255, 255, 0.5);
      margin-inline-end: 4px;
    }

    .dev-overlay__value {
      color: #e0e0e0;
    }

    .dev-overlay__value--ok {
      color: #00ff88;
    }

    @media (max-width: 1279px) {
      .dev-overlay {
        display: none;
      }
    }
  `],
})
export class DeveloperConsoleOverlayComponent {
  readonly overlay = inject(DeveloperConsoleOverlayService);

  readonly isVisible = computed(() => this.overlay.isOpen() && this.overlay.canAccess());
}
