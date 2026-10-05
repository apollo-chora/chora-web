import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiKeysComponent } from './api-keys.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

describe('ApiKeysComponent', () => {
  let fixture: ComponentFixture<ApiKeysComponent>;
  let component: ApiKeysComponent;

  const mockKeys = {
    data: [
      {
        id: 'key-001',
        name: 'Test Key',
        prefix: 'chora_test_abc',
        environment: 'test' as const,
        status: 'active' as const,
        created_at: '2026-03-01T00:00:00Z',
        last_used_at: null,
      },
    ],
  };

  const mockBff = {
    get: vi.fn().mockReturnValue(of(mockKeys)),
    post: vi.fn().mockReturnValue(of({ data: { id: 'key-002', key: 'full-key-value', name: 'New', prefix: 'chora_test_xyz', environment: 'test' } })),
    delete: vi.fn().mockReturnValue(of(null)),
  };

  const mockToast = { show: vi.fn() };
  const mockConfirmDialog = { confirm: vi.fn().mockResolvedValue(true) };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ApiKeysComponent],
      providers: [
        { provide: BffClientService, useValue: mockBff },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiKeysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load keys on init', () => {
    expect(mockBff.get).toHaveBeenCalledWith('/api/v1/iam/api-keys');
    expect(component.keys().length).toBe(1);
    expect(component.isLoading()).toBe(false);
  });

  it('should toggle create form visibility', () => {
    expect(component.showCreateForm()).toBe(false);
    component.toggleCreateForm();
    expect(component.showCreateForm()).toBe(true);
  });

  it('should compute canCreate based on name input', () => {
    expect(component.canCreate()).toBe(false);
    component.newKeyName.set('My Key');
    expect(component.canCreate()).toBe(true);
  });

  it('should compute isEmpty when no keys and not loading', () => {
    component.keys.set([]);
    component.isLoading.set(false);
    expect(component.isEmpty()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Shell render
  // ---------------------------------------------------------------------------

  describe('shell render', () => {
    it('should render the page container', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="api-keys-page"]')).toBeTruthy();
    });

    it('should render the create button with translated label', () => {
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('[data-testid="btn-create-key"]');
      expect(btn).toBeTruthy();
      expect(btn?.textContent?.trim()).toBe('settings.api_keys.create');
    });

    it('should render the title key', () => {
      const el = fixture.nativeElement as HTMLElement;
      const title = el.querySelector('.api-keys__title');
      expect(title?.textContent?.trim()).toBe('settings.api_keys.title');
    });

    it('should render the loaded key row table', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="keys-table"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="key-row-key-001"]')).toBeTruthy();
    });

    it('should render the active key name and prefix as data', () => {
      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="key-row-key-001"]');
      expect(row?.textContent).toContain('Test Key');
      expect(row?.textContent).toContain('chora_test_abc');
    });
  });

  // ---------------------------------------------------------------------------
  // Loading / empty / table states
  // ---------------------------------------------------------------------------

  describe('view states', () => {
    it('should show loading skeleton when isLoading is true', () => {
      component.isLoading.set(true);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="keys-loading"]')).toBeTruthy();
      // table should NOT render while loading
      expect(el.querySelector('[data-testid="keys-table"]')).toBeNull();
    });

    it('should show empty state when no keys and not loading', () => {
      component.keys.set([]);
      component.isLoading.set(false);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const empty = el.querySelector('[data-testid="keys-empty"]');
      expect(empty).toBeTruthy();
      expect(empty?.textContent?.trim()).toContain('settings.api_keys.empty');
    });

    it('should not render table or empty while loading', () => {
      component.isLoading.set(true);
      component.keys.set([]);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="keys-empty"]')).toBeNull();
      expect(el.querySelector('[data-testid="keys-table"]')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Load (error path)
  // ---------------------------------------------------------------------------

  describe('loadKeys error path', () => {
    it('should clear keys, stop loading, and toast on load error', () => {
      mockBff.get.mockReturnValueOnce(throwError(() => new Error('500')));
      const fx = TestBed.createComponent(ApiKeysComponent);
      fx.detectChanges(); // triggers ngOnInit -> loadKeys
      const cmp = fx.componentInstance;
      expect(cmp.keys()).toEqual([]);
      expect(cmp.isLoading()).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.load_error', 'error');
    });

    it('should default to empty array when response.data is missing', () => {
      mockBff.get.mockReturnValueOnce(of({} as any));
      const fx = TestBed.createComponent(ApiKeysComponent);
      fx.detectChanges();
      expect(fx.componentInstance.keys()).toEqual([]);
      expect(fx.componentInstance.isLoading()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Create form toggling + field setters
  // ---------------------------------------------------------------------------

  describe('create form', () => {
    it('should reset the form when toggling closed after opening', () => {
      component.toggleCreateForm(); // open
      component.newKeyName.set('Draft');
      component.newKeyEnv.set('live');
      component.toggleCreateForm(); // close -> reset
      expect(component.showCreateForm()).toBe(false);
      expect(component.newKeyName()).toBe('');
      expect(component.newKeyEnv()).toBe('test');
      expect(component.isCreating()).toBe(false);
    });

    it('should render the create form when open', () => {
      component.toggleCreateForm();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="create-key-form"]')).toBeTruthy();
      // create button now reads "cancel"
      const btn = el.querySelector('[data-testid="btn-create-key"]');
      expect(btn?.textContent?.trim()).toBe('settings.api_keys.cancel');
    });

    it('should update name via onNameInput', () => {
      component.onNameInput('My API Key');
      expect(component.newKeyName()).toBe('My API Key');
    });

    it('should update environment via onEnvChange', () => {
      component.onEnvChange('live');
      expect(component.newKeyEnv()).toBe('live');
    });

    it('should not allow create when name is only whitespace', () => {
      component.newKeyName.set('   ');
      expect(component.canCreate()).toBe(false);
    });

    it('should not allow create while creating', () => {
      component.newKeyName.set('Valid');
      component.isCreating.set(true);
      expect(component.canCreate()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Create key
  // ---------------------------------------------------------------------------

  describe('createKey', () => {
    it('should no-op when trimmed name is empty', () => {
      component.newKeyName.set('  ');
      component.createKey();
      expect(mockBff.post).not.toHaveBeenCalled();
    });

    it('should POST trimmed name + selected environment', () => {
      component.newKeyName.set('  Prod Key  ');
      component.newKeyEnv.set('live');
      component.createKey();
      expect(mockBff.post).toHaveBeenCalledWith('/api/v1/iam/api-keys', {
        name: 'Prod Key',
        environment: 'live',
      });
    });

    it('should show created key, hide form, reload, and toast on success', () => {
      mockBff.get.mockClear();
      component.toggleCreateForm();
      component.newKeyName.set('New Key');
      component.createKey();

      expect(component.createdKeyValue()).toBe('full-key-value');
      expect(component.copied()).toBe(false);
      expect(component.showCreateForm()).toBe(false);
      expect(component.isCreating()).toBe(false);
      // reload triggered
      expect(mockBff.get).toHaveBeenCalledWith('/api/v1/iam/api-keys');
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.created', 'success');
    });

    it('should render the created-key banner after success', () => {
      component.newKeyName.set('New Key');
      component.createKey();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const banner = el.querySelector('[data-testid="created-key-banner"]');
      expect(banner).toBeTruthy();
      expect(
        el.querySelector('[data-testid="created-key-value"]')?.textContent?.trim(),
      ).toBe('full-key-value');
    });

    it('should stop creating and toast on create error', () => {
      mockBff.post.mockReturnValueOnce(throwError(() => new Error('400')));
      component.newKeyName.set('New Key');
      component.createKey();
      expect(component.isCreating()).toBe(false);
      expect(component.createdKeyValue()).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.create_error', 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Dismiss + copy
  // ---------------------------------------------------------------------------

  describe('created key banner actions', () => {
    it('should clear created key value and copied flag on dismiss', () => {
      component.createdKeyValue.set('full-key-value');
      component.copied.set(true);
      component.dismissCreatedKey();
      expect(component.createdKeyValue()).toBeNull();
      expect(component.copied()).toBe(false);
    });

    it('should no-op copyKey when no created key', async () => {
      component.createdKeyValue.set(null);
      await component.copyKey();
      expect(mockToast.show).not.toHaveBeenCalled();
      expect(component.copied()).toBe(false);
    });

    it('should copy key to clipboard and toast on success', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      component.createdKeyValue.set('full-key-value');
      await component.copyKey();
      expect(writeText).toHaveBeenCalledWith('full-key-value');
      expect(component.copied()).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.copied', 'success');
    });

    it('should toast error when clipboard write fails', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      component.createdKeyValue.set('full-key-value');
      await component.copyKey();
      expect(component.copied()).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.copy_error', 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Revoke key
  // ---------------------------------------------------------------------------

  describe('revokeKey', () => {
    const activeKey = {
      id: 'key-001',
      name: 'Test Key',
      prefix: 'chora_test_abc',
      environment: 'test' as const,
      status: 'active' as const,
      created_at: '2026-03-01T00:00:00Z',
      last_used_at: null,
    };

    it('should ask for confirmation with danger variant', async () => {
      await component.revokeKey(activeKey);
      expect(mockConfirmDialog.confirm).toHaveBeenCalledWith({
        title: 'settings.api_keys.revoke_title',
        message: 'settings.api_keys.revoke_message',
        confirmText: 'settings.api_keys.revoke_confirm',
        variant: 'danger',
      });
    });

    it('should not call delete when confirmation is declined', async () => {
      mockConfirmDialog.confirm.mockResolvedValueOnce(false);
      await component.revokeKey(activeKey);
      expect(mockBff.delete).not.toHaveBeenCalled();
    });

    it('should DELETE the key and mark it revoked in-place on success', async () => {
      component.keys.set([{ ...activeKey }]);
      await component.revokeKey(activeKey);
      expect(mockBff.delete).toHaveBeenCalledWith('/api/v1/iam/api-keys/key-001');
      expect(component.keys()[0].status).toBe('revoked');
      expect(component.revokingId()).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.revoked', 'success');
    });

    it('should leave other keys untouched when revoking one', async () => {
      const other = { ...activeKey, id: 'key-999', name: 'Other' };
      component.keys.set([{ ...activeKey }, other]);
      await component.revokeKey(activeKey);
      expect(component.keys().find((k) => k.id === 'key-999')?.status).toBe('active');
    });

    it('should clear revokingId and toast on delete error', async () => {
      mockBff.delete.mockReturnValueOnce(throwError(() => new Error('500')));
      component.keys.set([{ ...activeKey }]);
      await component.revokeKey(activeKey);
      expect(component.revokingId()).toBeNull();
      expect(component.keys()[0].status).toBe('active');
      expect(mockToast.show).toHaveBeenCalledWith('settings.api_keys.revoke_error', 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  describe('helpers', () => {
    it('should format null date as dash', () => {
      expect(component.formatDate(null)).toBe('-');
    });

    it('should format a valid iso date string', () => {
      const out = component.formatDate('2026-03-01T00:00:00Z');
      expect(out).not.toBe('-');
      expect(out.length).toBeGreaterThan(0);
    });

    it('should return the raw string when date is unparseable', () => {
      // toLocaleDateString on Invalid Date does not throw -> yields "Invalid Date"
      const out = component.formatDate('not-a-date');
      expect(typeof out).toBe('string');
    });

    it('should build status badge class', () => {
      expect(component.statusClass('active')).toBe('api-keys__status-badge--active');
      expect(component.statusClass('revoked')).toBe('api-keys__status-badge--revoked');
    });

    it('should build env badge class', () => {
      expect(component.envClass('test')).toBe('api-keys__env-badge--test');
      expect(component.envClass('live')).toBe('api-keys__env-badge--live');
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  it('should unsubscribe on destroy without error', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
