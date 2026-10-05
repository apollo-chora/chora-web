import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpParams, HttpResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';

import {
  TransactionHistoryComponent,
  EXPORT_POLL_INTERVAL_MS,
} from './transaction-history.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { TransactionRealtimeService } from './transaction-realtime.service';
import {
  type ExportJob,
  type ListTransactionsResponse,
  type TransactionDetailResponse,
  type TransactionEvent,
  type TransactionLedgerItem,
  type TransactionScope,
  type TransactionSummary,
} from './transaction-history.model';

// ── Fixtures ──────────────────────────────────────────────────────────
const purchaseRow: TransactionLedgerItem = {
  ledger_id: 'led_pur_1',
  occurred_at: '2026-06-20T10:00:00Z',
  tenant_id: 'ten_alpha',
  learner_gcid: 'gcid_1',
  kind: 'purchase',
  source_domain: 'payments',
  source_ref_id: 'pur_1',
  label: 'Course: Intro to X',
  amount: { currency: 'sgd', amount_minor: 4999, mana_units: 0 },
  status: 'captured',
  has_detail: false,
};

const manaDailyRow: TransactionLedgerItem = {
  ledger_id: 'led_mana_1',
  occurred_at: '2026-06-21T00:00:00Z',
  tenant_id: 'ten_alpha',
  learner_gcid: 'gcid_1',
  kind: 'mana_spend_daily',
  source_domain: 'observability',
  source_ref_id: '2026-06-21',
  label: 'Mana spent — 2026-06-21',
  amount: { currency: null, amount_minor: 0, mana_units: -350 },
  status: 'posted',
  has_detail: true,
};

const firstPage: ListTransactionsResponse = {
  items: [purchaseRow, manaDailyRow],
  next_page_token: 'cursor-1',
  has_more: true,
};

const secondPage: ListTransactionsResponse = {
  items: [{ ...purchaseRow, ledger_id: 'led_pur_2' }],
  next_page_token: null,
  has_more: false,
};

const sampleSummary: TransactionSummary = {
  total_count: 2,
  amount_minor_by_currency: { sgd: 4999 },
  total_mana_topped_up: 1000,
  total_mana_spent: 350,
  count_by_kind: { purchase: 1, mana_spend_daily: 1 },
  count_by_status: { captured: 1, posted: 1 },
  window_from: '2026-04-01T00:00:00Z',
  window_to: '2026-06-29T00:00:00Z',
};

const detailResponse: TransactionDetailResponse = {
  parent: manaDailyRow,
  details: [
    {
      detail_id: 'det_1',
      ledger_id: 'led_mana_1',
      tenant_id: 'ten_alpha',
      learner_gcid: 'gcid_1',
      occurred_at: '2026-06-21T09:00:00Z',
      action_code: 'question_generation',
      mana_units: 50,
      model: 'gemini-2.5-flash',
      trace_id: 'tr-1',
    },
  ],
  next_page_token: null,
  has_more: false,
};

function syncBlobResponse(): HttpResponse<Blob> {
  return new HttpResponse({
    status: 200,
    body: new Blob(['csv'], { type: 'text/csv' }),
  });
}

function asyncJobResponse(job: ExportJob): HttpResponse<Blob> {
  return new HttpResponse({
    status: 202,
    body: new Blob([JSON.stringify(job)], { type: 'application/json' }),
  });
}

function makeBff() {
  return {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/summary')) return of(sampleSummary);
      if (path.endsWith('/transactions')) return of(firstPage);
      return of(detailResponse); // detail drill: /transactions/{ledger_id}
    }),
    getBlob: vi
      .fn()
      .mockReturnValue(of(new Blob(['csv'], { type: 'text/csv' }))),
    getBlobResponse: vi.fn().mockReturnValue(of(syncBlobResponse())),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function makeRealtime(stream: Subject<TransactionEvent>) {
  return {
    stream$: stream.asObservable(),
    emit: (e: TransactionEvent) => stream.next(e),
    disconnect: vi.fn(),
  };
}

interface Ctx {
  fixture: ComponentFixture<TransactionHistoryComponent>;
  component: TransactionHistoryComponent;
  element: HTMLElement;
  bff: ReturnType<typeof makeBff>;
  realtime: ReturnType<typeof makeRealtime>;
}

function setup(scope: TransactionScope): Ctx {
  const bff = makeBff();
  const realtime = makeRealtime(new Subject<TransactionEvent>());

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TransactionHistoryComponent],
    providers: [
      { provide: BffClientService, useValue: bff },
      { provide: TransactionRealtimeService, useValue: realtime },
    ],
  });

  const fixture = TestBed.createComponent(TransactionHistoryComponent);
  fixture.componentRef.setInput('scope', scope); // required input before CD
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    bff,
    realtime,
  };
}

describe('TransactionHistoryComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('initial load', () => {
    it('creates with the required scope', () => {
      const ctx = setup('learner');
      expect(ctx.component).toBeTruthy();
      expect(ctx.component.scope()).toBe('learner');
    });

    it('loads the first page + summary on init', () => {
      const ctx = setup('learner');
      // list + summary both go through bff.get
      const paths = ctx.bff.get.mock.calls.map((c) => c[0] as string);
      expect(paths).toContain('/api/v1/me/transactions');
      expect(paths).toContain('/api/v1/me/transactions/summary');
      expect(ctx.component.rows().length).toBe(2);
      expect(ctx.component.summary()).toEqual(sampleSummary);
      expect(ctx.component.hasMore()).toBe(true);
    });

    it('surfaces a translatable error when the list load fails', () => {
      const bff = makeBff();
      bff.get.mockReturnValue(throwError(() => new Error('boom')));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TransactionHistoryComponent],
        providers: [
          { provide: BffClientService, useValue: bff },
          {
            provide: TransactionRealtimeService,
            useValue: makeRealtime(new Subject()),
          },
        ],
      });
      const fixture = TestBed.createComponent(TransactionHistoryComponent);
      fixture.componentRef.setInput('scope', 'learner');
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'transaction_history.error.load',
      );
    });
  });

  describe('scope path derivation', () => {
    it('learner scope reads /api/v1/me/transactions', () => {
      const ctx = setup('learner');
      expect(ctx.bff.get).toHaveBeenCalledWith(
        '/api/v1/me/transactions',
        expect.anything(),
      );
    });

    it('tenant + master scopes read /api/v1/admin/transactions', () => {
      for (const scope of ['tenant', 'master'] as const) {
        const ctx = setup(scope);
        const paths = ctx.bff.get.mock.calls.map((c) => c[0] as string);
        expect(paths).toContain('/api/v1/admin/transactions');
      }
    });
  });

  describe('scope-gated chrome (renders outside the virtual viewport)', () => {
    it('learner: no franchisee filter, no learner-drill filter, no SSE', () => {
      const ctx = setup('learner');
      expect(
        ctx.element.querySelector('[data-testid="filter-franchisee"]'),
      ).toBeFalsy();
      expect(
        ctx.element.querySelector('[data-testid="filter-learner"]'),
      ).toBeFalsy();
      expect(ctx.component.streaming()).toBe(false);
    });

    it('tenant: learner-drill filter present, no franchisee filter, SSE on', () => {
      const ctx = setup('tenant');
      expect(
        ctx.element.querySelector('[data-testid="filter-learner"]'),
      ).toBeTruthy();
      expect(
        ctx.element.querySelector('[data-testid="filter-franchisee"]'),
      ).toBeFalsy();
      expect(ctx.component.showTenantCol()).toBe(false);
      expect(ctx.component.streaming()).toBe(true);
    });

    it('master: franchisee filter + tenant column + SSE on', () => {
      const ctx = setup('master');
      expect(
        ctx.element.querySelector('[data-testid="filter-franchisee"]'),
      ).toBeTruthy();
      expect(ctx.component.showTenantCol()).toBe(true);
      expect(ctx.component.streaming()).toBe(true);
    });

    it('renders the franchisee filter as a name-backed entity picker (no legacy datalist)', () => {
      const ctx = setup('master');
      expect(
        ctx.element.querySelector('[data-testid="filter-franchisee"]'),
      ).toBeTruthy();
      // The old opaque-id <datalist> is gone.
      expect(
        ctx.element.querySelector('[data-testid="tx-franchisee-options"]'),
      ).toBeFalsy();
      expect(
        ctx.element.querySelector('[data-testid="tx-learner-options"]'),
      ).toBeFalsy();
    });
  });

  describe('master-scope learner gate (member endpoint 403s the operator)', () => {
    it('hides the learner picker + shows the hint until one franchisee is picked', () => {
      const ctx = setup('master');
      expect(ctx.component.learnerPickerEnabled()).toBe(false);
      expect(
        ctx.element.querySelector('[data-testid="filter-learner"]'),
      ).toBeFalsy();
      expect(
        ctx.element.querySelector('[data-testid="filter-learner-hint"]'),
      ).toBeTruthy();
    });

    it('enables the learner picker + passes the franchisee facet at exactly one franchisee', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_solo', label: 'Solo Co' });
      ctx.fixture.detectChanges();
      expect(ctx.component.learnerPickerEnabled()).toBe(true);
      expect(ctx.component.learnerFacets()).toEqual({
        managed_tenant_id: 'ten_solo',
      });
      expect(
        ctx.element.querySelector('[data-testid="filter-learner"]'),
      ).toBeTruthy();
      expect(
        ctx.element.querySelector('[data-testid="filter-learner-hint"]'),
      ).toBeFalsy();
    });

    it('re-gates + clears any learner selection when a second franchisee is added', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_1', label: 'One' });
      ctx.component.onLearnerPicked({ id: 'gcid_1', label: 'Uno' });
      expect(ctx.component.filters().learner_gcids).toEqual(['gcid_1']);
      ctx.component.onFranchiseePicked({ id: 'ten_2', label: 'Two' });
      expect(ctx.component.learnerPickerEnabled()).toBe(false);
      expect(ctx.component.learnerChips().length).toBe(0);
      expect(ctx.component.filters().learner_gcids).toBeUndefined();
    });

    it('tenant scope enables the learner picker with no facet (own tenant)', () => {
      const ctx = setup('tenant');
      expect(ctx.component.learnerPickerEnabled()).toBe(true);
      expect(ctx.component.learnerFacets()).toEqual({});
      expect(
        ctx.element.querySelector('[data-testid="filter-learner"]'),
      ).toBeTruthy();
    });
  });

  describe('pagination', () => {
    it('appends rows on loadMore and clears the cursor when exhausted', () => {
      const ctx = setup('learner');
      ctx.bff.get.mockReturnValueOnce(of(secondPage));
      ctx.component.loadMore();
      expect(ctx.component.rows().length).toBe(3);
      expect(ctx.component.hasMore()).toBe(false);
    });

    it('loadMore is a no-op when there is no next cursor', () => {
      const ctx = setup('learner');
      ctx.component.nextCursor.set(null);
      ctx.bff.get.mockClear();
      ctx.component.loadMore();
      expect(ctx.bff.get).not.toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    it('applyFilters re-fetches with merged kind + status params', () => {
      const ctx = setup('learner');
      ctx.component.onKindChange('purchase');
      ctx.component.onStatusChange('captured');
      ctx.bff.get.mockClear();
      ctx.component.applyFilters();
      const listCall = ctx.bff.get.mock.calls.find(
        (c) => (c[0] as string) === '/api/v1/me/transactions',
      );
      const qs = (listCall?.[1] as { toString: () => string }).toString();
      expect(qs).toContain('kind=purchase');
      expect(qs).toContain('status=captured');
    });

    it('master franchisee multi-select forwards REPEATED managed_tenant_id params', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_beta', label: 'Beta Co' });
      ctx.component.onFranchiseePicked({ id: 'ten_gamma', label: 'Gamma Co' });
      ctx.bff.get.mockClear();
      ctx.component.applyFilters();
      const listCall = ctx.bff.get.mock.calls.find(
        (c) => (c[0] as string) === '/api/v1/admin/transactions',
      );
      const params = listCall?.[1] as HttpParams;
      expect(params.getAll('managed_tenant_id')).toEqual([
        'ten_beta',
        'ten_gamma',
      ]);
    });

    it('tenant learner multi-select forwards REPEATED learner_gcid params', () => {
      const ctx = setup('tenant');
      ctx.component.onLearnerPicked({ id: 'gcid_a', label: 'Ann' });
      ctx.component.onLearnerPicked({ id: 'gcid_b', label: 'Ben' });
      ctx.bff.get.mockClear();
      ctx.component.applyFilters();
      const listCall = ctx.bff.get.mock.calls.find(
        (c) => (c[0] as string) === '/api/v1/admin/transactions',
      );
      const params = listCall?.[1] as HttpParams;
      expect(params.getAll('learner_gcid')).toEqual(['gcid_a', 'gcid_b']);
    });

    it('picking then removing keeps chips + the derived id filter in sync', () => {
      const ctx = setup('tenant');
      ctx.component.onLearnerPicked({ id: 'gcid_a', label: 'Ann' });
      expect(ctx.component.learnerChips().map((c) => c.id)).toEqual(['gcid_a']);
      expect(ctx.component.filters().learner_gcids).toEqual(['gcid_a']);
      ctx.component.onLearnerRemoved('gcid_a');
      expect(ctx.component.learnerChips().length).toBe(0);
      expect(ctx.component.filters().learner_gcids).toBeUndefined();
    });

    it('ignores a duplicate pick (same id twice = one chip)', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_x', label: 'X' });
      ctx.component.onFranchiseePicked({ id: 'ten_x', label: 'X' });
      expect(ctx.component.franchiseeChips().length).toBe(1);
    });

    it('clearFilters resets franchisee + learner chips and their id filters', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_x', label: 'X' });
      ctx.component.clearFilters();
      expect(ctx.component.franchiseeChips().length).toBe(0);
      expect(ctx.component.learnerChips().length).toBe(0);
      expect(ctx.component.filters().managed_tenant_ids).toBeUndefined();
      expect(ctx.component.filters().learner_gcids).toBeUndefined();
    });

    it('clearFilters resets to default sort and refetches', () => {
      const ctx = setup('learner');
      ctx.component.onKindChange('purchase');
      ctx.bff.get.mockClear();
      ctx.component.clearFilters();
      expect(ctx.component.filters().kind).toBeUndefined();
      expect(ctx.component.filters().sort).toBe('occurred_at:desc');
      expect(ctx.bff.get).toHaveBeenCalled();
    });
  });

  describe('mana-spend drill-down', () => {
    it('loads detail rows when a has_detail row is toggled open', () => {
      const ctx = setup('learner');
      ctx.component.toggleDetail(manaDailyRow);
      expect(ctx.component.expandedId()).toBe('led_mana_1');
      expect(ctx.component.detailRows().length).toBe(1);
      expect(ctx.component.detailRows()[0].action_code).toBe(
        'question_generation',
      );
    });

    it('collapses when the same row is toggled twice', () => {
      const ctx = setup('learner');
      ctx.component.toggleDetail(manaDailyRow);
      ctx.component.toggleDetail(manaDailyRow);
      expect(ctx.component.expandedId()).toBeNull();
      expect(ctx.component.detailRows().length).toBe(0);
    });

    it('does nothing for a row without detail', () => {
      const ctx = setup('learner');
      ctx.component.toggleDetail(purchaseRow);
      expect(ctx.component.expandedId()).toBeNull();
    });
  });

  describe('SSE live tail (admin scopes)', () => {
    it('updates a visible row in place on upsert', () => {
      const ctx = setup('tenant');
      const evt: TransactionEvent = {
        item: { ...purchaseRow, status: 'refunded' },
        change_type: 'upsert',
      };
      ctx.realtime.emit(evt);
      const row = ctx.component.rows().find((r) => r.ledger_id === 'led_pur_1');
      expect(row?.status).toBe('refunded');
    });

    it('prepends a new matching row (newest-first default)', () => {
      const ctx = setup('tenant');
      const fresh: TransactionLedgerItem = {
        ...purchaseRow,
        ledger_id: 'led_new',
        label: 'Fresh purchase',
      };
      ctx.realtime.emit({ item: fresh, change_type: 'upsert' });
      expect(ctx.component.rows()[0].ledger_id).toBe('led_new');
    });

    it('ignores a new row that does not match the active filter', () => {
      const ctx = setup('tenant');
      ctx.component.onKindChange('mana_topup');
      ctx.component.applyFilters();
      const before = ctx.component.rows().length;
      ctx.realtime.emit({
        item: { ...purchaseRow, ledger_id: 'led_x', kind: 'purchase' },
        change_type: 'upsert',
      });
      expect(ctx.component.rows().length).toBe(before);
    });

    it('ignores a streamed row outside the selected learner set', () => {
      const ctx = setup('tenant');
      ctx.component.onLearnerPicked({ id: 'gcid_1', label: 'Uno' });
      ctx.component.applyFilters();
      const before = ctx.component.rows().length;
      ctx.realtime.emit({
        item: {
          ...purchaseRow,
          ledger_id: 'led_other',
          learner_gcid: 'gcid_other',
        },
        change_type: 'upsert',
      });
      expect(ctx.component.rows().length).toBe(before);
    });

    it('prepends a streamed row inside the selected learner set', () => {
      const ctx = setup('tenant');
      ctx.component.onLearnerPicked({ id: 'gcid_1', label: 'Uno' });
      ctx.component.applyFilters();
      ctx.realtime.emit({
        item: { ...purchaseRow, ledger_id: 'led_in', learner_gcid: 'gcid_1' },
        change_type: 'upsert',
      });
      expect(ctx.component.rows()[0].ledger_id).toBe('led_in');
    });

    it('learner scope never subscribes to the stream', () => {
      const ctx = setup('learner');
      ctx.component.ngOnDestroy();
      expect(ctx.realtime.disconnect).not.toHaveBeenCalled();
    });

    it('admin scope tears down the stream on destroy', () => {
      const ctx = setup('master');
      ctx.component.ngOnDestroy();
      expect(ctx.realtime.disconnect).toHaveBeenCalledOnce();
    });
  });

  describe('export', () => {
    beforeEach(() => {
      // jsdom lacks the object-URL APIs the blob download relies on.
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
      URL.revokeObjectURL = vi.fn();
    });

    it('renders CSV + JSON export buttons', () => {
      const ctx = setup('learner');
      expect(
        ctx.element.querySelector('[data-testid="export-csv"]'),
      ).toBeTruthy();
      expect(
        ctx.element.querySelector('[data-testid="export-json"]'),
      ).toBeTruthy();
    });

    it('downloads synchronously on 200 via authenticated getBlobResponse', () => {
      const ctx = setup('learner');
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      ctx.component.onExport('csv');
      expect(ctx.bff.getBlobResponse).toHaveBeenCalledOnce();
      const [path, params] = ctx.bff.getBlobResponse.mock.calls[0];
      expect(path).toBe('/api/v1/me/transactions/export');
      expect((params as { toString: () => string }).toString()).toContain(
        'format=csv',
      );
      expect(click).toHaveBeenCalled();
      expect(ctx.component.exportInFlight()).toBeNull();
      expect(ctx.component.exportJob()).toBeNull(); // sync → no job banner
      click.mockRestore();
    });

    it('surfaces a translatable error and clears the flag when export fails', () => {
      const ctx = setup('learner');
      ctx.bff.getBlobResponse.mockReturnValueOnce(
        throwError(() => new Error('boom')),
      );
      ctx.component.onExport('json');
      expect(ctx.component.errorKey()).toBe('transaction_history.error.export');
      expect(ctx.component.exportInFlight()).toBeNull();
    });

    it('on 202 tracks the async job and polls until ready (signed link)', async () => {
      vi.useFakeTimers();
      try {
        const ctx = setup('learner');
        const building: ExportJob = {
          job_id: 'job_1',
          status: 'building',
          format: 'csv',
          created_at: '2026-06-29T00:00:00Z',
        };
        const ready: ExportJob = {
          ...building,
          status: 'ready',
          download_url: 'https://storage.example/signed?sig=abc',
          expires_at: '2026-06-29T01:00:00Z',
        };
        ctx.bff.getBlobResponse.mockReturnValueOnce(
          of(asyncJobResponse(building)),
        );
        ctx.bff.get.mockImplementation((path: string) => {
          if (path.includes('/export/jobs/')) return of(ready);
          if (path.endsWith('/summary')) return of(sampleSummary);
          return of(firstPage);
        });

        ctx.component.onExport('csv');
        await vi.advanceTimersByTimeAsync(0); // flush blob.text() → 202 parsed
        expect(ctx.component.exportInFlight()).toBeNull();
        expect(ctx.component.exportJob()?.status).toBe('building');

        await vi.advanceTimersByTimeAsync(EXPORT_POLL_INTERVAL_MS); // poll → ready
        expect(ctx.component.exportJob()?.status).toBe('ready');
        expect(ctx.component.exportJob()?.download_url).toContain('signed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('marks the async job failed when polling errors', async () => {
      vi.useFakeTimers();
      try {
        const ctx = setup('learner');
        const pending: ExportJob = {
          job_id: 'job_2',
          status: 'pending',
          format: 'json',
          created_at: '2026-06-29T00:00:00Z',
        };
        ctx.bff.getBlobResponse.mockReturnValueOnce(
          of(asyncJobResponse(pending)),
        );
        ctx.bff.get.mockImplementation((path: string) => {
          if (path.includes('/export/jobs/')) {
            return throwError(() => new Error('poll-fail'));
          }
          if (path.endsWith('/summary')) return of(sampleSummary);
          return of(firstPage);
        });

        ctx.component.onExport('json');
        await vi.advanceTimersByTimeAsync(0);
        expect(ctx.component.exportJob()?.status).toBe('pending');
        await vi.advanceTimersByTimeAsync(EXPORT_POLL_INTERVAL_MS);
        expect(ctx.component.exportJob()?.status).toBe('failed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('dismissExportJob clears the banner', () => {
      const ctx = setup('learner');
      ctx.component.exportJob.set({
        job_id: 'job_3',
        status: 'ready',
        format: 'csv',
        created_at: '2026-06-29T00:00:00Z',
        download_url: 'https://x/y',
      });
      ctx.component.dismissExportJob();
      expect(ctx.component.exportJob()).toBeNull();
    });
  });

  describe('presentation helpers', () => {
    it('formats fiat vs mana amounts distinctly', () => {
      const ctx = setup('learner');
      expect(ctx.component.formatAmount(purchaseRow)).toBe('SGD 49.99');
      expect(ctx.component.formatAmount(manaDailyRow)).toBe('-350 mana');
    });

    it('maps status to a badge class', () => {
      const ctx = setup('learner');
      expect(ctx.component.statusBadgeClass('captured')).toContain(
        'badge-success',
      );
      expect(ctx.component.statusBadgeClass('refunded')).toContain(
        'badge-warning',
      );
      expect(ctx.component.statusBadgeClass('failed')).toContain('badge-danger');
    });

    it('flattens summary currencies for rendering', () => {
      const ctx = setup('learner');
      expect(ctx.component.summaryCurrencies()).toEqual([
        { code: 'SGD', minor: 4999 },
      ]);
    });

    it('formatMana signs positive credits and leaves negatives', () => {
      const ctx = setup('learner');
      expect(ctx.component.formatMana(1000)).toBe('+1000');
      expect(ctx.component.formatMana(-50)).toBe('-50');
    });

    it('formatManaSpent shows an outflow only when there is spend (never "−0")', () => {
      const ctx = setup('learner');
      expect(ctx.component.formatManaSpent(0)).toBe('0');
      expect(ctx.component.formatManaSpent(350)).toBe('−350');
    });

    it('formatWindowRange renders a compact human range (year once, not raw ISO)', () => {
      const ctx = setup('learner');
      const range = ctx.component.formatWindowRange(
        '2026-04-01T00:00:00Z',
        '2026-06-29T00:00:00Z',
      );
      // Compact range separator, no raw ISO artefacts, and the shared year once.
      expect(range).toContain('–');
      expect(range).not.toContain('T00:00');
      expect(range).not.toContain('Z');
      expect((range.match(/2026/g) ?? []).length).toBe(1);
      // Cross-year ranges show the year on both ends.
      const crossYear = ctx.component.formatWindowRange(
        '2025-12-30T00:00:00Z',
        '2026-01-05T00:00:00Z',
      );
      expect(crossYear).toContain('2025');
      expect(crossYear).toContain('2026');
      // Unparseable bounds fall back to the raw values (fail-visible).
      expect(ctx.component.formatWindowRange('nope', 'also-nope')).toBe('nope – also-nope');
    });

    it('franchisee pick syncs the derived managed_tenant_ids filter', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_alpha', label: 'Alpha Co' });
      expect(ctx.component.franchiseeChips().map((c) => c.id)).toEqual([
        'ten_alpha',
      ]);
      expect(ctx.component.filters().managed_tenant_ids).toEqual([
        'ten_alpha',
      ]);
    });

    it('shortId truncates long ids and passes through short/empty', () => {
      const ctx = setup('learner');
      expect(ctx.component.shortId('')).toBe('');
      expect(ctx.component.shortId(null)).toBe('');
      expect(ctx.component.shortId('abcd')).toBe('abcd');
      expect(ctx.component.shortId('0123456789abcdef')).toBe('01234567…');
    });

    it('derives i18n keys for kind + status', () => {
      const ctx = setup('learner');
      expect(ctx.component.kindLabelKey('mana_topup')).toBe(
        'transaction_history.kind.mana_topup',
      );
      expect(ctx.component.statusLabelKey('posted')).toBe(
        'transaction_history.status.posted',
      );
    });

    it('maps posted + expired statuses to badge classes', () => {
      const ctx = setup('learner');
      expect(ctx.component.statusBadgeClass('posted')).toContain('badge-success');
      expect(ctx.component.statusBadgeClass('expired')).toContain('badge-danger');
    });
  });

  describe('resilience + branches', () => {
    it('summary failure fails quiet (table still loads)', () => {
      const bff = makeBff();
      bff.get.mockImplementation((path: string) => {
        if (path.endsWith('/summary')) return throwError(() => new Error('x'));
        return of(firstPage);
      });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TransactionHistoryComponent],
        providers: [
          { provide: BffClientService, useValue: bff },
          {
            provide: TransactionRealtimeService,
            useValue: makeRealtime(new Subject()),
          },
        ],
      });
      const fixture = TestBed.createComponent(TransactionHistoryComponent);
      fixture.componentRef.setInput('scope', 'learner');
      fixture.detectChanges();
      expect(fixture.componentInstance.summary()).toBeNull();
      expect(fixture.componentInstance.rows().length).toBe(2);
    });

    it('detail failure surfaces a translatable detail error', () => {
      const ctx = setup('learner');
      ctx.bff.get.mockImplementationOnce(() =>
        throwError(() => new Error('x')),
      );
      ctx.component.toggleDetail(manaDailyRow);
      expect(ctx.component.detailErrorKey()).toBe(
        'transaction_history.error.detail',
      );
      expect(ctx.component.detailLoading()).toBe(false);
    });

    it('does not prepend a new row when sort is not newest-first', () => {
      const ctx = setup('tenant');
      ctx.component.onSortChange('amount:desc');
      ctx.component.applyFilters();
      const len = ctx.component.rows().length;
      ctx.realtime.emit({
        item: { ...purchaseRow, ledger_id: 'led_z' },
        change_type: 'upsert',
      });
      expect(ctx.component.rows().length).toBe(len);
    });
  });

  // ── Scope badge (CHO-2296) ──────────────────────────────────────────────
  //
  // Owner hit this twice on prod: at MASTER scope the tenant switcher still
  // reads "Mighty Mind Tuition Agency" while the table legitimately spans
  // every tenant, because resolveScope's master branch never consults the
  // active tenant. Both times it read as a cross-tenant leak. The header must
  // therefore state what is ACTUALLY in view, and it must stay truthful once
  // the operator narrows by franchisee.
  describe('scope badge', () => {
    function badge(ctx: Ctx): HTMLElement | null {
      return ctx.element.querySelector('[data-testid="tx-scope-badge"]');
    }

    // The TestBed loads no translation table, so the pipe emits raw keys.
    // Assert the CONTRACT (which key + which params) rather than the rendered
    // English; the copy itself is pinned in en.json and checked on the live UI.
    it('MASTER with no franchisee filter announces all tenants', () => {
      const ctx = setup('master');
      expect(badge(ctx)).toBeTruthy();
      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.all_tenants',
      );
    });

    it('MASTER narrowed to franchisees announces the narrowed count, not all', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_1', label: 'One' });
      ctx.component.onFranchiseePicked({ id: 'ten_2', label: 'Two' });
      ctx.component.applyFilters();
      ctx.fixture.detectChanges();

      expect(badge(ctx)).toBeTruthy();
      // Must NOT keep claiming "all tenants" once a filter is applied, and the
      // count has to reflect the actual number of selected franchisees.
      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.narrowed',
      );
      expect(ctx.component.scopeBadge()?.params.count).toBe(2);
    });

    it('uses SINGULAR copy for exactly one franchisee', () => {
      // Shipped as "1 selected tenants" and caught on the live UI. The pipe
      // does plain interpolation, so plurality has to be a key choice.
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_1', label: 'One' });
      ctx.component.applyFilters();
      ctx.fixture.detectChanges();

      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.narrowed_one',
      );
    });

    it('MASTER narrowed back to zero franchisees returns to all tenants', () => {
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_1', label: 'One' });
      ctx.component.applyFilters();
      ctx.fixture.detectChanges();
      ctx.component.onFranchiseeRemoved('ten_1');
      ctx.component.applyFilters();
      ctx.fixture.detectChanges();

      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.all_tenants',
      );
    });

    it('does NOT narrow the banner until the filter is APPLIED', () => {
      // Chips sync into `filters` on pick, but the table only reloads on
      // Apply. Announcing "1 selected tenant" over a still-unfiltered table
      // is the same mismatch this banner exists to kill, just reversed.
      const ctx = setup('master');
      ctx.component.onFranchiseePicked({ id: 'ten_1', label: 'One' });
      ctx.fixture.detectChanges();

      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.all_tenants',
      );

      ctx.component.applyFilters();
      ctx.fixture.detectChanges();

      expect(ctx.component.scopeBadge()?.key).toBe(
        'transaction_history.scope_badge.narrowed_one',
      );
    });

    it('TENANT scope shows NO badge (the switcher label is accurate there)', () => {
      const ctx = setup('tenant');
      expect(badge(ctx)).toBeNull();
    });

    it('LEARNER scope shows NO badge', () => {
      const ctx = setup('learner');
      expect(badge(ctx)).toBeNull();
    });

    it('is announced to assistive tech, not colour-only', () => {
      const ctx = setup('master');
      const el = badge(ctx)!;
      // A status role makes the scope audible to a screen reader; without it
      // the warning is purely visual.
      expect(el.getAttribute('role')).toBe('status');
    });
  });

});
