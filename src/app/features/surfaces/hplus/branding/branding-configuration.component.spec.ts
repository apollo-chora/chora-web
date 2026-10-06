/**
 * BrandingConfigurationComponent spec — CHO-1709 WP-5.
 *
 * The H+ branding page is rewired from the wave-2 static mock
 * (MTM_INITIAL + local-only save) to the real BFF:
 *   - hydrate on init via GET  /api/v1/tenants/me            (CHO-1692)
 *   - persist via       PATCH /api/v1/tenants/me/branding    (CHO-1655)
 * through the shared TenantBrandingService (no duplicate service).
 *
 * RED-first per .claude/rules/development-execution.md — these specs
 * drive the real TenantBrandingService through HttpTestingController so
 * they pin the wire contract (URL, method, body, error envelope), not a
 * service mock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { BrandingConfigurationComponent } from './branding-configuration.component';
import { environment } from '../../../../../environments/environment';

const GET_URL = `${environment.bffBaseUrl}/api/v1/tenants/me`;
const PATCH_URL = `${environment.bffBaseUrl}/api/v1/tenants/me/branding`;

/** Canonical hydration fixture — mirrors chora-tenancy's v1TenantDTO. */
const ME_TENANT_OK = {
  id: 'ten_01HZX',
  display_name: 'MTM Singapore',
  status: 'active',
  branding: {
    primary_color_hex: '#0f766e',
    logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
    custom_domain: 'learn.mtm.sg',
  },
  wizard_completed_at: '2026-05-30T08:00:00Z',
};

interface Ctx {
  fixture: ComponentFixture<BrandingConfigurationComponent>;
  component: BrandingConfigurationComponent;
  element: HTMLElement;
  httpMock: HttpTestingController;
}

function setup(): Ctx {
  TestBed.configureTestingModule({
    imports: [BrandingConfigurationComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(BrandingConfigurationComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    httpMock,
  };
}

/** Flush the init GET with a 200 tenant doc and re-render. */
function flushHydrateOk(ctx: Ctx, body: object = ME_TENANT_OK): void {
  ctx.httpMock.expectOne(GET_URL).flush(body);
  ctx.fixture.detectChanges();
}

describe('BrandingConfigurationComponent', () => {
  let mock: HttpTestingController | undefined;

  afterEach(() => {
    mock?.verify();
    mock = undefined;
    TestBed.resetTestingModule();
  });

  describe('hydrate on init', () => {
    it('issues GET /api/v1/tenants/me on creation and shows the loading state', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      const req = ctx.httpMock.expectOne(GET_URL);
      expect(req.request.method).toBe('GET');
      expect(
        ctx.element.querySelector('[data-testid="branding-loading"]'),
      ).toBeTruthy();
      // Form is withheld until hydration lands — no stale/mock values.
      expect(
        ctx.element.querySelector('[data-testid="branding-primary-input"]'),
      ).toBeNull();
      req.flush(ME_TENANT_OK);
    });

    it('renders no tenant data before hydration (mock constant is gone)', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      expect(ctx.element.textContent).not.toContain('MTM');
      expect(ctx.element.textContent?.toLowerCase()).not.toContain('#0f766e');

      flushHydrateOk(ctx, {
        ...ME_TENANT_OK,
        display_name: 'Acme Learning',
      });
      const preview = ctx.element.querySelector(
        '[data-testid="branding-preview-name"]',
      );
      expect(preview?.textContent).toContain('Acme Learning');
      expect(ctx.element.textContent).not.toContain('MTM');
    });

    it('populates the form from the GET response', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const preview = ctx.element.querySelector(
        '[data-testid="branding-preview-name"]',
      );
      expect(preview?.textContent).toContain('MTM Singapore');

      const swatch = ctx.element.querySelector(
        '[data-testid="branding-primary-swatch"]',
      );
      expect(swatch?.textContent?.toLowerCase()).toContain('#0f766e');

      const domain = ctx.element.querySelector(
        '[data-testid="branding-domain"]',
      ) as HTMLInputElement;
      expect(domain.value).toBe('learn.mtm.sg');

      // Logo display name derives from the persisted logo_url.
      const logoMeta = ctx.element.querySelector(
        '[data-testid="branding-logo-filename"]',
      );
      expect(logoMeta?.textContent).toContain('logo.svg');

      expect(
        ctx.element.querySelector('[data-testid="branding-loading"]'),
      ).toBeNull();
    });

    it('starts clean — isDirty false and Save disabled after hydration', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      expect(ctx.component.isDirty()).toBe(false);
      const save = ctx.element.querySelector(
        '[data-testid="branding-save"]',
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });

    it('falls back to display defaults when the tenant has no branding yet', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx, { id: 'ten_fresh', display_name: 'Fresh Co' });

      const primary = ctx.element.querySelector(
        '[data-testid="branding-primary-input"]',
      ) as HTMLInputElement;
      // <input type=color> needs a valid hex; an empty persisted value
      // renders a sane default rather than #000000 garbage.
      expect(primary.value).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(ctx.component.isDirty()).toBe(false);

      const preview = ctx.element.querySelector(
        '[data-testid="branding-preview-name"]',
      );
      expect(preview?.textContent).toContain('Fresh Co');
    });
  });

  describe('hydrate error', () => {
    it('5xx → error banner with the API code; form withheld; no mock fallback', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      ctx.httpMock.expectOne(GET_URL).flush(
        { error: { code: 'GATEWAY_UPSTREAM_5XX', message: 'upstream returned 500' } },
        { status: 502, statusText: 'Bad Gateway' },
      );
      ctx.fixture.detectChanges();

      const banner = ctx.element.querySelector(
        '[data-testid="branding-load-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('GATEWAY_UPSTREAM_5XX');
      expect(
        ctx.element.querySelector('[data-testid="branding-primary-input"]'),
      ).toBeNull();
      expect(ctx.element.textContent).not.toContain('MTM');
    });

    it('network failure → error banner with the network_error fallback code', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      ctx.httpMock.expectOne(GET_URL).error(new ProgressEvent('failure'), {
        status: 0,
        statusText: '',
      });
      ctx.fixture.detectChanges();

      const banner = ctx.element.querySelector(
        '[data-testid="branding-load-error"]',
      );
      expect(banner?.textContent).toContain('network_error');
    });

    it('Retry refires the GET and renders the form on success', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      ctx.httpMock
        .expectOne(GET_URL)
        .flush(
          { error: { code: 'internal_error', message: 'boom' } },
          { status: 502, statusText: 'Bad Gateway' },
        );
      ctx.fixture.detectChanges();

      const retry = ctx.element.querySelector(
        '[data-testid="branding-retry"]',
      ) as HTMLButtonElement;
      expect(retry).toBeTruthy();
      retry.click();
      ctx.fixture.detectChanges();

      flushHydrateOk(ctx);
      expect(
        ctx.element.querySelector('[data-testid="branding-load-error"]'),
      ).toBeNull();
      const domain = ctx.element.querySelector(
        '[data-testid="branding-domain"]',
      ) as HTMLInputElement;
      expect(domain.value).toBe('learn.mtm.sg');
    });
  });

  describe('save', () => {
    it('PATCHes the edited canonical fields through the BFF', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.component.setCustomDomain('learn2.mtm.sg');
      ctx.fixture.detectChanges();

      const save = ctx.element.querySelector(
        '[data-testid="branding-save"]',
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
      save.click();

      const req = ctx.httpMock.expectOne(PATCH_URL);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        primary_color_hex: '#123456',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn2.mtm.sg',
      });
      req.flush({
        primary_color_hex: '#123456',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn2.mtm.sg',
      });
    });

    it('disables the Save CTA while the PATCH is in flight', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.fixture.detectChanges();
      const save = ctx.element.querySelector(
        '[data-testid="branding-save"]',
      ) as HTMLButtonElement;
      save.click();
      ctx.fixture.detectChanges();

      expect(ctx.component.saveState()).toBe('saving');
      expect(save.disabled).toBe(true);

      ctx.httpMock.expectOne(PATCH_URL).flush({
        primary_color_hex: '#123456',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn.mtm.sg',
      });
    });

    it('success → feedback banner, clean dirty state, baseline from the response', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.fixture.detectChanges();
      (
        ctx.element.querySelector(
          '[data-testid="branding-save"]',
        ) as HTMLButtonElement
      ).click();

      ctx.httpMock.expectOne(PATCH_URL).flush({
        primary_color_hex: '#123456',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn.mtm.sg',
      });
      ctx.fixture.detectChanges();

      expect(
        ctx.element.querySelector('[data-testid="branding-save-success"]'),
      ).toBeTruthy();
      expect(ctx.component.isDirty()).toBe(false);
      // Server response is the new baseline — discard must NOT revert to
      // the pre-save color.
      ctx.component.discard();
      ctx.fixture.detectChanges();
      const swatch = ctx.element.querySelector(
        '[data-testid="branding-primary-swatch"]',
      );
      expect(swatch?.textContent?.toLowerCase()).toContain('#123456');
    });

    it('server-normalised values from the PATCH response win over the draft', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setCustomDomain('LEARN2.MTM.SG');
      ctx.fixture.detectChanges();
      (
        ctx.element.querySelector(
          '[data-testid="branding-save"]',
        ) as HTMLButtonElement
      ).click();

      ctx.httpMock.expectOne(PATCH_URL).flush({
        primary_color_hex: '#0f766e',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn2.mtm.sg',
      });
      ctx.fixture.detectChanges();

      const domain = ctx.element.querySelector(
        '[data-testid="branding-domain"]',
      ) as HTMLInputElement;
      expect(domain.value).toBe('learn2.mtm.sg');
      expect(ctx.component.isDirty()).toBe(false);
    });

    it('editing after a successful save clears the saved feedback', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.fixture.detectChanges();
      (
        ctx.element.querySelector(
          '[data-testid="branding-save"]',
        ) as HTMLButtonElement
      ).click();
      ctx.httpMock.expectOne(PATCH_URL).flush({
        primary_color_hex: '#123456',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn.mtm.sg',
      });
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="branding-save-success"]'),
      ).toBeTruthy();

      ctx.component.setPrimaryColor('#654321');
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="branding-save-success"]'),
      ).toBeNull();
    });

    it('4xx → error banner with API code + message; dirty preserved; no baseline promotion', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.fixture.detectChanges();
      (
        ctx.element.querySelector(
          '[data-testid="branding-save"]',
        ) as HTMLButtonElement
      ).click();

      ctx.httpMock.expectOne(PATCH_URL).flush(
        {
          error: {
            code: 'invalid_argument',
            message: 'primary_color_hex must be #RRGGBB',
          },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      ctx.fixture.detectChanges();

      const banner = ctx.element.querySelector(
        '[data-testid="branding-save-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('invalid_argument');
      expect(banner?.textContent).toContain('primary_color_hex must be #RRGGBB');
      // The edit is NOT silently promoted — user can retry or discard.
      expect(ctx.component.isDirty()).toBe(true);
      ctx.component.discard();
      ctx.fixture.detectChanges();
      const swatch = ctx.element.querySelector(
        '[data-testid="branding-primary-swatch"]',
      );
      expect(swatch?.textContent?.toLowerCase()).toContain('#0f766e');
    });

    it('5xx with no envelope → error banner with the server_error fallback code', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#123456');
      ctx.fixture.detectChanges();
      (
        ctx.element.querySelector(
          '[data-testid="branding-save"]',
        ) as HTMLButtonElement
      ).click();

      ctx.httpMock
        .expectOne(PATCH_URL)
        .flush({}, { status: 500, statusText: 'Internal Server Error' });
      ctx.fixture.detectChanges();

      const banner = ctx.element.querySelector(
        '[data-testid="branding-save-error"]',
      );
      expect(banner?.textContent).toContain('server_error');
      expect(ctx.component.isDirty()).toBe(true);
    });

    it('save is a no-op when the form is clean', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.save();
      ctx.httpMock.expectNone(PATCH_URL);
    });
  });

  describe('form controls drive the draft', () => {
    function input(ctx: Ctx, testid: string): HTMLInputElement {
      return ctx.element.querySelector(
        `[data-testid="${testid}"]`,
      ) as HTMLInputElement;
    }

    function type(ctx: Ctx, testid: string, value: string): void {
      const el = input(ctx, testid);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      ctx.fixture.detectChanges();
    }

    it('primary + secondary color inputs update the draft', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      type(ctx, 'branding-primary-input', '#aa11bb');
      expect(ctx.component.draft().primaryColor).toBe('#aa11bb');

      type(ctx, 'branding-secondary-input', '#cc22dd');
      expect(ctx.component.draft().secondaryColor).toBe('#cc22dd');
      expect(ctx.component.isDirty()).toBe(true);
    });

    it('font family + custom domain inputs update the draft', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      type(ctx, 'branding-font-family', 'Space Grotesk');
      expect(ctx.component.draft().fontFamily).toBe('Space Grotesk');

      type(ctx, 'branding-domain', 'learn3.mtm.sg');
      expect(ctx.component.draft().customDomain).toBe('learn3.mtm.sg');
    });

    // CHO-1805 superseded these three tests:
    //   - white-label/SMTP toggle "flip local draft state" — toggles are
    //     now disabled (BE-less so admin can't be misled). New disabled
    //     assertions live in the "MVP polish" describe.
    //   - "picking a logo file records its name locally" and "a change
    //     event with no file" — the file picker is removed; the new
    //     logo_url text input is asserted in the "MVP polish" describe.

    it('a non-URL persisted logo_url falls back to the raw value as display name', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx, {
        ...ME_TENANT_OK,
        branding: {
          primary_color_hex: '#0f766e',
          logo_url: 'not-a-valid-url',
          custom_domain: 'learn.mtm.sg',
        },
      });

      expect(ctx.component.draft().logoFileName).toBe('not-a-valid-url');
    });
  });

  describe('discard', () => {
    it('reverts the draft to the hydrated baseline', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      ctx.component.setPrimaryColor('#abcdef');
      ctx.component.discard();
      ctx.fixture.detectChanges();

      expect(ctx.component.isDirty()).toBe(false);
      const swatch = ctx.element.querySelector(
        '[data-testid="branding-primary-swatch"]',
      );
      expect(swatch?.textContent?.toLowerCase()).toContain('#0f766e');
    });
  });

  describe('render basics', () => {
    it('creates with data-testid root + surface-hplus accent class', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const root = ctx.element.querySelector(
        '[data-testid="hplus-branding"]',
      ) as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.classList.contains('surface-hplus')).toBe(true);
    });

    it('renders a single <main> landmark and a semantic h1', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      expect(ctx.element.querySelectorAll('main').length).toBe(1);
      expect(ctx.element.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('accessibility', () => {
    it('every <input> has an associated label or aria-label', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const inputs = Array.from(
        ctx.element.querySelectorAll('input:not([type="hidden"])'),
      );
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        const id = input.getAttribute('id');
        const hasLabel = id
          ? !!ctx.element.querySelector(`label[for="${id}"]`)
          : false;
        expect(
          hasLabel ||
            !!input.getAttribute('aria-label') ||
            !!input.getAttribute('aria-labelledby'),
        ).toBe(true);
      }
    });

    it('all interactive buttons have accessible names', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const buttons = Array.from(ctx.element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria =
          btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });

    it('error banners use role="alert" so failures are announced', () => {
      const ctx = setup();
      mock = ctx.httpMock;

      ctx.httpMock
        .expectOne(GET_URL)
        .flush(
          { error: { code: 'internal_error', message: 'boom' } },
          { status: 502, statusText: 'Bad Gateway' },
        );
      ctx.fixture.detectChanges();

      const banner = ctx.element.querySelector(
        '[data-testid="branding-load-error"]',
      );
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });

  // CHO-1805 — MVP polish. The file picker on the Logo field never actually
  // uploaded anything; it only set draft.logoFileName for display. Save sent
  // back the OLD logo_url from hydration, so the admin's "logo change" was
  // silently discarded. Replace with a text input so logo_url is editable.
  // Sibling fields (secondary color / font / white-label / SMTP) are FE-only
  // draft state with no BE persistence — disable them with a Coming soon
  // badge so the user can't be misled.
  describe('MVP polish — CHO-1805', () => {
    it('renders a logo URL text input bound to draft.logoUrl (not a file picker)', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const urlInput = ctx.element.querySelector(
        '[data-testid="branding-logo-url"]',
      ) as HTMLInputElement | null;
      expect(urlInput).toBeTruthy();
      expect(urlInput?.tagName).toBe('INPUT');
      expect(urlInput?.type).toBe('url');
      expect(urlInput?.value).toBe('https://cdn.mtm.sg/brand/logo.svg');

      // The legacy file picker has to go — keeping it alongside the URL
      // input is the same demo trap (filename appears, nothing uploads).
      expect(
        ctx.element.querySelector('[data-testid="branding-logo-input"]'),
      ).toBeNull();
      expect(
        ctx.element.querySelector('[data-testid="branding-logo-upload"]'),
      ).toBeNull();
    });

    it('typing a new logo URL marks the form dirty and saves it', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const urlInput = ctx.element.querySelector(
        '[data-testid="branding-logo-url"]',
      ) as HTMLInputElement;
      urlInput.value = 'https://cdn.mtm.sg/brand/logo-v2.svg';
      urlInput.dispatchEvent(new Event('input'));
      ctx.fixture.detectChanges();

      expect(ctx.component.isDirty()).toBe(true);
      const save = ctx.element.querySelector(
        '[data-testid="branding-save"]',
      ) as HTMLButtonElement;
      save.click();

      const req = ctx.httpMock.expectOne(PATCH_URL);
      expect(req.request.body).toEqual({
        primary_color_hex: '#0f766e',
        logo_url: 'https://cdn.mtm.sg/brand/logo-v2.svg',
        custom_domain: 'learn.mtm.sg',
      });
      req.flush({
        primary_color_hex: '#0f766e',
        logo_url: 'https://cdn.mtm.sg/brand/logo-v2.svg',
        custom_domain: 'learn.mtm.sg',
      });
    });

    const FE_ONLY_SELECTORS: readonly {
      label: string;
      input: string;
      badge: string;
    }[] = [
      {
        label: 'secondary color',
        input: '[data-testid="branding-secondary-input"]',
        badge: '[data-testid="branding-secondary-coming-soon"]',
      },
      {
        label: 'font family',
        input: '[data-testid="branding-font-family"]',
        badge: '[data-testid="branding-font-coming-soon"]',
      },
      {
        label: 'white-label toggle',
        input: '[data-testid="branding-toggle-white-label"]',
        badge: '[data-testid="branding-white-label-coming-soon"]',
      },
      {
        label: 'SMTP toggle',
        input: '[data-testid="branding-toggle-smtp"]',
        badge: '[data-testid="branding-smtp-coming-soon"]',
      },
    ];

    for (const { label, input, badge } of FE_ONLY_SELECTORS) {
      it(`${label}: input is disabled (FE-only state has no BE persistence)`, () => {
        const ctx = setup();
        mock = ctx.httpMock;
        flushHydrateOk(ctx);

        const el = ctx.element.querySelector(input) as
          | HTMLInputElement
          | HTMLButtonElement
          | null;
        expect(el).toBeTruthy();
        expect(el?.hasAttribute('disabled')).toBe(true);
      });

      it(`${label}: a Coming soon badge sits next to the field`, () => {
        const ctx = setup();
        mock = ctx.httpMock;
        flushHydrateOk(ctx);

        const el = ctx.element.querySelector(badge);
        expect(el).toBeTruthy();
        // TranslateService falls back to the key when no bundle is loaded —
        // the badge must therefore render `hplus.branding.comingSoon`, NOT
        // a hardcoded English string. The i18n bundle (`en.json`) ships
        // "Coming soon" as the canonical copy.
        expect(el?.textContent?.trim()).toBe('hplus.branding.comingSoon');
      });
    }

    it('preview aside aria-label is translated, not hardcoded English', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const aside = ctx.element.querySelector(
        '[data-testid="branding-preview"]',
      );
      // TranslateService falls back to the key when not loaded — the
      // aria-label must be the i18n key path, NOT the hardcoded "Brand preview".
      expect(aside?.getAttribute('aria-label')).toBe(
        'hplus.branding.previewAriaLabel',
      );
    });

    // CHO-1807 — the live preview previously only reflected the primary
    // colour (gradient + CTA background). The logo URL the admin pasted
    // had no on-page visual confirmation; you had to refresh the page
    // and re-hydrate to know whether the URL was sane. Render the logo
    // image inside the preview banner so paste-and-see works.
    it('preview banner renders an img bound to draft.logoUrl with the tenant name as alt', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const img = ctx.element.querySelector(
        '[data-testid="branding-preview-logo"]',
      ) as HTMLImageElement | null;
      expect(img).toBeTruthy();
      expect(img?.tagName).toBe('IMG');
      // The fixture's logo_url comes from ME_TENANT_OK.
      expect(img?.getAttribute('src')).toBe(
        'https://cdn.mtm.sg/brand/logo.svg',
      );
      // Alt text falls back to the tenant display name for screen readers.
      expect(img?.getAttribute('alt')).toBe('MTM Singapore');
    });

    it('typing a new logo URL re-points the preview img immediately', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      flushHydrateOk(ctx);

      const urlInput = ctx.element.querySelector(
        '[data-testid="branding-logo-url"]',
      ) as HTMLInputElement;
      urlInput.value = 'https://cdn.mtm.sg/brand/v2.png';
      urlInput.dispatchEvent(new Event('input'));
      ctx.fixture.detectChanges();

      const img = ctx.element.querySelector(
        '[data-testid="branding-preview-logo"]',
      ) as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(
        'https://cdn.mtm.sg/brand/v2.png',
      );
    });

    it('preview logo img is omitted when draft.logoUrl is empty', () => {
      const ctx = setup();
      mock = ctx.httpMock;
      // Hydrate a tenant with no logo persisted yet.
      flushHydrateOk(ctx, {
        id: 'ten_fresh',
        display_name: 'Fresh Co',
        branding: { primary_color_hex: '#0f766e', logo_url: '', custom_domain: '' },
      });

      expect(
        ctx.element.querySelector('[data-testid="branding-preview-logo"]'),
      ).toBeNull();
    });
  });
});
