/**
 * H+ IdP Federation component spec — Wave 4 wiring (CHO-1694).
 *
 * Wave 3 asserted purely mock-driven state changes (click Disconnect →
 * card flips to disconnected via local signal). Wave 4 wires the
 * component to `TenantIdpAdminService`; this spec asserts:
 *
 *   - On mount, the component calls `service.list()` and renders cards
 *     derived from the server rows (Microsoft / Google card derivation
 *     by `discovery_url` prefix).
 *   - Connect CTA opens an inline form; submitting calls
 *     `service.upsert()` and reloads on success.
 *   - Disconnect CTA opens a confirm overlay; confirming calls
 *     `service.delete()` and reloads on success.
 *   - Test Connection button is rendered DISABLED with a tooltip
 *     attribute (live handshake deferred).
 *   - Loading + error states render via `[data-testid="idp-loading"]`
 *     and `[data-testid="idp-load-error"]`.
 *
 * The previous Wave 3 mock-state assertions (testing-spinner timer,
 * card state flip on click) are dropped because the behaviours moved
 * into the service contract (covered by tenant-idp-admin.service.spec.ts).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';

import { IdpFederationComponent } from './idp-federation.component';
import { TenantIdpAdminService } from '../../../admin/tenant-admin/services/tenant-idp-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type {
  IdpDeleteResult,
  IdpListResult,
  IdpProviderRow,
  IdpProviderUpsertPayload,
  IdpUpsertResult,
  ProviderType,
} from '../../../admin/tenant-admin/models/tenant-idp-admin.model';

function makeIdpServiceMock(opts: {
  list?: IdpListResult;
  upsert?: IdpUpsertResult;
  delete?: IdpDeleteResult;
}) {
  // Typed params on each vi.fn() so `mock.calls[0]` is inferred as the
  // real argument tuple instead of `[]` — without this, every read of
  // `mock.calls[0][0]` is a TS2493 ("tuple type '[]' has no element at
  // index 0") and breaks `tsc --noEmit -p tsconfig.spec.json` repo-wide
  // (the Angular spec compiler is project-wide; one bad fixture fails
  // every test). Dale flagged this in §7.4 of the value-streams tracker.
  return {
    list: vi.fn(() => of(opts.list ?? ({ kind: 'success', rows: [] } as IdpListResult))),
    upsert: vi.fn((_payload: IdpProviderUpsertPayload) =>
      of(opts.upsert ?? ({ kind: 'success', row: sampleOidcRow } as IdpUpsertResult)),
    ),
    delete: vi.fn((_providerType: ProviderType) =>
      of(opts.delete ?? ({ kind: 'success' } as IdpDeleteResult)),
    ),
  };
}

function makeToastMock() {
  return { show: vi.fn() };
}

const sampleOidcRow: IdpProviderRow = {
  id: 'idp-microsoft-1',
  tenant_id: 't-1',
  provider_type: 'oidc',
  client_id: 'msft-client',
  client_secret_name: 'projects/x/secrets/idp-secret-msft',
  discovery_url:
    'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  singpass_enabled: false,
  created_at: '2026-06-09T00:00:00Z',
  updated_at: '2026-06-09T00:00:00Z',
};

interface SetupOpts {
  list?: IdpListResult;
  upsert?: IdpUpsertResult;
  delete?: IdpDeleteResult;
}

async function setup(
  opts: SetupOpts = {},
): Promise<{
  fixture: ComponentFixture<IdpFederationComponent>;
  component: IdpFederationComponent;
  element: HTMLElement;
  idpMock: ReturnType<typeof makeIdpServiceMock>;
  toastMock: ReturnType<typeof makeToastMock>;
}> {
  const idpMock = makeIdpServiceMock(opts);
  const toastMock = makeToastMock();

  await TestBed.configureTestingModule({
    imports: [IdpFederationComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantIdpAdminService, useValue: idpMock },
      { provide: ToastService, useValue: toastMock },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(IdpFederationComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  return { fixture, component, element, idpMock, toastMock };
}

describe('IdpFederationComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // ---------------------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------------------

  describe('hydration on mount', () => {
    it('calls idpSvc.list exactly once on construction', async () => {
      const { idpMock } = await setup();
      expect(idpMock.list).toHaveBeenCalledTimes(1);
    });

    it('renders 4 IdP cards from the default view-model', async () => {
      const { element } = await setup();
      const cards = element.querySelectorAll('[data-testid^="idp-card-"]');
      expect(cards.length).toBe(4);
    });

    it('marks the Microsoft card connected when an oidc row with login.microsoftonline.com URL is returned', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      const card = element.querySelector('[data-testid="idp-card-microsoft"]');
      expect(card?.getAttribute('data-state')).toBe('connected');
    });

    it('marks the Google card connected when an oidc row with accounts.google.com URL is returned', async () => {
      const googleRow: IdpProviderRow = {
        ...sampleOidcRow,
        discovery_url:
          'https://accounts.google.com/.well-known/openid-configuration',
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [googleRow] },
      });
      const card = element.querySelector('[data-testid="idp-card-google"]');
      expect(card?.getAttribute('data-state')).toBe('connected');
    });

    it('marks Singpass connected when singpass row has singpass_enabled=true', async () => {
      const singpassRow: IdpProviderRow = {
        ...sampleOidcRow,
        provider_type: 'singpass',
        discovery_url: undefined,
        client_secret_name: undefined,
        singpass_enabled: true,
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [singpassRow] },
      });
      const card = element.querySelector('[data-testid="idp-card-singpass"]');
      expect(card?.getAttribute('data-state')).toBe('connected');
    });

    it('marks Singpass pending when singpass row has singpass_enabled=false', async () => {
      const singpassRow: IdpProviderRow = {
        ...sampleOidcRow,
        provider_type: 'singpass',
        discovery_url: undefined,
        client_secret_name: undefined,
        singpass_enabled: false,
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [singpassRow] },
      });
      const card = element.querySelector('[data-testid="idp-card-singpass"]');
      expect(card?.getAttribute('data-state')).toBe('pending');
    });

    it('surfaces the secret-configured affordance when client_secret_name is set', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      expect(
        element.querySelector('[data-testid="idp-microsoft-secret-name"]'),
      ).toBeTruthy();
    });

    it('renders all cards disconnected on empty server response', async () => {
      // Default setup() uses { kind:"success", rows: [] } — no rows means
      // every card should be disconnected (singpass falls back to disconnected
      // when no singpass row is present).
      const { element } = await setup();
      const cards = element.querySelectorAll('[data-testid^="idp-card-"]');
      for (const c of Array.from(cards)) {
        if (c.getAttribute('data-testid') === 'idp-card-singpass') {
          expect(c.getAttribute('data-state')).toBe('disconnected');
        } else {
          expect(c.getAttribute('data-state')).toBe('disconnected');
        }
      }
    });

    it('shows the load-error banner when list returns server-error', async () => {
      const { element } = await setup({ list: { kind: 'server-error' } });
      expect(element.querySelector('[data-testid="idp-load-error"]')).toBeTruthy();
    });

    it('shows the load-error banner when list returns unauthenticated', async () => {
      const { element } = await setup({ list: { kind: 'unauthenticated' } });
      expect(element.querySelector('[data-testid="idp-load-error"]')).toBeTruthy();
    });

    it('emits the loading indicator while list is in flight', async () => {
      const listSubject = new Subject<IdpListResult>();
      const idpMock = {
        list: vi.fn(() => listSubject.asObservable()),
        upsert: vi.fn(),
        delete: vi.fn(),
      };
      await TestBed.configureTestingModule({
        imports: [IdpFederationComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantIdpAdminService, useValue: idpMock },
          { provide: ToastService, useValue: makeToastMock() },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(IdpFederationComponent);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="idp-loading"]',
        ),
      ).toBeTruthy();
      listSubject.next({ kind: 'success', rows: [] });
      listSubject.complete();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="idp-loading"]',
        ),
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Test Connection — DISABLED button
  // ---------------------------------------------------------------------------

  describe('Test Connection CTA (deferred)', () => {
    it('renders the Test button disabled on a connected card', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      const btn = element.querySelector(
        '[data-testid="idp-test-microsoft"]',
      ) as HTMLButtonElement | null;
      expect(btn).toBeTruthy();
      expect(btn?.disabled).toBe(true);
      expect(btn?.getAttribute('title')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Connect flow
  // ---------------------------------------------------------------------------

  describe('Connect flow', () => {
    it('clicking Connect on a disconnected card opens the inline form', async () => {
      const { fixture, element } = await setup();
      (
        element.querySelector(
          '[data-testid="idp-connect-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="idp-connect-form-microsoft"]'),
      ).toBeTruthy();
    });

    it('submitting the form calls idpSvc.upsert with the provider_type derived from the card', async () => {
      const { fixture, component, idpMock } = await setup();
      component.openConnectForm('microsoft');
      fixture.detectChanges();
      // Set form fields via the component API so we don't fight ngModel timing.
      component.updateConnectField('clientId', 'acme');
      component.updateConnectField('clientSecret', 'shhh');
      component.updateConnectField(
        'discoveryUrl',
        'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
      );
      component.submitConnectForm();
      expect(idpMock.upsert).toHaveBeenCalledTimes(1);
      // upsert is typed (IdpProviderUpsertPayload) so calls[0] is the
      // real argument tuple. Non-null assertion is safe after the
      // toHaveBeenCalledTimes(1) above.
      const arg = idpMock.upsert.mock.calls[0]![0];
      expect(arg.provider_type).toBe('oidc');
      expect(arg.client_id).toBe('acme');
      expect(arg.client_secret).toBe('shhh');
      // After success, the form closes + reload fires.
      expect(idpMock.list).toHaveBeenCalledTimes(2);
      expect(component.connectForm()).toBeNull();
    });

    it('on invalid upsert, the form stays open with the error surfaced', async () => {
      const { fixture, component, element } = await setup({
        upsert: { kind: 'invalid', message: 'oidc requires client_id' },
      });
      component.openConnectForm('google');
      fixture.detectChanges();
      component.submitConnectForm();
      fixture.detectChanges();
      expect(component.connectForm()).not.toBeNull();
      expect(
        element.querySelector('[data-testid="idp-connect-error-google"]'),
      ).toBeTruthy();
    });

    it('Singpass card opens a form without the client_id / client_secret inputs', async () => {
      const { fixture, component, element } = await setup();
      component.openConnectForm('singpass');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="idp-connect-client-id-singpass"]'),
      ).toBeNull();
      expect(
        element.querySelector(
          '[data-testid="idp-connect-singpass-enabled-singpass"]',
        ),
      ).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Disconnect flow
  // ---------------------------------------------------------------------------

  describe('Disconnect flow', () => {
    it('clicking Disconnect opens the confirm overlay', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      (
        element.querySelector(
          '[data-testid="idp-disconnect-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector(
          '[data-testid="idp-disconnect-confirm-microsoft"]',
        ),
      ).toBeTruthy();
    });

    it('confirming the overlay calls idpSvc.delete with the provider_type', async () => {
      const { fixture, element, idpMock } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      (
        element.querySelector(
          '[data-testid="idp-disconnect-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="idp-disconnect-confirm-yes-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(idpMock.delete).toHaveBeenCalledWith('oidc');
      // After success, reload fires + overlay closes.
      expect(idpMock.list).toHaveBeenCalledTimes(2);
    });

    it('cancelling the overlay closes it without calling delete', async () => {
      const { fixture, element, idpMock } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      (
        element.querySelector(
          '[data-testid="idp-disconnect-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="idp-disconnect-cancel-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(idpMock.delete).not.toHaveBeenCalled();
      expect(
        element.querySelector(
          '[data-testid="idp-disconnect-confirm-microsoft"]',
        ),
      ).toBeNull();
    });

    it('on 404 not-found, treats as success (reload fires)', async () => {
      const { fixture, element, idpMock } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
        delete: { kind: 'not-found' },
      });
      (
        element.querySelector(
          '[data-testid="idp-disconnect-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="idp-disconnect-confirm-yes-microsoft"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      // Reload fires once on construct + once after the 404-as-success path.
      expect(idpMock.list).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility — buttons keep their names; the list still uses role="list".
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('all interactive buttons have an accessible name', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [sampleOidcRow] },
      });
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria =
          btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        const hasTitle = btn.hasAttribute('title');
        expect(hasText || hasAria || hasTitle).toBe(true);
      }
    });

    it('IdP card list is exposed as a list', async () => {
      const { element } = await setup();
      const list = element.querySelector('[data-testid="idp-list"]');
      expect(list?.getAttribute('role') ?? list?.tagName.toLowerCase()).toMatch(
        /list|ul/,
      );
    });
  });

  // CHO-1808 — the page subtitle alone left admins confused: "I just
  // signed in with Google, why does it say Google DISCONNECTED?" Reason:
  // the page is about TENANT-level workspace SSO; the platform-level
  // Google/Microsoft/Singpass sign-in is configured by Chora and is
  // independent of what's bound here. Add a page-level disclaimer +
  // per-card purpose copy so the distinction is visible at a glance.
  describe('platform-vs-tenant info copy (CHO-1808)', () => {
    it('renders a page-level disclaimer below the subtitle', async () => {
      const { element } = await setup();
      const disclaimer = element.querySelector(
        '[data-testid="idp-page-disclaimer"]',
      );
      expect(disclaimer).toBeTruthy();
      // TranslateService falls back to the key when no bundle is loaded
      // — the disclaimer text must therefore resolve to the i18n key
      // path, NOT inline hardcoded copy.
      expect(disclaimer?.textContent?.trim()).toContain(
        'hplus.idp.pageDisclaimer',
      );
    });

    const CARD_NOTES: ReadonlyArray<{
      id: 'microsoft' | 'google' | 'singpass' | 'saml';
      key: string;
    }> = [
      { id: 'microsoft', key: 'hplus.idp.microsoftNote' },
      { id: 'google', key: 'hplus.idp.googleNote' },
      // Singpass already had `singpassNote` — extended in-place so the
      // existing KYC copy + the platform-distinction line share one key.
      { id: 'singpass', key: 'hplus.idp.singpassNote' },
      { id: 'saml', key: 'hplus.idp.samlNote' },
    ];

    for (const { id, key } of CARD_NOTES) {
      it(`${id} card renders its purpose note from i18n key ${key}`, async () => {
        const { element } = await setup();
        const note = element.querySelector(`[data-testid="idp-${id}-note"]`);
        expect(note).toBeTruthy();
        expect(note?.textContent?.trim()).toBe(key);
      });
    }
  });
});
