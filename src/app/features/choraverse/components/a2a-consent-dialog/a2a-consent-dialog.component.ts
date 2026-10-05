/**
 * A2AConsentDialogComponent — modal dialog for learner consent
 * when an external agent requests Familiar access.
 *
 * Displays partner verification status, agent name, requested skill,
 * data scope preview, duration options, and WebAuthn re-auth trigger.
 *
 * @see docs/design/ux_a2a_protocol.md (Consent grant flow)
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { A2AConsentService } from '../../services/a2a-consent.service';
import {
  ConsentScope,
  ConsentDuration,
  PartnerStatus,
  A2ASkill,
  CONSENT_SCOPE_LABELS,
  CONSENT_SCOPE_DESCRIPTIONS,
  CONSENT_DURATION_LABELS,
  A2A_SKILL_LABELS,
  ConsentGrantRequest,
} from '../../../admin/a2a/models/a2a.model';

/** Scope capability details for the preview matrix */
interface ScopeCapability {
  scope: ConsentScope;
  labelKey: string;
  descriptionKey: string;
  dataPoints: string[];
}

const SCOPE_CAPABILITIES: ScopeCapability[] = [
  {
    scope: ConsentScope.TopicsOnly,
    labelKey: CONSENT_SCOPE_LABELS[ConsentScope.TopicsOnly],
    descriptionKey: CONSENT_SCOPE_DESCRIPTIONS[ConsentScope.TopicsOnly],
    dataPoints: ['a2a.consent.data_topics_studied', 'a2a.consent.data_topic_progress'],
  },
  {
    scope: ConsentScope.LearningStyle,
    labelKey: CONSENT_SCOPE_LABELS[ConsentScope.LearningStyle],
    descriptionKey: CONSENT_SCOPE_DESCRIPTIONS[ConsentScope.LearningStyle],
    dataPoints: [
      'a2a.consent.data_topics_studied',
      'a2a.consent.data_topic_progress',
      'a2a.consent.data_learning_preferences',
      'a2a.consent.data_pace',
    ],
  },
  {
    scope: ConsentScope.EbbinghausSchedule,
    labelKey: CONSENT_SCOPE_LABELS[ConsentScope.EbbinghausSchedule],
    descriptionKey: CONSENT_SCOPE_DESCRIPTIONS[ConsentScope.EbbinghausSchedule],
    dataPoints: [
      'a2a.consent.data_topics_studied',
      'a2a.consent.data_retention_curve',
      'a2a.consent.data_review_schedule',
      'a2a.consent.data_mastery_scores',
    ],
  },
  {
    scope: ConsentScope.FullPersona,
    labelKey: CONSENT_SCOPE_LABELS[ConsentScope.FullPersona],
    descriptionKey: CONSENT_SCOPE_DESCRIPTIONS[ConsentScope.FullPersona],
    dataPoints: [
      'a2a.consent.data_full_persona',
      'a2a.consent.data_personality',
      'a2a.consent.data_strengths_weaknesses',
      'a2a.consent.data_interaction_history',
    ],
  },
];

@Component({
  selector: 'chora-a2a-consent-dialog',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a2a-consent-dialog.component.html',
  styleUrl: './a2a-consent-dialog.component.scss',
})
export class A2AConsentDialogComponent {
  private readonly consentService = inject(A2AConsentService);

  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------

  readonly partnerId = input.required<string>();
  readonly partnerName = input.required<string>();
  readonly partnerStatus = input.required<PartnerStatus>();
  readonly agentName = input.required<string>();
  readonly requestedSkill = input.required<A2ASkill>();

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  readonly consentGranted = output<void>();
  readonly consentDenied = output<void>();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly selectedScope = signal<ConsentScope>(ConsentScope.TopicsOnly);
  readonly selectedDuration = signal<ConsentDuration>(ConsentDuration.SingleSession);
  readonly isSubmitting = signal(false);
  readonly webauthnError = signal<string | null>(null);

  /** All scope capabilities for the preview matrix */
  readonly scopeCapabilities = SCOPE_CAPABILITIES;

  /** Consent scope enum values for radio buttons */
  readonly allScopes = Object.values(ConsentScope);

  /** Consent duration enum values for radio buttons */
  readonly allDurations = Object.values(ConsentDuration);

  /** Label maps */
  readonly scopeLabels = CONSENT_SCOPE_LABELS;
  readonly scopeDescriptions = CONSENT_SCOPE_DESCRIPTIONS;
  readonly durationLabels = CONSENT_DURATION_LABELS;
  readonly skillLabels = A2A_SKILL_LABELS;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly isVerified = computed(
    () => this.partnerStatus() === PartnerStatus.Verified,
  );

  readonly skillLabelKey = computed(
    () => this.skillLabels[this.requestedSkill()],
  );

  readonly selectedScopeCapability = computed(() =>
    SCOPE_CAPABILITIES.find((c) => c.scope === this.selectedScope()),
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  selectScope(scope: ConsentScope): void {
    this.selectedScope.set(scope);
  }

  selectDuration(duration: ConsentDuration): void {
    this.selectedDuration.set(duration);
  }

  async grantConsent(): Promise<void> {
    this.isSubmitting.set(true);
    this.webauthnError.set(null);

    try {
      // Trigger WebAuthn re-authentication
      const credential = await this.performWebAuthn();

      const request: ConsentGrantRequest = {
        partnerId: this.partnerId(),
        agentName: this.agentName(),
        skill: this.requestedSkill(),
        scope: this.selectedScope(),
        duration: this.selectedDuration(),
        webauthnCredential: credential,
      };

      this.consentService.grantConsent(request).subscribe({
        next: (consent) => {
          this.isSubmitting.set(false);
          if (consent) {
            this.consentGranted.emit();
          }
        },
        error: () => {
          this.isSubmitting.set(false);
        },
      });
    } catch {
      this.isSubmitting.set(false);
      this.webauthnError.set('a2a.consent.webauthn_failed');
    }
  }

  denyConsent(): void {
    this.consentDenied.emit();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async performWebAuthn(): Promise<string> {
    if (!navigator.credentials) {
      throw new Error('WebAuthn not supported');
    }

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
      },
    });

    return credential?.id ?? '';
  }
}
