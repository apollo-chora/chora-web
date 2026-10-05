/**
 * TransactionHistory — shared, scope-parameterized unified transaction
 * timeline (ADR-205 / CHO-1943). ONE component, THREE scopes:
 *   - learner (A+ `/a/transactions`) — own payments + mana, merged.
 *   - tenant  (H+ `/h/transactions`) — own tenant, all members.
 *   - master  (H+, PLATFORM_OPERATOR) — cross-franchisee span-all +
 *     franchisee selector.
 *
 * Extracted/generalised from the H+ payments-admin transactions table. The
 * mounting surface passes the explicit `scope` (it owns the role decision —
 * e.g. H+ computes master vs tenant from PLATFORM_OPERATOR); this component
 * never infers scope from roles (ADR-205 D1). Read-only: refunds stay on the
 * payments-admin path until cutover (Wave D).
 *
 * Volume strategy (ADR-205 D5): cursor pagination + CDK virtual scroll +
 * summary-first KPIs + per-day mana rollups with per-call drill-down. Async
 * export (202 job) UX lands in C4 (CHO-1946); C1 ships the sync blob export.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { ChoraEntityPickerComponent } from '../chora-entity-picker/entity-picker.component';
import {
  type EntityFacets,
  type EntityRef,
} from '../chora-entity-picker/entity-picker.model';
import { FranchiseeEntitySearchPort } from './adapters/franchisee-entity-search.port';
import { MemberEntitySearchPort } from './adapters/member-entity-search.port';
import { TransactionHistoryService } from './transaction-history.service';
import { TransactionRealtimeService } from './transaction-realtime.service';
import {
  type ExportJob,
  type TransactionDetailItem,
  type TransactionEvent,
  type TransactionFilters,
  type TransactionKind,
  type TransactionLedgerItem,
  type TransactionScope,
  type TransactionSort,
  type TransactionStatus,
  type TransactionSummary,
} from './transaction-history.model';

const KIND_OPTIONS: readonly TransactionKind[] = [
  'purchase',
  'mana_topup',
  'mana_spend_daily',
];

const STATUS_OPTIONS: readonly TransactionStatus[] = [
  'captured',
  'refunded',
  'failed',
  'expired',
  'posted',
];

const SORT_OPTIONS: readonly TransactionSort[] = [
  'occurred_at:desc',
  'occurred_at:asc',
  'amount:desc',
  'amount:asc',
];

/** Fixed row height (px) for the CDK virtual-scroll viewport. */
export const TX_ROW_SIZE = 56;

/** Async-export job poll cadence: every 2.5s, up to ~24 attempts (~60s). */
export const EXPORT_POLL_INTERVAL_MS = 2_500;
export const EXPORT_POLL_MAX_ATTEMPTS = 24;

@Component({
  selector: 'chora-transaction-history',
  standalone: true,
  imports: [TranslatePipe, ScrollingModule, DatePipe, ChoraEntityPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transaction-history.component.html',
  styleUrl: './transaction-history.component.scss',
})
export class TransactionHistoryComponent implements OnInit, OnDestroy {
  private readonly service = inject(TransactionHistoryService);
  private readonly realtime = inject(TransactionRealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  // Real EntitySearchPort adapters fed to the two chips-multiselect pickers via
  // `[searchPortOverride]` (bypassing the global ENTITY_SEARCH_PORTS registry).
  readonly franchiseePort = inject(FranchiseeEntitySearchPort);
  readonly memberPort = inject(MemberEntitySearchPort);

  /** REQUIRED — the explicit ADR-205 scope set by the mounting surface. */
  readonly scope = input.required<TransactionScope>();

  // ── Static option lists for the filter bar ────────────────────────
  readonly kindOptions = KIND_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;
  readonly sortOptions = SORT_OPTIONS;
  readonly rowSize = TX_ROW_SIZE;

  // ── List state ────────────────────────────────────────────────────
  readonly rows = signal<TransactionLedgerItem[]>([]);
  readonly filters = signal<TransactionFilters>({ sort: 'occurred_at:desc' });
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly streaming = signal(false);
  readonly exportInFlight = signal<'csv' | 'json' | null>(null);
  /** Active async-export job (202 path); null when none / dismissed. */
  readonly exportJob = signal<ExportJob | null>(null);
  readonly errorKey = signal<string | null>(null);

  // ── Summary state ─────────────────────────────────────────────────
  readonly summary = signal<TransactionSummary | null>(null);
  readonly summaryLoading = signal(false);

  /** Net fiat KPIs flattened to a stable, render-friendly list. */
  readonly summaryCurrencies = computed<readonly { code: string; minor: number }[]>(
    () => {
      const s = this.summary();
      if (!s) return [];
      return Object.entries(s.amount_minor_by_currency).map(([code, minor]) => ({
        code: code.toUpperCase(),
        minor,
      }));
    },
  );

  // ── Drill-down (mana_spend_daily → per-call detail) ───────────────
  readonly expandedId = signal<string | null>(null);
  readonly detailRows = signal<TransactionDetailItem[]>([]);
  readonly detailLoading = signal(false);
  readonly detailErrorKey = signal<string | null>(null);

  private streamSubscribed = false;
  private exportPollTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  // ── Scope-derived UI gates ────────────────────────────────────────
  readonly isLearner = computed(() => this.scope() === 'learner');
  readonly isMaster = computed(() => this.scope() === 'master');
  readonly isAdmin = computed(() => this.scope() !== 'learner');
  /** Cross-franchisee tenant column shows only at master scope. */
  readonly showTenantCol = computed(() => this.isMaster());
  /** SSE live tail is an admin-surface affordance only. */
  readonly canStream = computed(() => this.isAdmin());

  readonly hasMore = computed(() => this.nextCursor() !== null);
  readonly isEmpty = computed(
    () => !this.loading() && this.rows().length === 0,
  );

  // ── Name-backed multi-select filters (CHO-1930 / ADR-205) ─────────
  // The franchisee/learner filters are now real name-backed chips-multiselects
  // (chora-entity-picker variant='multi') fed by the MemberEntitySearchPort /
  // FranchiseeEntitySearchPort adapters — an operator picks franchisees + a
  // tenant admin picks learners BY NAME (over a live BFF search) instead of
  // pasting opaque UUID/GCIDs. The chip signals are the UI source of truth;
  // each pick/remove syncs the derived id array into `filters`.
  /** Selected franchisee chips (MASTER scope only). */
  readonly franchiseeChips = signal<EntityRef[]>([]);
  /** Selected learner chips (TENANT / MASTER scope). */
  readonly learnerChips = signal<EntityRef[]>([]);

  /**
   * Franchisee narrowing in force on the rows CURRENTLY loaded, snapshotted at
   * each first-page load. Distinct from `franchiseeChips()`, which is the
   * pending selection until Apply is pressed.
   */
  private readonly appliedFranchiseeCount = signal(0);

  /**
   * Scope banner (CHO-2296). At MASTER scope the table spans EVERY tenant
   * while the shell's tenant switcher still names one tenant, because
   * resolveScope's master branch binds the RLS sentinel and never consults the
   * active tenant (ADR-165). That mismatch was reported twice on prod as a
   * cross-tenant leak, so the header has to say what is actually in view.
   *
   * Null at TENANT / LEARNER scope: there the switcher label IS the scope, and
   * a redundant banner would just add noise.
   *
   * Stays truthful when the operator narrows by franchisee. Claiming "all
   * tenants" over a filtered table would be the same class of lie in reverse.
   */
  readonly scopeBadge = computed<{ key: string; params: { count: number } } | null>(() => {
    if (!this.isMaster()) return null;
    const narrowed = this.appliedFranchiseeCount();
    if (narrowed === 0) {
      return { key: 'transaction_history.scope_badge.all_tenants', params: { count: 0 } };
    }
    // The translate pipe does plain interpolation, not ICU, so plurality is a
    // key choice. Shipped once as "1 selected tenants" and caught on the live
    // UI, which a key-level unit assertion alone would never have surfaced.
    const key =
      narrowed === 1
        ? 'transaction_history.scope_badge.narrowed_one'
        : 'transaction_history.scope_badge.narrowed';
    return { key, params: { count: narrowed } };
  });

  /**
   * MASTER-scope learner caveat: the member endpoint 403s PLATFORM_OPERATOR and
   * cannot target another franchisee, so master-scope learner-by-name only works
   * once EXACTLY ONE franchisee is selected (then the search is facet-scoped to
   * that franchisee). TENANT scope searches the caller's own tenant freely.
   */
  readonly learnerPickerEnabled = computed(() => {
    if (this.scope() === 'tenant') return true;
    if (this.scope() === 'master') return this.franchiseeChips().length === 1;
    return false; // learner scope has no learner picker
  });

  /**
   * Facets forwarded to the member port. At MASTER scope with exactly one
   * franchisee selected, scope the roster to that franchisee. Empty at TENANT
   * scope (the caller's own tenant is implicit server-side).
   *
   * The BE side of this LANDED in CHO-2000: the gateway skips `requireTenant`
   * for an operator carrying `?managed_tenant_id=`, and chora-identity is the
   * authority (operator gate + fail-closed IMDA-D1 audit). The previous
   * "once the BE supports…" note here outlived its hold and read as a live
   * limitation — a search returning nothing looked unimplemented when it was
   * simply a tenant with no learners.
   */
  readonly learnerFacets = computed<EntityFacets>((): EntityFacets => {
    const chips = this.franchiseeChips();
    if (this.isMaster() && chips.length === 1) {
      return { managed_tenant_id: chips[0].id };
    }
    return {};
  });

  ngOnInit(): void {
    this.loadFirstPage();
    this.loadSummary();
    if (this.canStream()) this.subscribeStream();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.exportPollTimer);
    if (this.streamSubscribed) {
      this.realtime.disconnect();
      this.streaming.set(false);
    }
  }

  // ── Filter handlers ───────────────────────────────────────────────
  onKindChange(value: string): void {
    this.filters.set({
      ...this.filters(),
      kind: (value || '') as TransactionKind | '',
    });
  }

  onStatusChange(value: string): void {
    this.filters.set({
      ...this.filters(),
      status: (value || 'all') as TransactionStatus | 'all',
    });
  }

  onFromChange(value: string): void {
    this.filters.set({ ...this.filters(), from: value || undefined });
  }

  onToChange(value: string): void {
    this.filters.set({ ...this.filters(), to: value || undefined });
  }

  onSortChange(value: string): void {
    this.filters.set({
      ...this.filters(),
      sort: (value || 'occurred_at:desc') as TransactionSort,
    });
  }

  // ── Franchisee multi-select (MASTER) ──────────────────────────────
  onFranchiseePicked(ref: EntityRef): void {
    if (this.franchiseeChips().some((c) => c.id === ref.id)) return;
    this.franchiseeChips.update((chips) => [...chips, ref]);
    this.syncFranchiseeFilter();
  }

  onFranchiseeRemoved(id: string): void {
    this.franchiseeChips.update((chips) => chips.filter((c) => c.id !== id));
    this.syncFranchiseeFilter();
  }

  private syncFranchiseeFilter(): void {
    const ids = this.franchiseeChips().map((c) => c.id);
    this.filters.set({
      ...this.filters(),
      managed_tenant_ids: ids.length ? ids : undefined,
    });
    // Master-scope learner search is only valid under exactly one franchisee;
    // when the gate closes (0 or >1 selected), drop any learner selection so no
    // hidden learner filter lingers behind the "pick a franchisee first" hint.
    if (this.scope() === 'master' && this.franchiseeChips().length !== 1) {
      this.clearLearnerSelection();
    }
  }

  // ── Learner multi-select (TENANT / MASTER) ────────────────────────
  onLearnerPicked(ref: EntityRef): void {
    if (this.learnerChips().some((c) => c.id === ref.id)) return;
    this.learnerChips.update((chips) => [...chips, ref]);
    this.syncLearnerFilter();
  }

  onLearnerRemoved(id: string): void {
    this.learnerChips.update((chips) => chips.filter((c) => c.id !== id));
    this.syncLearnerFilter();
  }

  private syncLearnerFilter(): void {
    const ids = this.learnerChips().map((c) => c.id);
    this.filters.set({
      ...this.filters(),
      learner_gcids: ids.length ? ids : undefined,
    });
  }

  private clearLearnerSelection(): void {
    if (this.learnerChips().length === 0 && !this.filters().learner_gcids) {
      return;
    }
    this.learnerChips.set([]);
    this.filters.set({ ...this.filters(), learner_gcids: undefined });
  }

  applyFilters(): void {
    this.collapseDetail();
    this.rows.set([]);
    this.nextCursor.set(null);
    this.loadFirstPage();
    this.loadSummary();
  }

  clearFilters(): void {
    this.franchiseeChips.set([]);
    this.learnerChips.set([]);
    this.filters.set({ sort: 'occurred_at:desc' });
    this.applyFilters();
  }

  // ── Load + paginate ───────────────────────────────────────────────
  loadMore(): void {
    if (!this.hasMore() || this.loading()) return;
    this.loadPage();
  }

  private loadFirstPage(): void {
    this.nextCursor.set(null);
    this.rows.set([]);
    // Snapshot the franchisee narrowing that this load actually goes out with.
    // The scope banner reads THIS, not the chip signal: chips sync into
    // `filters` on pick but the table only reloads here, so describing pending
    // chips would announce a narrowing the visible rows do not have.
    this.appliedFranchiseeCount.set(this.filters().managed_tenant_ids?.length ?? 0);
    this.loadPage();
  }

  private loadPage(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.service
      .list(this.scope(), this.filters(), this.nextCursor())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.rows.update((existing) => [...existing, ...response.items]);
          this.nextCursor.set(response.next_page_token ?? null);
          this.loading.set(false);
        },
        error: () => {
          this.errorKey.set('transaction_history.error.load');
          this.loading.set(false);
        },
      });
  }

  private loadSummary(): void {
    this.summaryLoading.set(true);
    this.service
      .summary(this.scope(), this.filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.summaryLoading.set(false);
        },
        error: () => {
          // Summary is non-critical chrome; fail quiet (table still loads).
          this.summary.set(null);
          this.summaryLoading.set(false);
        },
      });
  }

  // ── Drill-down ────────────────────────────────────────────────────
  toggleDetail(row: TransactionLedgerItem): void {
    if (!row.has_detail) return;
    if (this.expandedId() === row.ledger_id) {
      this.collapseDetail();
      return;
    }
    this.expandedId.set(row.ledger_id);
    this.detailRows.set([]);
    this.detailErrorKey.set(null);
    this.detailLoading.set(true);
    // Master drill resolves the RLS tenant GUC from the ROW's own tenant (a row
    // belongs to exactly one franchisee) rather than the multi-franchisee
    // filter set — always the correct single tenant for this ledger's detail.
    this.service
      .detail(this.scope(), row.ledger_id, null, row.tenant_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.detailRows.set([...response.details]);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailErrorKey.set('transaction_history.error.detail');
          this.detailLoading.set(false);
        },
      });
  }

  collapseDetail(): void {
    this.expandedId.set(null);
    this.detailRows.set([]);
    this.detailLoading.set(false);
    this.detailErrorKey.set(null);
  }

  // ── Export (CSV / NDJSON download) ────────────────────────────────
  //
  // MUST go through BffClientService.getBlob so authInterceptor attaches the
  // in-memory Bearer token — a raw <a href>/window.open bypasses it and the
  // gateway rejects with 401 (ADR-205 D6). We pull the Blob, then synthesise
  // a download from an object URL.
  onExport(format: 'csv' | 'json'): void {
    if (this.exportInFlight() !== null) return;
    this.exportInFlight.set(format);
    this.errorKey.set(null);
    this.clearExportJob();
    this.service
      .export(this.scope(), this.filters(), format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.exportInFlight.set(null);
          if (result.kind === 'sync') {
            this.downloadBlob(result.blob, format);
            return;
          }
          // Large set — the server accepted an async job (ADR-205 D5.6).
          // Track it and poll until the signed link is ready.
          this.exportJob.set(result.job);
          this.beginExportPoll(result.job);
        },
        error: () => {
          this.errorKey.set('transaction_history.error.export');
          this.exportInFlight.set(null);
        },
      });
  }

  // ── Async export job polling (202 → ready / failed) ────────────────
  private beginExportPoll(job: ExportJob): void {
    if (this.isTerminalJob(job)) return; // already ready/failed: template renders it
    this.scheduleExportPoll(job.job_id, 0);
  }

  private scheduleExportPoll(jobId: string, attempt: number): void {
    this.exportPollTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.service
        .exportJobStatus(this.scope(), jobId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (job) => {
            this.exportJob.set(job);
            if (this.isTerminalJob(job)) return; // ready/failed: stop polling
            if (attempt + 1 >= EXPORT_POLL_MAX_ATTEMPTS) {
              // Give up waiting so the user isn't pinned to a spinner; the job
              // may still finish server-side (the banner can be re-opened by
              // re-exporting).
              this.exportJob.update((j) =>
                j ? { ...j, status: 'failed' } : j,
              );
              return;
            }
            this.scheduleExportPoll(jobId, attempt + 1);
          },
          error: () => {
            this.exportJob.update((j) => (j ? { ...j, status: 'failed' } : j));
          },
        });
    }, EXPORT_POLL_INTERVAL_MS);
  }

  private isTerminalJob(job: ExportJob): boolean {
    return job.status === 'ready' || job.status === 'failed';
  }

  /** Dismiss the export-job banner (user ack of ready / failed). */
  dismissExportJob(): void {
    this.clearExportJob();
  }

  private clearExportJob(): void {
    clearTimeout(this.exportPollTimer);
    this.exportJob.set(null);
  }

  private downloadBlob(blob: Blob, format: 'csv' | 'json'): void {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:T]/g, '');
      a.download = `transactions-export-${stamp}.${format === 'csv' ? 'csv' : 'ndjson'}`;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ── SSE live tail ─────────────────────────────────────────────────
  private subscribeStream(): void {
    this.streamSubscribed = true;
    this.streaming.set(true);
    this.realtime.stream$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => this.applyStreamEvent(event),
        error: () => this.streaming.set(false),
      });
  }

  private applyStreamEvent(event: TransactionEvent): void {
    const incoming = event.item;
    if (!incoming?.ledger_id) return;
    const present = this.rows().some((r) => r.ledger_id === incoming.ledger_id);
    if (present) {
      // Update the row in place (status/amount may have changed).
      this.rows.update((rows) =>
        rows.map((r) => (r.ledger_id === incoming.ledger_id ? incoming : r)),
      );
      return;
    }
    // A brand-new row — prepend only if it matches the active filter and the
    // default newest-first ordering (so we don't break sort/filter contracts).
    if (this.matchesActiveFilter(incoming) && this.isNewestFirst()) {
      this.rows.update((rows) => [incoming, ...rows]);
    }
  }

  private isNewestFirst(): boolean {
    const sort = this.filters().sort ?? 'occurred_at:desc';
    return sort === 'occurred_at:desc';
  }

  private matchesActiveFilter(item: TransactionLedgerItem): boolean {
    const f = this.filters();
    if (f.kind && item.kind !== f.kind) return false;
    if (f.status && f.status !== 'all' && item.status !== f.status) {
      return false;
    }
    // A live row must fall inside the selected franchisee / learner SETS (when
    // any are active) — otherwise a streamed row for a non-selected franchisee /
    // learner would wrongly prepend into a narrowed view.
    if (
      f.managed_tenant_ids?.length &&
      !f.managed_tenant_ids.includes(item.tenant_id)
    ) {
      return false;
    }
    if (f.learner_gcids?.length) {
      const gcid = item.learner_gcid;
      if (!gcid || !f.learner_gcids.includes(gcid)) return false;
    }
    return true;
  }

  // ── Template helpers ──────────────────────────────────────────────
  trackByLedgerId(_index: number, item: TransactionLedgerItem): string {
    return item.ledger_id;
  }

  trackByDetailId(_index: number, item: TransactionDetailItem): string {
    return item.detail_id;
  }

  /** Fiat rows render "CUR X.XX"; mana rows render signed "±N mana". */
  formatAmount(item: TransactionLedgerItem): string {
    const a = item.amount;
    if (a.currency) {
      const upper = a.currency.toUpperCase();
      return `${upper} ${(a.amount_minor / 100).toFixed(2)}`;
    }
    const sign = a.mana_units > 0 ? '+' : '';
    return `${sign}${a.mana_units} mana`;
  }

  formatMana(units: number): string {
    const sign = units > 0 ? '+' : '';
    return `${sign}${units}`;
  }

  /**
   * Mana spent renders as an outflow (leading U+2212 minus) ONLY when there is
   * spend; zero spend is a plain "0", never a confusing "−0".
   */
  formatManaSpent(units: number): string {
    return units > 0 ? `−${units}` : '0';
  }

  /**
   * Render the summary window as a compact, human date range — e.g.
   * "Jun 24 – Jul 1, 2026" (year shown once when both ends share it). Locale-
   * aware via Intl; falls back to the raw bounds if either is unparseable.
   */
  formatWindowRange(from: string, to: string): string {
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) {
      return `${from} – ${to}`;
    }
    const md: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const sameYear = f.getFullYear() === t.getFullYear();
    const fromStr = f.toLocaleDateString(undefined, sameYear ? md : { ...md, year: 'numeric' });
    const toStr = t.toLocaleDateString(undefined, { ...md, year: 'numeric' });
    return `${fromStr} – ${toStr}`;
  }

  kindLabelKey(k: TransactionKind): string {
    return `transaction_history.kind.${k}`;
  }

  statusLabelKey(s: TransactionStatus): string {
    return `transaction_history.status.${s}`;
  }

  statusBadgeClass(s: TransactionStatus): string {
    switch (s) {
      case 'captured':
      case 'posted':
        return 'badge badge-success';
      case 'refunded':
        return 'badge badge-warning';
      case 'failed':
      case 'expired':
        return 'badge badge-danger';
    }
  }

  shortId(id: string | null | undefined, len = 8): string {
    if (!id) return '';
    return id.length <= len ? id : `${id.slice(0, len)}…`;
  }
}
