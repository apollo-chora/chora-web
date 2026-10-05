/**
 * CrossTenantEnrollmentComponent -- Multi-step enrollment flow for users
 * accepting an invitation to join a new tenant (they already have a GCID).
 *
 * Route: /enroll?token=xxx
 *
 * Flow:
 *   1. Identity Confirmation -- "You're joining [Tenant] as [Role]"
 *   2. Portable Data Preview -- What GCID-scoped data follows them
 *   3. Tenant-Specific Setup -- What's new in this tenant
 *   4. Confirm Enrollment -- Summary + join/decline
 *
 * On confirm: POST /api/v1/tenancy/enrollment/accept
 * On decline: redirect home with cancellation toast
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
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../core/services/bff-client.service';
import { LandingService } from '../../../core/auth/landing.service';
import { isApiError } from '../../../core/interceptors/api-error.model';

// ---------------------------------------------------------------------------
// Local interfaces
// ---------------------------------------------------------------------------

type EnrollmentStep = 'identity' | 'portable-data' | 'tenant-setup' | 'confirm';

interface InviteDetails {
  token: string;
  tenant_id: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  role: string;
  invited_email: string;
  expires_at: string;
}

interface UserIdentity {
  gcid: string;
  display_name: string;
  email: string;
  tenant_count: number;
}

interface PortableDataItem {
  key: string;
  labelKey: string;
  value: string;
  icon: string;
}

interface TenantPreview {
  available_paths: TenantPath[];
  enabled_features: string[];
  org_unit: TenantOrgUnit | null;
}

interface TenantPath {
  id: string;
  title: string;
  atom_count: number;
}

interface TenantOrgUnit {
  id: string;
  name: string;
  location: string;
}

interface PortableDataSummary {
  knowledge_graph_nodes: number;
  familiar_name: string | null;
  familiar_level: number;
  achievement_badges: number;
  digital_skins: number;
}

interface InviteValidationResponse {
  invite: InviteDetails;
  user: UserIdentity;
  portable_data: PortableDataSummary;
  tenant_preview: TenantPreview;
}

interface EnrollmentAcceptResponse {
  membership_id: string;
  tenant_id: string;
  redirect_url: string;
}

const INVITE_VALIDATE_PATH = '/api/v1/tenancy/enrollment/validate';
const ENROLLMENT_ACCEPT_PATH = '/api/v1/tenancy/enrollment/accept';
const ENROLLMENT_DECLINE_PATH = '/api/v1/tenancy/enrollment/decline';

@Component({
  selector: 'chora-cross-tenant-enrollment',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './cross-tenant-enrollment.component.html',
  styleUrl: './cross-tenant-enrollment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrossTenantEnrollmentComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly landing = inject(LandingService);

  // --- State ---
  readonly currentStep = signal<EnrollmentStep>('identity');
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly identityConfirmed = signal(false);

  // --- Data ---
  readonly invite = signal<InviteDetails | null>(null);
  readonly userIdentity = signal<UserIdentity | null>(null);
  readonly portableDataSummary = signal<PortableDataSummary | null>(null);
  readonly tenantPreview = signal<TenantPreview | null>(null);
  readonly token = signal<string | null>(null);

  // --- Computed ---
  readonly portableDataItems = computed<PortableDataItem[]>(() => {
    const data = this.portableDataSummary();
    if (!data) return [];

    const items: PortableDataItem[] = [
      {
        key: 'knowledge_graph',
        labelKey: 'onboarding.enrollment.portable_knowledge_graph',
        value: String(data.knowledge_graph_nodes),
        icon: 'graph',
      },
      {
        key: 'achievements',
        labelKey: 'onboarding.enrollment.portable_achievements',
        value: String(data.achievement_badges),
        icon: 'trophy',
      },
      {
        key: 'skins',
        labelKey: 'onboarding.enrollment.portable_skins',
        value: String(data.digital_skins),
        icon: 'palette',
      },
    ];

    if (data.familiar_name) {
      items.splice(1, 0, {
        key: 'familiar',
        labelKey: 'onboarding.enrollment.portable_familiar',
        value: `${data.familiar_name} (Lv. ${data.familiar_level})`,
        icon: 'pet',
      });
    }

    return items;
  });

  readonly tenantName = computed(() => this.invite()?.tenant_name ?? '');
  readonly roleName = computed(() => this.invite()?.role ?? '');
  readonly userName = computed(() => this.userIdentity()?.display_name ?? '');
  readonly userEmail = computed(() => this.userIdentity()?.email ?? '');
  readonly userTenantCount = computed(() => this.userIdentity()?.tenant_count ?? 0);

  readonly isTokenExpired = computed(() => {
    const inv = this.invite();
    if (!inv) return false;
    return new Date(inv.expires_at) < new Date();
  });

  readonly canProceed = computed(() => {
    const step = this.currentStep();
    if (step === 'identity') return this.identityConfirmed();
    return true;
  });

  readonly stepIndex = computed(() => {
    const steps: EnrollmentStep[] = ['identity', 'portable-data', 'tenant-setup', 'confirm'];
    return steps.indexOf(this.currentStep());
  });

  readonly isFirstStep = computed(() => this.stepIndex() === 0);
  readonly isLastStep = computed(() => this.currentStep() === 'confirm');

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const tokenParam = this.route.snapshot.queryParamMap.get('token');
    if (!tokenParam) {
      this.errorMessage.set('onboarding.enrollment.error_no_token');
      this.isLoading.set(false);
      return;
    }
    this.token.set(tokenParam);
    this.validateInvite(tokenParam);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  private validateInvite(inviteToken: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.subscriptions.add(
      this.bff.post<InviteValidationResponse>(INVITE_VALIDATE_PATH, { token: inviteToken }).subscribe({
        next: (response) => {
          this.invite.set(response.invite);
          this.userIdentity.set(response.user);
          this.portableDataSummary.set(response.portable_data);
          this.tenantPreview.set(response.tenant_preview);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          if (isApiError(err) && err.code === 'INVITE_EXPIRED') {
            this.errorMessage.set('onboarding.enrollment.error_expired');
          } else if (isApiError(err) && err.code === 'INVITE_INVALID') {
            this.errorMessage.set('onboarding.enrollment.error_invalid');
          } else {
            this.errorMessage.set(
              isApiError(err) ? err.message : 'onboarding.enrollment.error_generic',
            );
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const steps: EnrollmentStep[] = ['identity', 'portable-data', 'tenant-setup', 'confirm'];
    const idx = steps.indexOf(this.currentStep());
    if (idx < steps.length - 1) {
      this.currentStep.set(steps[idx + 1]);
    }
  }

  previousStep(): void {
    const steps: EnrollmentStep[] = ['identity', 'portable-data', 'tenant-setup', 'confirm'];
    const idx = steps.indexOf(this.currentStep());
    if (idx > 0) {
      this.currentStep.set(steps[idx - 1]);
    }
  }

  onIdentityConfirmChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.identityConfirmed.set(checked);
  }

  // -------------------------------------------------------------------------
  // Enrollment actions
  // -------------------------------------------------------------------------

  confirmEnrollment(): void {
    const inviteToken = this.token();
    if (!inviteToken) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.subscriptions.add(
      this.bff.post<EnrollmentAcceptResponse>(ENROLLMENT_ACCEPT_PATH, { token: inviteToken }).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.toast.show('onboarding.enrollment.success', 'success');
          this.router.navigateByUrl(this.landing.landingRoute());
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(
            isApiError(err) ? err.message : 'onboarding.enrollment.error_accept_failed',
          );
        },
      }),
    );
  }

  declineEnrollment(): void {
    const inviteToken = this.token();
    if (!inviteToken) {
      this.router.navigateByUrl('/');
      return;
    }

    this.isSubmitting.set(true);

    this.subscriptions.add(
      this.bff.post<void>(ENROLLMENT_DECLINE_PATH, { token: inviteToken }).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.toast.show('onboarding.enrollment.declined', 'info');
          this.router.navigateByUrl('/');
        },
        error: () => {
          this.isSubmitting.set(false);
          this.toast.show('onboarding.enrollment.declined', 'info');
          this.router.navigateByUrl('/');
        },
      }),
    );
  }
}
