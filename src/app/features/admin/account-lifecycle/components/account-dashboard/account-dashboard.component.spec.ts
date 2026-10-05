import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccountDashboardComponent } from './account-dashboard.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  AdminAccount,
  AdminAccountListResponse,
} from '../../models/account-lifecycle.model';
import { environment } from '../../../../../../environments/environment';

// AccountLifecycleService.getAccounts() → BffClientService.get('/api/v1/admin/accounts', params)
// BffClient prepends environment.bffBaseUrl, so the wire URL is absolute.
const ACCOUNTS_URL = `${environment.bffBaseUrl}/api/v1/admin/accounts`;

function makeAccount(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    gcid: 'gcid-active-001',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    state: 'active',
    roles: ['learner', 'author'],
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

const ACTIVE = makeAccount({ gcid: 'gcid-active-001', state: 'active' });
const SUSPENDED = makeAccount({
  gcid: 'gcid-suspended-002',
  displayName: 'Grace Hopper',
  email: 'grace@example.com',
  state: 'suspended',
  suspendedAt: '2026-05-10T00:00:00Z',
  suspensionReason: 'Policy violation',
});
const PENDING = makeAccount({
  gcid: 'gcid-pending-003',
  displayName: 'Alan Turing',
  email: 'alan@example.com',
  state: 'pending_deletion',
});

const LIST: readonly AdminAccount[] = [ACTIVE, SUSPENDED, PENDING];

function listResponse(
  accounts: readonly AdminAccount[],
  total?: number,
): AdminAccountListResponse {
  return {
    accounts: accounts as AdminAccount[],
    total: total ?? accounts.length,
    page: 1,
    pageSize: 25,
  };
}

/**
 * Build the component and flush the ngOnInit GET. The first detectChanges()
 * runs ngOnInit → loadAccounts() → the GET fires synchronously, so expectOne
 * is valid immediately after.
 */
function setup(
  accounts: readonly AdminAccount[] = LIST,
  total?: number,
): {
  fixture: ComponentFixture<AccountDashboardComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: AccountDashboardComponent;
} {
  TestBed.configureTestingModule({
    imports: [AccountDashboardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(AccountDashboardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // ngOnInit → loadAccounts → GET
  httpMock.expectOne((r) => r.url === ACCOUNTS_URL).flush(listResponse(accounts, total));
  fixture.detectChanges();
  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('AccountDashboardComponent', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: AccountDashboardComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    httpMock = built.httpMock;
    element = built.element;
    component = built.component;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root account-dashboard section', () => {
      const root = element.querySelector('[data-testid="account-dashboard"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('account-dashboard');
    });

    it('renders the title with the translated i18n key', () => {
      const title = element.querySelector('[data-testid="dashboard-title"]');
      expect(title?.textContent?.trim()).toBe('admin.account_lifecycle.title');
    });

    it('renders a refresh button and search + filter controls', () => {
      expect(element.querySelector('[data-testid="btn-refresh"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="search-input"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="state-filter"]')).not.toBeNull();
    });

    it('renders one option per account state in the filter', () => {
      const options = element.querySelectorAll(
        '[data-testid="state-filter"] option',
      );
      // 1 "all states" + 4 account states
      expect(options.length).toBe(5);
    });
  });

  describe('ready state — account list', () => {
    it('issues the initial GET on init and renders the list', () => {
      expect(element.querySelector('[data-testid="account-list"]')).not.toBeNull();
    });

    it('renders one card per account', () => {
      const cards = element.querySelectorAll('[data-testid^="account-gcid-"]');
      expect(cards.length).toBe(3);
    });

    it('renders the active account card with name + email', () => {
      const card = element.querySelector('[data-testid="account-gcid-active-001"]');
      expect(card?.textContent).toContain('Ada Lovelace');
      expect(card?.textContent).toContain('ada@example.com');
    });

    it('renders a state badge with the state-specific class', () => {
      const badge = element.querySelector('[data-testid="state-gcid-active-001"]');
      expect(badge?.className).toContain('account-dashboard__state-badge--active');
      expect(badge?.textContent?.trim()).toBe(
        'admin.account_lifecycle.state_active',
      );
    });

    it('renders role chips for an account', () => {
      const card = element.querySelector('[data-testid="account-gcid-active-001"]');
      const chips = card?.querySelectorAll('.account-dashboard__role-chip');
      expect(chips?.length).toBe(2);
      expect(card?.textContent).toContain('learner');
      expect(card?.textContent).toContain('author');
    });

    it('shows suspension metadata for a suspended account', () => {
      const card = element.querySelector(
        '[data-testid="account-gcid-suspended-002"]',
      );
      expect(card?.textContent).toContain('Policy violation');
    });
  });

  describe('action buttons gated by state', () => {
    it('shows suspend + close + events on an active account, but not reactivate', () => {
      expect(
        element.querySelector('[data-testid="btn-suspend-gcid-active-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-close-gcid-active-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-events-gcid-active-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-reactivate-gcid-active-001"]'),
      ).toBeNull();
    });

    it('shows reactivate + close on a suspended account, but not suspend', () => {
      expect(
        element.querySelector('[data-testid="btn-reactivate-gcid-suspended-002"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-close-gcid-suspended-002"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-suspend-gcid-suspended-002"]'),
      ).toBeNull();
    });

    it('shows only events on a pending_deletion account', () => {
      expect(
        element.querySelector('[data-testid="btn-suspend-gcid-pending-003"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="btn-reactivate-gcid-pending-003"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="btn-close-gcid-pending-003"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="btn-events-gcid-pending-003"]'),
      ).not.toBeNull();
    });
  });

  describe('summary stats', () => {
    it('computes active / suspended / pending_deletion counts from the loaded accounts', () => {
      expect(component.activeCount()).toBe(1);
      expect(component.suspendedCount()).toBe(1);
      expect(component.pendingDeletionCount()).toBe(1);
    });

    it('renders the total accounts value from the response total', () => {
      const stats = element.querySelector('[data-testid="stats"]');
      expect(stats?.textContent).toContain('3');
    });
  });

  describe('state-helper methods', () => {
    it('stateClass builds a BEM modifier from the state', () => {
      expect(component.stateClass('suspended')).toBe(
        'account-dashboard__state-badge--suspended',
      );
    });

    it('canSuspend only for active', () => {
      expect(component.canSuspend(ACTIVE)).toBe(true);
      expect(component.canSuspend(SUSPENDED)).toBe(false);
      expect(component.canSuspend(PENDING)).toBe(false);
    });

    it('canReactivate only for suspended', () => {
      expect(component.canReactivate(SUSPENDED)).toBe(true);
      expect(component.canReactivate(ACTIVE)).toBe(false);
    });

    it('canClose for active or suspended only', () => {
      expect(component.canClose(ACTIVE)).toBe(true);
      expect(component.canClose(SUSPENDED)).toBe(true);
      expect(component.canClose(PENDING)).toBe(false);
    });

    it('formatDateTime renders a date string from a valid ISO input', () => {
      const out = component.formatDateTime('2026-05-01T00:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });
});

describe('AccountDashboardComponent — loading + empty + error states', () => {
  afterEach(() => {
    // each test verifies its own httpMock locally
  });

  it('shows the loading skeleton before the GET resolves', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AccountDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(AccountDashboardComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit fires GET, loading() === true, not yet flushed
    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('[data-testid="accounts-loading"]'),
    ).not.toBeNull();
    expect(fixture.componentInstance.loading()).toBe(true);

    // flush so afterEach verify passes
    httpMock.expectOne((r) => r.url === ACCOUNTS_URL).flush(listResponse([]));
    httpMock.verify();
  });

  it('renders the empty state when the response has no accounts', () => {
    TestBed.resetTestingModule();
    const { element, component, httpMock } = (() => {
      TestBed.configureTestingModule({
        imports: [AccountDashboardComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
        ],
      });
      const f = TestBed.createComponent(AccountDashboardComponent);
      const mock = TestBed.inject(HttpTestingController);
      f.detectChanges();
      mock.expectOne((r) => r.url === ACCOUNTS_URL).flush(listResponse([], 0));
      f.detectChanges();
      return {
        element: f.nativeElement as HTMLElement,
        component: f.componentInstance,
        httpMock: mock,
      };
    })();

    expect(component.isEmpty()).toBe(true);
    expect(element.querySelector('[data-testid="accounts-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="account-list"]')).toBeNull();
    httpMock.verify();
  });

  it('shows an error toast and stops loading when the GET fails (5xx)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AccountDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(AccountDashboardComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === ACCOUNTS_URL)
      .flush(
        { error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.account_lifecycle.accounts_load_error',
      'error',
    );
    httpMock.verify();
  });
});

describe('AccountDashboardComponent — search, filter & pagination', () => {
  let httpMock: HttpTestingController;
  let component: AccountDashboardComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    httpMock = built.httpMock;
    component = built.component;
  });

  afterEach(() => httpMock.verify());

  it('onSearch resets to page 1 and refetches with a search param', () => {
    component.onSearch('grace');
    const req = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('search')).toBe('grace');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(listResponse([SUSPENDED], 1));
    expect(component.currentPage()).toBe(1);
    expect(component.searchQuery()).toBe('grace');
  });

  it('onStateFilter sets the state filter and refetches with a state param', () => {
    component.onStateFilter('suspended');
    const req = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    expect(req.request.params.get('state')).toBe('suspended');
    req.flush(listResponse([SUSPENDED], 1));
    expect(component.filterState()).toBe('suspended');
  });

  it('onStateFilter with empty string clears the filter (no state param)', () => {
    component.onStateFilter('');
    const req = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    expect(req.request.params.has('state')).toBe(false);
    req.flush(listResponse(LIST));
    expect(component.filterState()).toBeNull();
  });

  it('renders pagination when there is more than one page', () => {
    // totalPages = ceil(60 / 25) = 3 > 1
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AccountDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const f = TestBed.createComponent(AccountDashboardComponent);
    const mock = TestBed.inject(HttpTestingController);
    f.detectChanges();
    mock.expectOne((r) => r.url === ACCOUNTS_URL).flush(listResponse(LIST, 60));
    f.detectChanges();

    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="pagination"]')).not.toBeNull();
    expect(f.componentInstance.totalPages()).toBe(3);
    mock.verify();
  });

  it('goToPage ignores out-of-range pages (no refetch)', () => {
    // single page (total 3 ≤ pageSize 25) so any page > 1 is out of range
    component.goToPage(0);
    component.goToPage(99);
    // afterEach httpMock.verify() asserts no stray GET fired
    expect(component.currentPage()).toBe(1);
  });

  it('goToPage navigates to a valid page and refetches', () => {
    // Force multiple pages by setting a larger total first.
    component.totalAccounts.set(60); // totalPages → 3
    component.goToPage(2);
    const req = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(listResponse(LIST, 60));
    expect(component.currentPage()).toBe(2);
  });
});

describe('AccountDashboardComponent — suspend flow', () => {
  let fixture: ComponentFixture<AccountDashboardComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: AccountDashboardComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = built.element;
    component = built.component;
  });

  afterEach(() => httpMock.verify());

  it('opens the suspend dialog only after the suspend button is clicked', () => {
    expect(element.querySelector('[data-testid="suspend-dialog"]')).toBeNull();
    (
      element.querySelector(
        '[data-testid="btn-suspend-gcid-active-001"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="suspend-dialog"]')).not.toBeNull();
    expect(component.suspendTargetAccount()?.gcid).toBe('gcid-active-001');
  });

  it('keeps the confirm button disabled until a reason is entered', () => {
    component.openSuspendDialog(ACTIVE);
    fixture.detectChanges();
    const confirm = element.querySelector(
      '[data-testid="btn-confirm-suspend"]',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    component.onSuspendReasonInput('Abuse report');
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
  });

  it('confirmSuspend is a no-op without a reason (no POST)', () => {
    component.openSuspendDialog(ACTIVE);
    component.confirmSuspend();
    // afterEach verify() asserts no POST fired
    expect(component.suspendDialogVisible()).toBe(true);
  });

  it('POSTs the suspend, refetches, and closes the dialog on success', () => {
    component.openSuspendDialog(ACTIVE);
    component.onSuspendReasonInput('  Abuse report  ');
    fixture.detectChanges();

    component.confirmSuspend();

    const post = httpMock.expectOne(
      (r) => r.url === `${ACCOUNTS_URL}/gcid-active-001/suspend`,
    );
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ reason: 'Abuse report' }); // trimmed
    post.flush(null);

    // success → loadAccounts() refetch
    const refetch = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    refetch.flush(listResponse(LIST));
    fixture.detectChanges();

    expect(component.suspendDialogVisible()).toBe(false);
    expect(element.querySelector('[data-testid="suspend-dialog"]')).toBeNull();
  });

  it('surfaces an error toast and keeps the dialog open when the suspend POST fails (4xx)', () => {
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    component.openSuspendDialog(ACTIVE);
    component.onSuspendReasonInput('Abuse report');
    fixture.detectChanges();

    component.confirmSuspend();

    httpMock
      .expectOne((r) => r.url === `${ACCOUNTS_URL}/gcid-active-001/suspend`)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.account_lifecycle.suspend_error',
      'error',
    );
    expect(component.suspendLoading()).toBe(false);
    expect(component.suspendDialogVisible()).toBe(true); // stays open
  });

  it('closeSuspendDialog clears the target and reason', () => {
    component.openSuspendDialog(ACTIVE);
    component.onSuspendReasonInput('x');
    component.closeSuspendDialog();
    expect(component.suspendDialogVisible()).toBe(false);
    expect(component.suspendTargetAccount()).toBeNull();
    expect(component.suspendReason()).toBe('');
  });
});

describe('AccountDashboardComponent — close-account flow', () => {
  let fixture: ComponentFixture<AccountDashboardComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: AccountDashboardComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = built.element;
    component = built.component;
  });

  afterEach(() => httpMock.verify());

  it('opens the close dialog with a warning when the close button is clicked', () => {
    (
      element.querySelector(
        '[data-testid="btn-close-gcid-active-001"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const dialog = element.querySelector('[data-testid="close-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('admin.account_lifecycle.close_warning');
    expect(component.closeTargetAccount()?.gcid).toBe('gcid-active-001');
  });

  it('confirmCloseAccount is a no-op without a reason (no POST)', () => {
    component.openCloseDialog(ACTIVE);
    component.confirmCloseAccount();
    expect(component.closeDialogVisible()).toBe(true);
  });

  it('POSTs the close with the trimmed reason, refetches, and closes the dialog', () => {
    component.openCloseDialog(ACTIVE);
    component.onCloseReasonInput('Account fraud');
    fixture.detectChanges();

    component.confirmCloseAccount();

    const post = httpMock.expectOne(
      (r) => r.url === `${ACCOUNTS_URL}/gcid-active-001/close`,
    );
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ reason: 'Account fraud' });
    post.flush(null);

    const refetch = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    refetch.flush(listResponse(LIST));
    fixture.detectChanges();

    expect(component.closeDialogVisible()).toBe(false);
  });

  it('surfaces an error toast and keeps the dialog open when the close POST fails', () => {
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    component.openCloseDialog(ACTIVE);
    component.onCloseReasonInput('Account fraud');
    fixture.detectChanges();

    component.confirmCloseAccount();

    httpMock
      .expectOne((r) => r.url === `${ACCOUNTS_URL}/gcid-active-001/close`)
      .flush({ error: 'conflict' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.account_lifecycle.close_error',
      'error',
    );
    expect(component.closeLoading()).toBe(false);
    expect(component.closeDialogVisible()).toBe(true);
  });
});

describe('AccountDashboardComponent — reactivate flow', () => {
  let httpMock: HttpTestingController;
  let component: AccountDashboardComponent;
  let confirmDialog: ConfirmDialogService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    httpMock = built.httpMock;
    component = built.component;
    confirmDialog = TestBed.inject(ConfirmDialogService);
  });

  afterEach(() => httpMock.verify());

  it('does NOT POST when the confirm dialog is declined', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
    await component.reactivateAccount(SUSPENDED);
    // afterEach verify() asserts no reactivate POST fired
    expect(confirmDialog.confirm).toHaveBeenCalled();
  });

  it('POSTs reactivate and refetches when the confirm dialog is accepted', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');

    await component.reactivateAccount(SUSPENDED);

    const post = httpMock.expectOne(
      (r) => r.url === `${ACCOUNTS_URL}/gcid-suspended-002/reactivate`,
    );
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({});
    post.flush(null);

    const refetch = httpMock.expectOne((r) => r.url === ACCOUNTS_URL);
    refetch.flush(listResponse(LIST));

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.account_lifecycle.account_reactivated',
      'success',
    );
  });

  it('surfaces an error toast when the reactivate POST fails', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');

    await component.reactivateAccount(SUSPENDED);

    httpMock
      .expectOne((r) => r.url === `${ACCOUNTS_URL}/gcid-suspended-002/reactivate`)
      .flush({ error: 'gone' }, { status: 404, statusText: 'Not Found' });

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.account_lifecycle.reactivate_error',
      'error',
    );
  });
});

/**
 * S7d, the closure block (UX Track U, E3 slice 7; first-launch spec 13.7.2).
 *
 * The gateway now refuses a closure request while the target still owns an
 * organisation, on BOTH close routes, with 409 CLOSURE_OWNS_TENANT carrying the
 * organisations in `error.owned_tenants`.
 *
 * It has to render INLINE and PERSISTENTLY, not as a toast. The operator's next
 * step is a handover, and a message that disappears after four seconds cannot
 * carry the name of the organisation or a link to the screen that unblocks it.
 * That is the same lesson E1 item 4b learned about the wizard's named 409.
 */
describe('AccountDashboardComponent, the closure ownership block (S7d)', () => {
  const OWNS_TENANT = {
    error: {
      code: 'CLOSURE_OWNS_TENANT',
      message: 'this account owns an organisation',
      owned_tenants: [
        { tenant_id: '11111111-1111-7111-8111-111111111111', tenant_slug: 'northwind-academy' },
      ],
    },
  };

  function openCloseDialogAndSubmit(
    body: Record<string, unknown>,
    status: number,
  ): ReturnType<typeof setup> {
    const s = setup();
    s.component.openCloseDialog(LIST[0]);
    s.component.onCloseReasonInput('duplicate account');
    s.fixture.detectChanges();
    s.component.confirmCloseAccount();
    s.httpMock
      .expectOne((r) => r.url.endsWith(`/close`))
      .flush(body, { status, statusText: 'Refused' });
    s.fixture.detectChanges();
    return s;
  }

  it('names the block and the organisation instead of a generic failure', () => {
    const s = openCloseDialogAndSubmit(OWNS_TENANT, 409);

    const block = s.element.querySelector('[data-testid="close-owns-tenant"]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toContain('northwind-academy');
  });

  // The dialog must STAY open. Closing it would take the message with it, and
  // the operator would be back where they started with no idea why.
  it('leaves the dialog open so the refusal can be read', () => {
    const s = openCloseDialogAndSubmit(OWNS_TENANT, 409);
    expect(s.element.querySelector('[data-testid="close-dialog"]')).not.toBeNull();
  });

  it('clears the block when the dialog is reopened', () => {
    const s = openCloseDialogAndSubmit(OWNS_TENANT, 409);
    s.component.closeCloseDialog();
    s.component.openCloseDialog(LIST[0]);
    s.fixture.detectChanges();
    expect(s.element.querySelector('[data-testid="close-owns-tenant"]')).toBeNull();
  });

  // Every other failure keeps the behaviour it had. A 500 is not an ownership
  // problem and must not be dressed up as one.
  it('does not show the block for an unrelated failure', () => {
    const s = openCloseDialogAndSubmit({}, 500);
    expect(s.element.querySelector('[data-testid="close-owns-tenant"]')).toBeNull();
  });
});
