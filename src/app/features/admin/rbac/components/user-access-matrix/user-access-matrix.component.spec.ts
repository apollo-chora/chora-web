import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { UserAccessMatrixComponent } from './user-access-matrix.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type {
  TenantUser,
  TenantUserListResponse,
  RoleCapabilities,
  EffectivePermissionsResponse,
} from '../../models/rbac.model';

const USERS_PATH = `${environment.bffBaseUrl}/api/v1/admin/users`;
const CAPABILITIES_PATH = `${environment.bffBaseUrl}/api/v1/rbac/capabilities`;
const EFFECTIVE_PATH = `${environment.bffBaseUrl}/api/v1/rbac/effective-permissions`;
const ROLES_PATH = `${environment.bffBaseUrl}/api/v1/admin/users/roles`;

const STUB_USERS: readonly TenantUser[] = [
  {
    gcid: 'gcid-aaa',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    roles: ['learner', 'instructor'],
    lastActiveAt: '2026-05-26T01:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    gcid: 'gcid-bbb',
    email: 'grace@example.com',
    displayName: 'Grace Hopper',
    roles: ['content_author'],
    lastActiveAt: '2026-05-25T01:00:00Z',
    createdAt: '2026-01-02T00:00:00Z',
  },
];

const STUB_CAPABILITIES: readonly RoleCapabilities[] = [
  {
    role: 'instructor',
    capabilities: [
      { code: 'class.manage', label: 'Manage Class', description: 'Manage classes' },
      { code: 'roster.view', label: 'View Roster', description: 'View rosters' },
    ],
  },
];

function listResponse(
  users: readonly TenantUser[],
  total = users.length,
): TenantUserListResponse {
  return {
    users: [...users],
    total,
    page: 1,
    pageSize: 25,
  };
}

/**
 * Flush the two ngOnInit GETs (users list + capabilities). The list request is
 * matched by URL prefix because getUsers always appends ?page&pageSize params.
 */
function flushInit(
  httpMock: HttpTestingController,
  users: readonly TenantUser[] = STUB_USERS,
  caps: readonly RoleCapabilities[] = STUB_CAPABILITIES,
  total?: number,
): void {
  const usersReq = httpMock.expectOne(
    (r) => r.method === 'GET' && r.url === USERS_PATH,
  );
  usersReq.flush(listResponse(users, total));
  httpMock
    .expectOne((r) => r.method === 'GET' && r.url === CAPABILITIES_PATH)
    .flush([...caps]);
}

function setup(): {
  fixture: ComponentFixture<UserAccessMatrixComponent>;
  httpMock: HttpTestingController;
  component: UserAccessMatrixComponent;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [UserAccessMatrixComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(UserAccessMatrixComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return {
    fixture,
    httpMock,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('UserAccessMatrixComponent', () => {
  let fixture: ComponentFixture<UserAccessMatrixComponent>;
  let httpMock: HttpTestingController;
  let component: UserAccessMatrixComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
    fixture.detectChanges(); // triggers ngOnInit
    flushInit(httpMock);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root with the user-access-matrix testid + class', () => {
      const root = element.querySelector('[data-testid="user-access-matrix"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('user-access-matrix');
    });

    it('renders the page title with the i18n key', () => {
      const title = element.querySelector('[data-testid="rbac-title"]');
      expect(title?.textContent?.trim()).toBe('admin.rbac.title');
    });

    it('renders the search bar and refresh button', () => {
      expect(element.querySelector('[data-testid="search-bar"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="search-input"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="btn-refresh"]')).not.toBeNull();
    });
  });

  describe('ready state — user table', () => {
    it('issues the initial GET with default page + pageSize params', () => {
      // Re-run a fresh init to inspect the request params (the beforeEach
      // already consumed the first pair).
      TestBed.resetTestingModule();
      const built = setup();
      built.fixture.detectChanges();
      const req = built.httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === USERS_PATH,
      );
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('25');
      expect(req.request.params.get('search')).toBeNull();
      req.flush(listResponse(STUB_USERS));
      built.httpMock
        .expectOne((r) => r.method === 'GET' && r.url === CAPABILITIES_PATH)
        .flush([...STUB_CAPABILITIES]);
      built.httpMock.verify();
    });

    it('renders one row per user', () => {
      const table = element.querySelector('[data-testid="user-table"]');
      expect(table).not.toBeNull();
      expect(
        element.querySelector('[data-testid="user-row-gcid-aaa"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="user-row-gcid-bbb"]'),
      ).not.toBeNull();
    });

    it('renders the display name + email per user', () => {
      const row = element.querySelector('[data-testid="user-row-gcid-aaa"]');
      expect(row?.textContent).toContain('Ada Lovelace');
      expect(row?.textContent).toContain('ada@example.com');
    });

    it('renders a role badge per assigned role', () => {
      const row = element.querySelector('[data-testid="user-row-gcid-aaa"]');
      expect(
        row?.querySelector('[data-testid="role-badge-learner"]'),
      ).not.toBeNull();
      expect(
        row?.querySelector('[data-testid="role-badge-instructor"]'),
      ).not.toBeNull();
    });

    it('renders the assign-role CTA per user', () => {
      expect(
        element.querySelector('[data-testid="btn-assign-gcid-aaa"]'),
      ).not.toBeNull();
    });

    it('does not render the empty state when users are present', () => {
      expect(element.querySelector('[data-testid="users-empty"]')).toBeNull();
    });

    it('does not render pagination when totalPages <= 1', () => {
      expect(element.querySelector('[data-testid="pagination"]')).toBeNull();
    });
  });

  describe('loading state', () => {
    it('shows the loading skeleton while users are in flight', () => {
      TestBed.resetTestingModule();
      const built = setup();
      built.fixture.detectChanges(); // ngOnInit fires the GETs, nothing flushed yet
      const loading = (built.element as HTMLElement).querySelector(
        '[data-testid="users-loading"]',
      );
      expect(loading).not.toBeNull();
      expect(built.component.loading()).toBe(true);
      // settle so afterEach-style verify is clean for this nested fixture
      flushInit(built.httpMock);
      built.fixture.detectChanges();
      built.httpMock.verify();
    });
  });

  describe('empty state', () => {
    it('renders the empty message when the list comes back empty', () => {
      TestBed.resetTestingModule();
      const built = setup();
      built.fixture.detectChanges();
      flushInit(built.httpMock, []);
      built.fixture.detectChanges();

      const empty = (built.element as HTMLElement).querySelector(
        '[data-testid="users-empty"]',
      );
      expect(empty).not.toBeNull();
      expect(empty?.textContent?.trim()).toBe('admin.rbac.no_users');
      expect(built.component.isEmpty()).toBe(true);
      built.httpMock.verify();
    });
  });

  describe('error path — users load failure', () => {
    it('shows a toast and clears loading on a 500', () => {
      const toast = TestBed.inject(ToastService);
      const dismissAll = toast.toasts().length;
      expect(dismissAll).toBe(0);

      component.loadUsers();
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === USERS_PATH)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(toast.toasts().some((t) => t.message === 'admin.rbac.users_load_error')).toBe(true);
    });
  });

  describe('search', () => {
    it('resets to page 1 and refetches with the search param', () => {
      component.onSearch('grace');
      fixture.detectChanges();

      expect(component.searchQuery()).toBe('grace');
      expect(component.currentPage()).toBe(1);

      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === USERS_PATH,
      );
      expect(req.request.params.get('search')).toBe('grace');
      req.flush(listResponse([STUB_USERS[1]], 1));
      fixture.detectChanges();
    });
  });

  describe('pagination', () => {
    it('renders pagination controls when there are multiple pages', () => {
      TestBed.resetTestingModule();
      const built = setup();
      built.fixture.detectChanges();
      flushInit(built.httpMock, STUB_USERS, STUB_CAPABILITIES, 100); // total=100 → 4 pages
      built.fixture.detectChanges();

      const pager = (built.element as HTMLElement).querySelector(
        '[data-testid="pagination"]',
      );
      expect(pager).not.toBeNull();
      expect(built.component.totalPages()).toBe(4);
      built.httpMock.verify();
    });

    it('goToPage refetches for an in-range page', () => {
      component.totalUsers.set(100); // 4 pages
      component.goToPage(2);
      fixture.detectChanges();

      expect(component.currentPage()).toBe(2);
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === USERS_PATH,
      );
      expect(req.request.params.get('page')).toBe('2');
      req.flush(listResponse(STUB_USERS, 100));
      fixture.detectChanges();
    });

    it('goToPage ignores out-of-range pages (no refetch)', () => {
      component.totalUsers.set(100);
      component.currentPage.set(2);
      component.goToPage(0); // below range
      component.goToPage(999); // above range
      // No HTTP fired — afterEach verify() asserts no stray request.
      expect(component.currentPage()).toBe(2);
    });
  });

  describe('permission preview', () => {
    it('opens the preview row and fetches effective permissions on user click', () => {
      component.showPermissionPreview(STUB_USERS[0]);
      fixture.detectChanges();

      expect(component.previewUserId()).toBe('gcid-aaa');
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === EFFECTIVE_PATH,
      );
      expect(req.request.params.get('gcid')).toBe('gcid-aaa');
      const resp: EffectivePermissionsResponse = {
        gcid: 'gcid-aaa',
        permissions: [
          { capability: 'atom.read', grantedBy: ['learner'] },
          { capability: 'class.manage', grantedBy: ['instructor'] },
        ],
      };
      req.flush(resp);
      fixture.detectChanges();

      expect(component.isPreviewOpen('gcid-aaa')).toBe(true);
      const preview = element.querySelector('[data-testid="permission-preview"]');
      expect(preview).not.toBeNull();
      const list = element.querySelector('[data-testid="permissions-list"]');
      expect(list?.textContent).toContain('atom.read');
      expect(list?.textContent).toContain('class.manage');
    });

    it('toggles the preview closed when the same user is clicked twice', () => {
      component.showPermissionPreview(STUB_USERS[0]);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === EFFECTIVE_PATH)
        .flush({ gcid: 'gcid-aaa', permissions: [] });
      fixture.detectChanges();

      // Second click on the same user closes — no new HTTP request.
      component.showPermissionPreview(STUB_USERS[0]);
      fixture.detectChanges();
      expect(component.previewUserId()).toBeNull();
      expect(component.isPreviewOpen('gcid-aaa')).toBe(false);
    });

    it('shows a toast on effective-permissions error', () => {
      const toast = TestBed.inject(ToastService);
      component.showPermissionPreview(STUB_USERS[1]);
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === EFFECTIVE_PATH)
        .flush('nope', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();

      expect(component.previewLoading()).toBe(false);
      expect(
        toast.toasts().some((t) => t.message === 'admin.rbac.permissions_load_error'),
      ).toBe(true);
    });

    it('onRoleClick selects then toggles off a role and exposes its capabilities', () => {
      // Load caps already flushed in beforeEach; instructor has 2 caps.
      component.onRoleClick('instructor');
      expect(component.previewRole()).toBe('instructor');
      expect(component.previewRoleCapabilities().length).toBe(2);
      expect(
        component.previewRoleCapabilities().map((c) => c.code),
      ).toContain('class.manage');

      component.onRoleClick('instructor'); // toggle off
      expect(component.previewRole()).toBeNull();
      expect(component.previewRoleCapabilities()).toEqual([]);
    });
  });

  describe('assign-role dialog', () => {
    it('opens the dialog targeting a user and lists assignable roles only', () => {
      component.openAssignDialog(STUB_USERS[0]); // already has learner + instructor
      fixture.detectChanges();

      expect(component.assignDialogVisible()).toBe(true);
      expect(element.querySelector('[data-testid="assign-dialog"]')).not.toBeNull();
      // learner + instructor excluded from the assignable list.
      const available = component.availableRolesForAssignment();
      expect(available).not.toContain('learner');
      expect(available).not.toContain('instructor');
      expect(available).toContain('tenant_admin');
    });

    it('POSTs the assignment, toasts success, closes the dialog, and refetches', () => {
      const toast = TestBed.inject(ToastService);
      component.openAssignDialog(STUB_USERS[1]);
      component.onAssignRoleSelect('tenant_admin');
      fixture.detectChanges();
      expect(component.assignSelectedRole()).toBe('tenant_admin');

      component.confirmAssignRole();
      const post = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url === ROLES_PATH,
      );
      expect(post.request.body).toEqual({ gcid: 'gcid-bbb', role: 'tenant_admin' });
      post.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(component.assignDialogVisible()).toBe(false);
      expect(
        toast.toasts().some((t) => t.message === 'admin.rbac.role_assigned'),
      ).toBe(true);

      // success → loadUsers refetch
      const refetch = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === USERS_PATH,
      );
      refetch.flush(listResponse(STUB_USERS));
      fixture.detectChanges();
    });

    it('toasts an error and keeps the dialog open when assignment fails', () => {
      const toast = TestBed.inject(ToastService);
      component.openAssignDialog(STUB_USERS[1]);
      component.onAssignRoleSelect('finance_admin');
      fixture.detectChanges();

      component.confirmAssignRole();
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url === ROLES_PATH)
        .flush('bad', { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(component.assignLoading()).toBe(false);
      expect(component.assignDialogVisible()).toBe(true); // stays open
      expect(
        toast.toasts().some((t) => t.message === 'admin.rbac.role_assign_error'),
      ).toBe(true);
    });

    it('confirmAssignRole is a no-op without a selected role (no HTTP)', () => {
      component.openAssignDialog(STUB_USERS[0]);
      // no role selected
      component.confirmAssignRole();
      // afterEach verify() asserts no POST fired.
      expect(component.assignLoading()).toBe(false);
    });

    it('onAssignRoleSelect clears the selection for the empty option', () => {
      component.openAssignDialog(STUB_USERS[0]);
      component.onAssignRoleSelect('tenant_admin');
      expect(component.assignSelectedRole()).toBe('tenant_admin');
      component.onAssignRoleSelect('');
      expect(component.assignSelectedRole()).toBeNull();
    });

    it('closeAssignDialog resets the dialog state', () => {
      component.openAssignDialog(STUB_USERS[0]);
      component.onAssignRoleSelect('tenant_admin');
      component.closeAssignDialog();
      expect(component.assignDialogVisible()).toBe(false);
      expect(component.assignTargetUser()).toBeNull();
      expect(component.assignSelectedRole()).toBeNull();
    });
  });

  describe('revoke-role', () => {
    it('DELETEs the role and toasts success when confirmed', async () => {
      const toast = TestBed.inject(ToastService);
      const confirm = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi
        .spyOn(confirm, 'confirm')
        .mockResolvedValue(true);

      await component.revokeRole(STUB_USERS[0], 'instructor');

      expect(confirmSpy).toHaveBeenCalled();
      const del = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.startsWith(`${ROLES_PATH}/instructor`),
      );
      expect(del.request.url).toContain('gcid=gcid-aaa');
      del.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(
        toast.toasts().some((t) => t.message === 'admin.rbac.role_revoked'),
      ).toBe(true);

      // success → loadUsers refetch
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === USERS_PATH)
        .flush(listResponse(STUB_USERS));
      fixture.detectChanges();
    });

    it('does nothing when the confirmation is cancelled (no HTTP)', async () => {
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

      await component.revokeRole(STUB_USERS[0], 'instructor');
      // afterEach verify() asserts no DELETE fired.
      expect(component.users().length).toBe(2);
    });

    it('toasts an error when the revoke DELETE fails', async () => {
      const toast = TestBed.inject(ToastService);
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(true);

      await component.revokeRole(STUB_USERS[1], 'content_author');
      httpMock
        .expectOne(
          (r) =>
            r.method === 'DELETE' &&
            r.url.startsWith(`${ROLES_PATH}/content_author`),
        )
        .flush('nope', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(
        toast.toasts().some((t) => t.message === 'admin.rbac.role_revoke_error'),
      ).toBe(true);
    });
  });

  describe('helpers', () => {
    it('roleClass builds a BEM modifier from the role', () => {
      expect(component.roleClass('tenant_admin')).toBe(
        'user-access-matrix__role-badge--tenant_admin',
      );
    });

    it('formatDateTime renders a locale date for a valid ISO string', () => {
      const out = component.formatDateTime('2026-05-26T01:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('trackByGcid returns the user gcid', () => {
      expect(component.trackByGcid(0, STUB_USERS[0])).toBe('gcid-aaa');
    });
  });
});
