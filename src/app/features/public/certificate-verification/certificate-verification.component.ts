/**
 * CertificateVerificationComponent — Verifies a certificate by ID, showing
 * holder name, program, date, and verification status (valid/invalid/expired).
 *
 * Route: /verify/:certId
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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

type VerificationStatus = 'valid' | 'invalid' | 'expired';

interface CertificateVerificationResponse {
  certificate_id: string;
  holder_name: string;
  program_name: string;
  issued_at: string;
  expires_at: string | null;
  verification_status: VerificationStatus;
}

type CertViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; certificate: CertificateVerificationResponse }
  | { status: 'error'; message: string };

const STATUS_LABELS: Record<VerificationStatus, string> = {
  valid: 'Verified',
  invalid: 'Invalid',
  expired: 'Expired',
};

@Component({
  selector: 'chora-certificate-verification',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="cert-verify" data-testid="certificate-verification">
      @if (state().status === 'loading') {
        <div class="cert-verify__loading" data-testid="cert-loading">
          <p>Verifying certificate...</p>
        </div>
      } @else if (state().status === 'error') {
        <div class="cert-verify__error" data-testid="cert-error">
          <h2>Verification Failed</h2>
          <p>{{ errorMessage() }}</p>
        </div>
      } @else if (state().status === 'success') {
        <div class="cert-verify__badge" data-testid="cert-status-badge"
             [class]="statusClass()">
          <span class="cert-verify__badge-icon" aria-hidden="true">
            @if (certificate()!.verification_status === 'valid') {
              &#10003;
            } @else if (certificate()!.verification_status === 'expired') {
              &#9202;
            } @else {
              &#10007;
            }
          </span>
          <span class="cert-verify__badge-label">{{ statusLabel() }}</span>
        </div>

        <section class="cert-verify__details" data-testid="cert-details">
          <h1 class="cert-verify__program" data-testid="cert-program">
            {{ certificate()!.program_name }}
          </h1>

          <dl class="cert-verify__info">
            <div class="cert-verify__info-row">
              <dt>Certificate Holder</dt>
              <dd data-testid="cert-holder">{{ certificate()!.holder_name }}</dd>
            </div>
            <div class="cert-verify__info-row">
              <dt>Date Issued</dt>
              <dd data-testid="cert-date">{{ formatDate(certificate()!.issued_at) }}</dd>
            </div>
            <div class="cert-verify__info-row">
              <dt>Certificate ID</dt>
              <dd data-testid="cert-id" class="cert-verify__cert-id">
                {{ certificate()!.certificate_id }}
              </dd>
            </div>
          </dl>
        </section>

        <div class="cert-verify__cta-container">
          <a routerLink="/register" class="cert-verify__cta" data-testid="cert-signup-cta">
            Get certified on Chora
          </a>
        </div>
      }
    </article>
  `,
  styles: [`
    .cert-verify {
      max-width: 560px;
      margin: 0 auto;
      padding: var(--chora-space-xl);
      text-align: center;

      &__loading, &__error {
        padding: var(--chora-space-2xl);
        color: var(--chora-color-text-secondary);
      }

      &__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--chora-space-sm);
        padding: var(--chora-space-sm) var(--chora-space-lg);
        border-radius: var(--chora-radius-md);
        font-weight: 700;
        font-size: 18px;
        margin-bottom: var(--chora-space-xl);
      }

      &__badge--valid {
        background: #d4edda;
        color: #155724;
      }

      &__badge--invalid {
        background: #f8d7da;
        color: #721c24;
      }

      &__badge--expired {
        background: #fff3cd;
        color: #856404;
      }

      &__badge-icon {
        font-size: 22px;
      }

      &__details {
        margin-bottom: var(--chora-space-xl);
      }

      &__program {
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-lg);
      }

      &__info {
        text-align: start;
      }

      &__info-row {
        display: flex;
        justify-content: space-between;
        padding: var(--chora-space-sm) 0;
        border-bottom: 1px solid var(--chora-color-surface-1, #eee);

        dt {
          font-weight: 600;
          color: var(--chora-color-text-secondary);
        }

        dd {
          color: var(--chora-color-text-primary);
          margin: 0;
        }
      }

      &__cert-id {
        font-family: monospace;
        font-size: 13px;
      }

      &__cta-container {
        margin-top: var(--chora-space-lg);
      }

      &__cta {
        display: inline-block;
        padding: var(--chora-space-sm) var(--chora-space-xl);
        background: var(--chora-color-primary);
        color: var(--chora-color-on-primary);
        border-radius: var(--chora-radius-md);
        text-decoration: none;
        font-weight: 600;
        transition: opacity var(--chora-transition-fast);

        &:hover { opacity: 0.9; }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CertificateVerificationComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly state = signal<CertViewState>({ status: 'idle' });

  readonly certificate = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.certificate : null;
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  readonly statusLabel = computed(() => {
    const cert = this.certificate();
    return cert ? STATUS_LABELS[cert.verification_status] : '';
  });

  readonly statusClass = computed(() => {
    const cert = this.certificate();
    return cert ? `cert-verify__badge cert-verify__badge--${cert.verification_status}` : 'cert-verify__badge';
  });

  private subscription = new Subscription();

  ngOnInit(): void {
    const certId = this.route.snapshot.paramMap.get('certId');
    if (!certId) {
      this.state.set({ status: 'error', message: 'No certificate ID provided' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.subscription.add(
      this.bff
        .get<CertificateVerificationResponse>(
          `/api/v1/certificates/${encodeURIComponent(certId)}/verify`,
        )
        .subscribe({
          next: (certificate) => this.state.set({ status: 'success', certificate }),
          error: () =>
            this.state.set({
              status: 'error',
              message: 'This certificate could not be verified. It may not exist.',
            }),
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }
}
