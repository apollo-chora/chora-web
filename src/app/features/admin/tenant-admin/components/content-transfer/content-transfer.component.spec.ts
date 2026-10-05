import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import {
  ContentTransferComponent,
  TransferableContent,
  TransferRecipient,
  ContentTransferRequest,
} from './content-transfer.component';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

const CONTENT_PATH = '/api/v1/content/authored';
const USERS_SEARCH_PATH = '/api/v1/tenants/members/search';
const TRANSFER_PATH = '/api/v1/content/transfer';

function buildContent(overrides: Partial<TransferableContent> = {}): TransferableContent {
  return {
    id: 'atom-1',
    title: 'Introduction to Biology',
    content_type: 'atom',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function buildRecipient(overrides: Partial<TransferRecipient> = {}): TransferRecipient {
  return {
    gcid: 'gcid-user-1',
    display_name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'learner',
    is_active: true,
    ...overrides,
  };
}

function buildTransferRequest(
  overrides: Partial<ContentTransferRequest> = {},
): ContentTransferRequest {
  return {
    id: 'transfer-1',
    content_ids: ['atom-1'],
    source_gcid: 'gcid-source',
    target_gcid: 'gcid-user-1',
    status: 'pending',
    created_at: '2026-03-15T00:00:00Z',
    ...overrides,
  };
}

describe('ContentTransferComponent', () => {
  let component: ContentTransferComponent;
  let fixture: ComponentFixture<ContentTransferComponent>;
  let bff: BffClientService;
  let toast: ToastService;

  const atom = buildContent();
  const topic = buildContent({
    id: 'topic-1',
    title: 'Chemistry Lab',
    content_type: 'topic',
  });
  const path = buildContent({
    id: 'path-1',
    title: 'Physics Path',
    content_type: 'path',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ContentTransferComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    bff = TestBed.inject(BffClientService);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function createFixture(): void {
    fixture = TestBed.createComponent(ContentTransferComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // -------------------------------------------------------------------------
  // Rendering & initial load
  // -------------------------------------------------------------------------

  it('creates the component and shows the wizard title', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    expect(component).toBeTruthy();
    const title = fixture.nativeElement.querySelector('[data-testid="content-transfer-title"]');
    expect(title).toBeTruthy();
    expect(component.step()).toBe(1);
  });

  it('loads authored content on init', () => {
    const getSpy = vi.spyOn(bff, 'get').mockReturnValue(of({ data: [atom, topic] }));
    createFixture();
    expect(getSpy).toHaveBeenCalledWith(CONTENT_PATH);
    expect(component.contentItems()).toEqual([atom, topic]);
    expect(component.loadingContent()).toBe(false);
  });

  it('shows a toast when authored content fails to load', () => {
    vi.spyOn(bff, 'get').mockReturnValue(throwError(() => new Error('boom')));
    const toastSpy = vi.spyOn(toast, 'show');
    createFixture();
    expect(toastSpy).toHaveBeenCalledWith('content_transfer.load_error', 'error');
    expect(component.loadingContent()).toBe(false);
    expect(component.contentItems()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Step 1: content filtering & selection
  // -------------------------------------------------------------------------

  it('filters content by search query and content type', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    component.contentItems.set([atom, topic, path]);

    // No query, no filter → everything
    expect(component.filteredContent().length).toBe(3);

    // Query matches titles case-insensitively with trimming
    component.onContentSearch('  biology  ');
    expect(component.filteredContent()).toEqual([atom]);

    // Type filter narrows further
    component.onContentSearch('');
    component.onContentTypeFilter('path');
    expect(component.filteredContent()).toEqual([path]);

    // Query + type filter combined
    component.onContentSearch('chem');
    component.onContentTypeFilter('topic');
    expect(component.filteredContent()).toEqual([topic]);
    component.onContentSearch('chem');
    component.onContentTypeFilter('path');
    expect(component.filteredContent()).toEqual([]);
  });

  it('tracks selected items and derived selection state', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    component.contentItems.set([atom, topic, path]);

    expect(component.selectedCount()).toBe(0);
    expect(component.hasSelection()).toBe(false);
    expect(component.isSelected(atom.id)).toBe(false);
    expect(component.selectedItems()).toEqual([]);

    component.toggleItem(atom.id);
    component.toggleItem(topic.id);
    expect(component.isSelected(atom.id)).toBe(true);
    expect(component.selectedCount()).toBe(2);
    expect(component.hasSelection()).toBe(true);
    expect(component.selectedItems()).toEqual([atom, topic]);

    // Toggling again removes the item
    component.toggleItem(atom.id);
    expect(component.isSelected(atom.id)).toBe(false);
    expect(component.selectedCount()).toBe(1);
  });

  it('selects all filtered content and deselects everything', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    component.contentItems.set([atom, topic, path]);

    component.selectAll();
    expect(component.selectedCount()).toBe(3);

    // selectAll only applies to what the current filter shows
    component.onContentSearch('chemistry');
    component.deselectAll();
    component.selectAll();
    expect(component.selectedItems()).toEqual([topic]);

    component.deselectAll();
    expect(component.selectedCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  it('computes navigation guards per step', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();

    // Step 1 requires a selection
    expect(component.canGoNext()).toBe(false);
    component.toggleItem(atom.id);
    expect(component.canGoNext()).toBe(true);
    expect(component.canGoBack()).toBe(false);
    expect(component.isLastStep()).toBe(false);

    // Step 2 requires a recipient
    component.nextStep();
    expect(component.canGoNext()).toBe(false);
    expect(component.canGoBack()).toBe(true);
    component.selectRecipient(buildRecipient());
    expect(component.hasRecipient()).toBe(true);
    expect(component.canGoNext()).toBe(true);

    // Step 3 never proceeds forward
    component.nextStep();
    expect(component.isLastStep()).toBe(true);
    expect(component.canGoNext()).toBe(false);
  });

  it('only advances when the current step allows it', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();

    // Blocked without a selection
    expect(component.canGoNext()).toBe(false);
    component.nextStep();
    expect(component.step()).toBe(1);

    // Blocked on step 2 without a recipient
    component.toggleItem(atom.id);
    component.nextStep();
    expect(component.step()).toBe(2);
    component.nextStep();
    expect(component.step()).toBe(2);

    // Advances once a recipient is chosen
    component.selectRecipient(buildRecipient());
    component.nextStep();
    expect(component.step()).toBe(3);

    // Never leaves the last step
    component.nextStep();
    expect(component.step()).toBe(3);
  });

  it('navigates backwards one step at a time', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    component.step.set(3);
    component.previousStep();
    expect(component.step()).toBe(2);
    component.previousStep();
    expect(component.step()).toBe(1);
    component.previousStep();
    expect(component.step()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Step 2: recipient search
  // -------------------------------------------------------------------------

  it('clears recipient results for short search terms', () => {
    const getSpy = vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture(); // one request from the init load
    component.searchResults.set([buildRecipient()]);

    component.onRecipientSearch('j');

    expect(component.searchResults()).toEqual([]);
    expect(component.searchingUsers()).toBe(false);
    expect(getSpy).toHaveBeenCalledTimes(1); // no search request fired
  });

  it('searches users and keeps only active accounts', () => {
    const active = buildRecipient();
    const inactive = buildRecipient({
      gcid: 'gcid-inactive',
      is_active: false,
    });
    const getSpy = vi.spyOn(bff, 'get').mockImplementation((path: string) =>
      path.startsWith(USERS_SEARCH_PATH)
        ? of({ data: [active, inactive] })
        : of({ data: [] }),
    );
    createFixture();

    component.onRecipientSearch('Jane Doe');

    expect(getSpy).toHaveBeenCalledWith(
      `${USERS_SEARCH_PATH}?q=${encodeURIComponent('Jane Doe')}`,
    );
    expect(component.searchResults()).toEqual([active]); // inactive filtered out
    expect(component.searchingUsers()).toBe(false);
  });

  it('clears recipient results when the search fails', () => {
    vi.spyOn(bff, 'get').mockImplementation((path: string) => {
      if (path.startsWith(USERS_SEARCH_PATH)) {
        return throwError(() => new Error('boom'));
      }
      return of({ data: [] });
    });
    createFixture();

    component.onRecipientSearch('jane');

    expect(component.searchResults()).toEqual([]);
    expect(component.searchingUsers()).toBe(false);
  });

  it('selects and clears a recipient', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();
    component.searchResults.set([buildRecipient()]);
    component.recipientSearchQuery.set('jane');

    component.selectRecipient(buildRecipient());

    expect(component.selectedRecipient()?.gcid).toBe('gcid-user-1');
    expect(component.searchResults()).toEqual([]);
    expect(component.recipientSearchQuery()).toBe('');

    component.clearRecipient();
    expect(component.selectedRecipient()).toBeNull();
    expect(component.hasRecipient()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Step 3: confirm transfer
  // -------------------------------------------------------------------------

  it('does not transfer without a recipient and selection', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    const postSpy = vi.spyOn(bff, 'post');
    createFixture();

    component.confirmTransfer();
    expect(postSpy).not.toHaveBeenCalled();

    component.selectRecipient(buildRecipient());
    component.confirmTransfer(); // still no content selected
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('confirms the transfer, toasts success and emits the request', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [atom, topic] }));
    const request = buildTransferRequest({ content_ids: ['atom-1', 'topic-1'] });
    const postSpy = vi.spyOn(bff, 'post').mockReturnValue(of(request));
    const toastSpy = vi.spyOn(toast, 'show');
    const emitSpy = vi.fn();
    createFixture();
    component.transferred.subscribe(emitSpy);

    component.toggleItem(atom.id);
    component.toggleItem(topic.id);
    component.selectRecipient(buildRecipient());
    component.confirmTransfer();

    expect(postSpy).toHaveBeenCalledWith(TRANSFER_PATH, {
      content_ids: ['atom-1', 'topic-1'],
      target_gcid: 'gcid-user-1',
    });
    expect(toastSpy).toHaveBeenCalledWith('content_transfer.success', 'success');
    expect(component.submitting()).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(request);
  });

  it('shows an error toast when the transfer fails', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [atom] }));
    vi.spyOn(bff, 'post').mockReturnValue(throwError(() => new Error('boom')));
    const toastSpy = vi.spyOn(toast, 'show');
    createFixture();

    component.toggleItem(atom.id);
    component.selectRecipient(buildRecipient());
    component.confirmTransfer();

    expect(toastSpy).toHaveBeenCalledWith('content_transfer.error', 'error');
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  it('renders content type labels and icons', () => {
    vi.spyOn(bff, 'get').mockReturnValue(of({ data: [] }));
    createFixture();

    expect(component.contentTypeLabel('atom')).toBe('content_transfer.type_atom');
    expect(component.contentTypeIcon('atom')).toBe('science');
    expect(component.contentTypeIcon('topic')).toBe('category');
    expect(component.contentTypeIcon('path')).toBe('route');
    expect(component.contentTypeIcon('unknown' as never)).toBe('description');
  });
}, 30_000);