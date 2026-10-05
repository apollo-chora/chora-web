/**
 * PartnerRegistrationComponent — partner registration admin for platform_ops.
 *
 * Provides registration form, DNS TXT challenge display,
 * verification polling, and partner registry table.
 *
 * @see docs/design/ux_a2a_protocol.md (Partner registration flow)
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
import { Subscription, interval, switchMap, takeWhile } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { A2AService } from '../../services/a2a.service';
import {
  A2ASkill,
  PartnerRegistration,
  PartnerStatus,
  A2A_SKILL_LABELS,
  PARTNER_STATUS_LABELS,
} from '../../models/a2a.model';

type ViewMode = 'registry' | 'register';

@Component({
  selector: 'chora-partner-registration',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './partner-registration.component.html',
  styleUrl: './partner-registration.component.scss',
})
export class PartnerRegistrationComponent implements OnInit, OnDestroy {
  private readonly a2aService = inject(A2AService);
  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Current view mode */
  readonly viewMode = signal<ViewMode>('registry');

  /** Form fields */
  readonly orgName = signal('');
  readonly orgDomain = signal('');
  readonly contactEmail = signal('');
  readonly maxAgents = signal(10);
  readonly rateLimitPerHour = signal(100);
  readonly selectedSkills = signal<A2ASkill[]>([]);

  /** DNS challenge info (shown after registration) */
  readonly dnsChallenge = signal<string | null>(null);
  readonly isVerifying = signal(false);
  readonly dnsVerified = signal(false);

  /** Newly registered partner (for DNS verification view) */
  readonly newPartnerId = signal<string | null>(null);

  /** Skill options */
  readonly allSkills = Object.values(A2ASkill);
  readonly skillLabels = A2A_SKILL_LABELS;
  readonly statusLabels = PARTNER_STATUS_LABELS;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly partners = this.a2aService.partners;
  readonly partnersState = this.a2aService.partnersState;
  readonly isSubmitting = this.a2aService.isSubmitting;

  readonly isFormValid = computed(() => {
    return (
      this.orgName().trim().length > 0 &&
      this.orgDomain().trim().length > 0 &&
      this.contactEmail().trim().length > 0 &&
      this.contactEmail().includes('@') &&
      this.selectedSkills().length > 0 &&
      this.maxAgents() > 0 &&
      this.rateLimitPerHour() > 0
    );
  });

  readonly verifiedPartners = computed(() =>
    this.partners().filter((p) => p.status === PartnerStatus.Verified),
  );

  readonly pendingPartners = computed(() =>
    this.partners().filter((p) => p.status === PartnerStatus.Pending),
  );

  readonly expiredPartners = computed(() =>
    this.partners().filter((p) => p.status === PartnerStatus.Expired),
  );

  readonly suspendedPartners = computed(() =>
    this.partners().filter((p) => p.status === PartnerStatus.Suspended),
  );

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.subscriptions.add(
      this.a2aService.getPartners().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // View navigation
  // ---------------------------------------------------------------------------

  showRegistrationForm(): void {
    this.viewMode.set('register');
    this.resetForm();
  }

  showRegistry(): void {
    this.viewMode.set('registry');
    this.dnsChallenge.set(null);
    this.isVerifying.set(false);
    this.dnsVerified.set(false);
    this.newPartnerId.set(null);
  }

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  updateOrgName(event: Event): void {
    this.orgName.set((event.target as HTMLInputElement).value);
  }

  updateOrgDomain(event: Event): void {
    this.orgDomain.set((event.target as HTMLInputElement).value);
  }

  updateContactEmail(event: Event): void {
    this.contactEmail.set((event.target as HTMLInputElement).value);
  }

  updateMaxAgents(event: Event): void {
    this.maxAgents.set(Number((event.target as HTMLInputElement).value) || 10);
  }

  updateRateLimitPerHour(event: Event): void {
    this.rateLimitPerHour.set(Number((event.target as HTMLInputElement).value) || 100);
  }

  toggleSkill(skill: A2ASkill): void {
    this.selectedSkills.update((skills) => {
      if (skills.includes(skill)) {
        return skills.filter((s) => s !== skill);
      }
      return [...skills, skill];
    });
  }

  isSkillSelected(skill: A2ASkill): boolean {
    return this.selectedSkills().includes(skill);
  }

  submitRegistration(): void {
    if (!this.isFormValid()) return;

    const registration: PartnerRegistration = {
      orgName: this.orgName().trim(),
      orgDomain: this.orgDomain().trim(),
      contactEmail: this.contactEmail().trim(),
      allowedSkills: this.selectedSkills(),
      maxAgents: this.maxAgents(),
      rateLimitPerHour: this.rateLimitPerHour(),
    };

    this.subscriptions.add(
      this.a2aService.registerPartner(registration).subscribe({
        next: (partner) => {
          if (partner) {
            this.dnsChallenge.set(partner.dnsChallenge);
            this.newPartnerId.set(partner.id);
          }
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // DNS verification
  // ---------------------------------------------------------------------------

  startDnsVerification(): void {
    const partnerId = this.newPartnerId();
    if (!partnerId) return;

    this.isVerifying.set(true);

    // Poll every 5 seconds until verified or 60 seconds elapsed
    this.subscriptions.add(
      interval(5_000).pipe(
        switchMap(() => this.a2aService.checkDnsVerification(partnerId)),
        takeWhile((result) => {
          if (result?.verified) {
            this.dnsVerified.set(true);
            this.isVerifying.set(false);
            // Refresh partner list
            this.a2aService.getPartners().subscribe();
            return false;
          }
          return true;
        }),
      ).subscribe(),
    );
  }

  // ---------------------------------------------------------------------------
  // Partner status helpers
  // ---------------------------------------------------------------------------

  statusBadgeClass(status: PartnerStatus): string {
    return `partner-registration__badge--${status}`;
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private resetForm(): void {
    this.orgName.set('');
    this.orgDomain.set('');
    this.contactEmail.set('');
    this.maxAgents.set(10);
    this.rateLimitPerHour.set(100);
    this.selectedSkills.set([]);
    this.dnsChallenge.set(null);
    this.isVerifying.set(false);
    this.dnsVerified.set(false);
    this.newPartnerId.set(null);
  }
}
