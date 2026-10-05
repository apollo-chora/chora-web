import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FeatureFlagService } from './feature-flag.service';
import type { TenantEntitlement } from './feature-flags.model';

function buildEntitlement(overrides: Partial<TenantEntitlement> = {}): TenantEntitlement {
  return {
    id: 'a7e00001-0000-7000-8000-000000000001',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    addon_id: 'a7d00001-0000-7000-8000-000000000001',
    status: 'active',
    monthly_price_cents_snapshot: 4900,
    activated_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    ...overrides,
  };
}

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FeatureFlagService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Legacy code-keyed API (back-compat for `isEnabled(code)`) ──────────
  describe('isEnabled(code) — legacy human-code lookup', () => {
    it('returns false for unset flags', () => {
      expect(service.isEnabled('choraverse')).toBe(false);
    });

    it('returns true for enabled flags', () => {
      service.setFlags({ choraverse: true, familiar: false });

      expect(service.isEnabled('choraverse')).toBe(true);
      expect(service.isEnabled('familiar')).toBe(false);
      expect(service.isEnabled('unknown')).toBe(false);
    });

    it('replaces all flags on setFlags', () => {
      service.setFlags({ a: true, b: true });
      service.setFlags({ c: true });

      expect(service.isEnabled('a')).toBe(false);
      expect(service.isEnabled('c')).toBe(true);
    });

    it('returns false for codes when loaded entitlements carry no addon_code (legacy rows)', () => {
      // Pre-cutover / legacy rows: `addon_code` absent from the DTO — the
      // human-code API cannot resolve them and stays fail-closed.
      service.setEntitlements([buildEntitlement({ status: 'active' })]);
      expect(service.isEnabled('knowledge_graph')).toBe(false);
    });
  });

  // ── addon_code bridge (auth-hardening Phase A §4.7b, CHO-1717) ─────────
  describe('isEnabled(code) — entitlement addon_code bridge', () => {
    it('returns true when an ACTIVE entitlement addon_code matches', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
      ]);
      expect(service.isEnabled('cplus_social')).toBe(true);
    });

    it('returns false when the matching entitlement is not active', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'cancelled' }),
      ]);
      expect(service.isEnabled('cplus_social')).toBe(false);
    });

    it('returns false for an unrelated code', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
      ]);
      expect(service.isEnabled('knowledge_graph')).toBe(false);
    });

    it('never matches legacy rows with an EMPTY addon_code', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: '', status: 'active' }),
      ]);
      expect(service.isEnabled('')).toBe(false);
      expect(service.isEnabled('cplus_social')).toBe(false);
    });

    it('keeps the legacy flags-map check OR-ed in (flag true, no entitlement)', () => {
      service.setFlags({ cplus_social: true });
      service.setEntitlements([]);
      expect(service.isEnabled('cplus_social')).toBe(true);
    });

    it('entitlement bridge works when the flags map disables the same code', () => {
      // OR semantics: either source enables; the flags map's explicit
      // `false` does not veto an active entitlement.
      service.setFlags({ cplus_social: false });
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
      ]);
      expect(service.isEnabled('cplus_social')).toBe(true);
    });

    it('comparison is exact (case-sensitive snake_case codes)', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
      ]);
      expect(service.isEnabled('CPLUS_SOCIAL')).toBe(false);
    });
  });

  // ── New typed entitlements API (post-A7 wiring) ────────────────────────
  describe('entitlements / hasEntitlement(addonId) — UUID lookup', () => {
    it('exposes an empty entitlements signal by default', () => {
      expect(service.entitlements()).toEqual([]);
      expect(service.activeEntitlements()).toEqual([]);
    });

    it('replaces the entitlement set on setEntitlements()', () => {
      const a = buildEntitlement({ addon_id: 'aaa', status: 'active' });
      const b = buildEntitlement({
        id: 'a7e00002-0000-7000-8000-000000000002',
        addon_id: 'bbb',
        status: 'active',
      });
      service.setEntitlements([a, b]);
      expect(service.entitlements().length).toBe(2);
      expect(service.entitlements()[0].addon_id).toBe('aaa');

      service.setEntitlements([a]);
      expect(service.entitlements().length).toBe(1);
    });

    it('filters non-active entitlements out of activeEntitlements', () => {
      service.setEntitlements([
        buildEntitlement({ addon_id: 'aaa', status: 'active' }),
        buildEntitlement({
          id: 'a7e00002-0000-7000-8000-000000000002',
          addon_id: 'bbb',
          status: 'cancelled',
        }),
        buildEntitlement({
          id: 'a7e00003-0000-7000-8000-000000000003',
          addon_id: 'ccc',
          status: 'pending',
        }),
      ]);
      expect(service.activeEntitlements().length).toBe(1);
      expect(service.activeEntitlements()[0].addon_id).toBe('aaa');
    });

    it('hasEntitlement(addonId) returns true only for active addon_ids', () => {
      service.setEntitlements([
        buildEntitlement({ addon_id: 'kg-uuid', status: 'active' }),
        buildEntitlement({
          id: 'a7e00002-0000-7000-8000-000000000002',
          addon_id: 'cv-uuid',
          status: 'cancelled',
        }),
      ]);
      expect(service.hasEntitlement('kg-uuid')).toBe(true);
      expect(service.hasEntitlement('cv-uuid')).toBe(false);
      expect(service.hasEntitlement('unknown-uuid')).toBe(false);
    });
  });
  // ── clear(): sign-out drops the tenant's entitlements ─────────────────
  //
  // Without this the next session on a SHARED browser inherits the previous
  // tenant's add-on gates until `GET /api/feature-flags` returns: a
  // cross-tenant entitlement leak, and every add-on surface renders as
  // entitled in that window.
  describe('clear(): the set a signed-out session leaves behind', () => {
    it('drops every entitlement', () => {
      service.setEntitlements([
        buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
      ]);
      expect(service.hasEntitlement('a7d00001-0000-7000-8000-000000000001')).toBe(true);

      service.clear();

      expect(service.entitlements()).toEqual([]);
      expect(service.activeEntitlements()).toEqual([]);
      expect(service.hasEntitlement('a7d00001-0000-7000-8000-000000000001')).toBe(false);
      expect(service.isEnabled('cplus_social')).toBe(false);
    });

    it('drops the legacy code-keyed flag map too', () => {
      service.setFlags({ knowledge_graph: true });
      expect(service.isEnabled('knowledge_graph')).toBe(true);

      service.clear();

      expect(service.isEnabled('knowledge_graph')).toBe(false);
    });

    // The gate must go back to UNRESOLVED, not stay latched at `true` from the
    // previous tenant's load. A latched gate lets the next session's add-on
    // guard decide on an empty set before that tenant's flags arrive.
    it('re-arms the loaded gate so the next session waits for its own flags', async () => {
      service.setEntitlements([buildEntitlement()]);

      service.clear();

      let resolved = false;
      service.whenLoaded$.subscribe(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);

      service.markLoaded();
      await Promise.resolve();
      expect(resolved).toBe(true);
    });
  });
});
