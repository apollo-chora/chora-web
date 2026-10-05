/**
 * H+ Branding & Configuration — Stage 3 wave 3 (CHO-1709 WP-5).
 *
 * Tenant admin configures tenant logo, brand colors, typography, and a
 * few federation toggles. Form-heavy screen with a live preview pane on
 * the right.
 *
 * Wave 3 wires the real BFF (wave 2 shipped a static MTM mock —
 * removed here, no mock fallback remains):
 *   - hydrate on init via GET  /api/v1/tenants/me            (CHO-1692)
 *   - persist via       PATCH /api/v1/tenants/me/branding    (CHO-1655)
 * through the shared TenantBrandingService (same service the H+ Setup
 * Wizard step 1 uses — single wire-shape owner, no duplicate client).
 *
 * Backend-canonical fields: primary color / logo URL / custom domain
 * (+ read-only tenant display name). Secondary color, font family and
 * the white-label / SMTP toggles have NO backend yet — they stay local
 * draft state (participate in dirty tracking + preview, are never sent)
 * until their BE lands.
 *
 * Vocabulary: `Tenant` (NOT "organization"), `TenantEntitlement` for
 * add-on flag. White-label is gated by a `TenantEntitlement` flag.
 *
 * Source HTML: chora-web/.stitch-imports/hplus/branding-configuration.html
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantBrandingService } from '../../../admin/tenant-admin/services/tenant-branding.service';
import {
  BrandingResponse,
  TenantBrandingSnapshot,
} from '../../../admin/tenant-admin/models/tenant-branding.model';

interface BrandSnapshot {
  readonly tenantName: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly fontFamily: string;
  readonly logoFileName: string | null;
  /** Backend-canonical logo URL (PATCH body field `logo_url`). */
  readonly logoUrl: string;
  readonly customDomain: string;
  readonly whiteLabelEnabled: boolean;
  readonly customSmtpEnabled: boolean;
}

/**
 * Display defaults for fields the backend has no persisted value for.
 * NOT tenant data — `<input type="color">` requires a valid hex (an
 * empty value renders as #000000), and the preview needs a font stack.
 * Defaults only become persisted state if the admin edits + saves.
 */
const DISPLAY_DEFAULT_PRIMARY = '#2563eb';
const DISPLAY_DEFAULT_SECONDARY = '#0ea5e9';
const DISPLAY_DEFAULT_FONT = 'Inter';

const EMPTY_SNAPSHOT: BrandSnapshot = Object.freeze({
  tenantName: '',
  primaryColor: DISPLAY_DEFAULT_PRIMARY,
  secondaryColor: DISPLAY_DEFAULT_SECONDARY,
  fontFamily: DISPLAY_DEFAULT_FONT,
  logoFileName: null,
  logoUrl: '',
  customDomain: '',
  whiteLabelEnabled: false,
  customSmtpEnabled: false,
});

/** Per-kind fallback codes when the error body carried no envelope. */
const FALLBACK_CODE: Record<string, string> = {
  invalid: 'invalid_argument',
  unauthenticated: 'unauthenticated',
  'tenant-not-found': 'tenant_not_found',
  'server-error': 'server_error',
  'network-error': 'network_error',
};

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'chora-hplus-branding',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './branding-configuration.component.html',
  styleUrl: './branding-configuration.component.scss',
})
export class BrandingConfigurationComponent {
  private readonly brandingSvc = inject(TenantBrandingService);
  private readonly destroyRef = inject(DestroyRef);

  /** Last-saved baseline — used to compute dirty + reset on discard. */
  private readonly _baseline = signal<BrandSnapshot>(EMPTY_SNAPSHOT);

  /** Working draft the form mutates. */
  private readonly _draft = signal<BrandSnapshot>(EMPTY_SNAPSHOT);

  readonly draft = this._draft.asReadonly();
  readonly baseline = this._baseline.asReadonly();

  // --- Hydrate (GET /api/v1/tenants/me) state ---
  private readonly _loadState = signal<LoadState>('loading');
  private readonly _loadErrorCode = signal<string | null>(null);
  readonly loadState = this._loadState.asReadonly();
  readonly loadErrorCode = this._loadErrorCode.asReadonly();

  // --- Save (PATCH /api/v1/tenants/me/branding) state ---
  private readonly _saveState = signal<SaveState>('idle');
  private readonly _saveErrorCode = signal<string | null>(null);
  private readonly _saveErrorMessage = signal<string | null>(null);
  readonly saveState = this._saveState.asReadonly();
  readonly saveErrorCode = this._saveErrorCode.asReadonly();
  readonly saveErrorMessage = this._saveErrorMessage.asReadonly();

  readonly isDirty = computed(() => {
    const b = this._baseline();
    const d = this._draft();
    return (
      b.tenantName !== d.tenantName ||
      b.primaryColor !== d.primaryColor ||
      b.secondaryColor !== d.secondaryColor ||
      b.fontFamily !== d.fontFamily ||
      b.logoFileName !== d.logoFileName ||
      b.logoUrl !== d.logoUrl ||
      b.customDomain !== d.customDomain ||
      b.whiteLabelEnabled !== d.whiteLabelEnabled ||
      b.customSmtpEnabled !== d.customSmtpEnabled
    );
  });

  constructor() {
    this.hydrate();
  }

  /** Re-issue the hydrate GET after a load failure (error-banner CTA). */
  retryHydrate(): void {
    this.hydrate();
  }

  private hydrate(): void {
    this._loadState.set('loading');
    this._loadErrorCode.set(null);
    this.brandingSvc
      .hydrateBranding()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.kind === 'success') {
          const snap = this.fromSnapshot(result.snapshot);
          this._baseline.set(snap);
          this._draft.set(snap);
          this._loadState.set('ready');
          return;
        }
        this._loadErrorCode.set(result.code ?? FALLBACK_CODE[result.kind]);
        this._loadState.set('error');
      });
  }

  /** Map the persisted snapshot onto the form, coercing display defaults. */
  private fromSnapshot(s: TenantBrandingSnapshot): BrandSnapshot {
    return {
      tenantName: s.displayName,
      primaryColor: s.primaryColorHex || DISPLAY_DEFAULT_PRIMARY,
      secondaryColor: DISPLAY_DEFAULT_SECONDARY,
      fontFamily: DISPLAY_DEFAULT_FONT,
      logoFileName: this.fileNameFromUrl(s.logoUrl),
      logoUrl: s.logoUrl,
      customDomain: s.customDomain,
      whiteLabelEnabled: false,
      customSmtpEnabled: false,
    };
  }

  /** Derive a human-readable file name from the persisted logo URL. */
  private fileNameFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const segment = new URL(url).pathname.split('/').pop();
      return segment && segment.length > 0 ? segment : url;
    } catch {
      return url;
    }
  }

  /**
   * All draft mutations funnel through here so stale save feedback
   * (saved tick / error banner) clears as soon as the admin edits again.
   */
  private mutateDraft(fn: (d: BrandSnapshot) => BrandSnapshot): void {
    if (this._saveState() === 'saved' || this._saveState() === 'error') {
      this._saveState.set('idle');
      this._saveErrorCode.set(null);
      this._saveErrorMessage.set(null);
    }
    this._draft.update(fn);
  }

  setPrimaryColor(value: string): void {
    this.mutateDraft((d) => ({ ...d, primaryColor: value }));
  }

  setSecondaryColor(value: string): void {
    this.mutateDraft((d) => ({ ...d, secondaryColor: value }));
  }

  setFontFamily(value: string): void {
    this.mutateDraft((d) => ({ ...d, fontFamily: value }));
  }

  setCustomDomain(value: string): void {
    this.mutateDraft((d) => ({ ...d, customDomain: value }));
  }

  toggleWhiteLabel(): void {
    this.mutateDraft((d) => ({ ...d, whiteLabelEnabled: !d.whiteLabelEnabled }));
  }

  toggleCustomSmtp(): void {
    this.mutateDraft((d) => ({ ...d, customSmtpEnabled: !d.customSmtpEnabled }));
  }

  /**
   * CHO-1805: replaces the old onLogoSelected file-picker handler.
   * The admin pastes a hosted image URL (https://…/logo.png); we set
   * draft.logoUrl directly so the PATCH /api/v1/tenants/me/branding
   * call actually persists it. draft.logoFileName mirrors the URL's
   * basename for the file-meta display.
   */
  setLogoUrl(value: string): void {
    const trimmed = value.trim();
    this.mutateDraft((d) => ({
      ...d,
      logoUrl: trimmed,
      logoFileName: this.fileNameFromUrl(trimmed),
    }));
  }

  /** Pure event-handler shims for templates (cast target → input). */
  onPrimaryInput(event: Event): void {
    this.setPrimaryColor((event.target as HTMLInputElement).value);
  }

  onLogoUrlInput(event: Event): void {
    this.setLogoUrl((event.target as HTMLInputElement).value);
  }

  onSecondaryInput(event: Event): void {
    this.setSecondaryColor((event.target as HTMLInputElement).value);
  }

  onFontInput(event: Event): void {
    this.setFontFamily((event.target as HTMLInputElement).value);
  }

  onDomainInput(event: Event): void {
    this.setCustomDomain((event.target as HTMLInputElement).value);
  }

  /** Discard reverts the draft to the saved baseline. */
  discard(): void {
    this.mutateDraft(() => this._baseline());
  }

  /**
   * Persist the draft via PATCH /api/v1/tenants/me/branding. Sends the
   * backend-canonical fields as displayed (the service strips empties so
   * chora-tenancy's PATCH-merge preserves unset fields). On success the
   * response — the persisted state — overwrites the canonical fields and
   * the whole draft promotes to baseline. On error the draft stays dirty
   * (no silent promotion) and the banner carries the API code.
   */
  save(): void {
    if (
      !this.isDirty() ||
      this._saveState() === 'saving' ||
      this._loadState() !== 'ready'
    ) {
      return;
    }
    this._saveState.set('saving');
    this._saveErrorCode.set(null);
    this._saveErrorMessage.set(null);
    const d = this._draft();
    this.brandingSvc
      .updateBranding({
        primary_color_hex: d.primaryColor,
        logo_url: d.logoUrl,
        custom_domain: d.customDomain,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result.kind === 'success') {
          this.promoteBaseline(result.response);
          this._saveState.set('saved');
          return;
        }
        this._saveErrorCode.set(result.code ?? FALLBACK_CODE[result.kind]);
        this._saveErrorMessage.set(
          result.kind === 'invalid' ? result.message : null,
        );
        this._saveState.set('error');
      });
  }

  /**
   * Fold the PATCH response (server truth for the canonical fields) into
   * the draft, then promote it to baseline. Local-only fields (secondary
   * color / font / toggles / picked file name) keep their draft values.
   */
  private promoteBaseline(response: BrandingResponse): void {
    const merged: BrandSnapshot = {
      ...this._draft(),
      primaryColor: response.primary_color_hex || DISPLAY_DEFAULT_PRIMARY,
      logoUrl: response.logo_url,
      customDomain: response.custom_domain,
    };
    this._draft.set(merged);
    this._baseline.set(merged);
  }
}
