import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { TransactionsComponent } from './transactions.component';
import { TransactionHistoryComponent } from '../../../../shared/components/transaction-history/transaction-history.component';
import { TransactionRealtimeService } from '../../../../shared/components/transaction-history/transaction-realtime.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { AuthService, type AuthUser } from '../../../../core/auth/auth.service';
import { TranslateService } from '../../../../core/services/translate.service';

const tenantAdmin: AuthUser = {
  gcid: 'g-admin',
  tenantId: 't1',
  roles: ['TENANT_ADMIN'],
  capabilities: ['tenant:view_payments'],
  displayName: 'Mr. Chen',
  email: 'chen@mtm.sg',
};

const operator: AuthUser = {
  gcid: 'g-ops',
  tenantId: 't1',
  roles: ['PLATFORM_OPERATOR'],
  capabilities: ['tenant:view_payments'],
  displayName: 'Ops',
  email: 'ops@chora.app',
};

const auditor: AuthUser = {
  gcid: 'g-aud',
  tenantId: 't1',
  roles: ['AUDITOR'],
  capabilities: ['tenant:view_payments'],
  displayName: 'Aud',
  email: 'aud@chora.app',
};

const emptySummary = {
  total_count: 0,
  amount_minor_by_currency: {},
  total_mana_topped_up: 0,
  total_mana_spent: 0,
  count_by_kind: {},
  count_by_status: {},
  window_from: '2026-04-01T00:00:00Z',
  window_to: '2026-06-29T00:00:00Z',
};

function makeBff() {
  return {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/summary')) return of(emptySummary);
      return of({ items: [], next_page_token: null, has_more: false });
    }),
    getBlob: vi.fn().mockReturnValue(of(new Blob())),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function setup(user: AuthUser | null) {
  const bff = makeBff();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TransactionsComponent],
    providers: [
      { provide: BffClientService, useValue: bff },
      { provide: AuthService, useValue: { user: signal<AuthUser | null>(user) } },
      {
        provide: TransactionRealtimeService,
        useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
      },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  const fixture = TestBed.createComponent(TransactionsComponent);
  fixture.detectChanges();
  return { fixture, bff };
}

function childScope(
  fixture: ReturnType<typeof setup>['fixture'],
): string | undefined {
  const de = fixture.debugElement.query(
    By.directive(TransactionHistoryComponent),
  );
  return (de?.componentInstance as TransactionHistoryComponent | undefined)?.scope();
}

describe('H+ TransactionsComponent (scope-parameterized rewire)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the hero + embeds the shared transaction-history', () => {
    const { fixture } = setup(tenantAdmin);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="hplus-transactions"]')).toBeTruthy();
    expect(el.querySelector('.transactions__title')?.textContent).toContain(
      'hplus.transaction_history.title',
    );
    expect(
      fixture.debugElement.query(By.directive(TransactionHistoryComponent)),
    ).toBeTruthy();
  });

  it('maps PLATFORM_OPERATOR → master scope', () => {
    const { fixture } = setup(operator);
    expect(fixture.componentInstance.scope()).toBe('master');
    expect(childScope(fixture)).toBe('master');
  });

  it('maps TENANT_ADMIN → tenant scope', () => {
    const { fixture } = setup(tenantAdmin);
    expect(fixture.componentInstance.scope()).toBe('tenant');
    expect(childScope(fixture)).toBe('tenant');
  });

  it('maps AUDITOR (non-operator) → tenant scope', () => {
    const { fixture } = setup(auditor);
    expect(fixture.componentInstance.scope()).toBe('tenant');
  });

  it('treats the operator role case-insensitively', () => {
    const { fixture } = setup({ ...operator, roles: ['platform_operator'] });
    expect(fixture.componentInstance.scope()).toBe('master');
  });

  it('defaults to tenant scope when there is no user / no roles', () => {
    expect(setup(null).fixture.componentInstance.scope()).toBe('tenant');
    expect(
      setup({ ...tenantAdmin, roles: [] }).fixture.componentInstance.scope(),
    ).toBe('tenant');
  });

  it('loads from the admin transactions surface (never /me) on init', () => {
    const { bff } = setup(operator);
    const paths = bff.get.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(paths.some((p) => p.includes('/api/v1/admin/transactions'))).toBe(
      true,
    );
    expect(paths.some((p) => p.includes('/api/v1/me/'))).toBe(false);
  });
});
