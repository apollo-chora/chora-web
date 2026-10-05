import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { NotificationArchiveComponent } from './notification-archive.component';
import { BffClientService } from '../../../../core/services/bff-client.service';

describe('NotificationArchiveComponent', () => {
  let fixture: ComponentFixture<NotificationArchiveComponent>;
  let component: NotificationArchiveComponent;

  const mockResponse = {
    items: [
      {
        id: 'notif-001',
        title: 'Streak Milestone',
        body: 'You reached a 7-day streak!',
        priority: 'normal' as const,
        category: 'engagement' as const,
        status: 'delivered' as const,
        is_read: false,
        created_at: '2026-03-12T10:00:00Z',
      },
    ],
    next_cursor: null,
  };

  const mockBff = {
    get: vi.fn().mockReturnValue(of(mockResponse)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBff.get.mockReturnValue(of(mockResponse));

    await TestBed.configureTestingModule({
      imports: [NotificationArchiveComponent],
      providers: [
        { provide: BffClientService, useValue: mockBff },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationArchiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load notifications on init', () => {
    expect(mockBff.get).toHaveBeenCalled();
    expect(component.notifications().length).toBe(1);
  });

  it('should compute hasMore based on next_cursor', () => {
    expect(component.hasMore()).toBe(false);
  });

  it('should compute isEmpty when no notifications and not loading', () => {
    component.notifications.set([]);
    component.loading.set(false);
    expect(component.isEmpty()).toBe(true);
  });

  it('should update search query signal', () => {
    component.onSearchInput('test query');
    expect(component.searchQuery()).toBe('test query');
  });

  it('should reset notifications on search', () => {
    component.notifications.set(mockResponse.items as never[]);
    mockBff.get.mockClear();
    component.search();
    expect(mockBff.get).toHaveBeenCalled();
  });

  // ---- Initial load / shell render ----

  it('should request the archive path with limit on init', () => {
    const [path, params] = mockBff.get.mock.calls[0];
    expect(path).toBe('/api/v1/notifications/archive');
    expect(params).toBeInstanceOf(HttpParams);
    expect((params as HttpParams).get('limit')).toBe('20');
  });

  it('should clear loading after a successful load', () => {
    expect(component.loading()).toBe(false);
  });

  it('should render the archive shell with the title and export button', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="notification-archive"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="export-csv"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="archive-filters"]')).toBeTruthy();
  });

  it('should render a table row for each loaded notification', () => {
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('[data-testid="archive-row"]');
    expect(rows.length).toBe(1);
    expect(el.textContent).toContain('Streak Milestone');
    expect(el.textContent).toContain('You reached a 7-day streak!');
  });

  it('should render every category option plus the all-categories placeholder', () => {
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('[data-testid="archive-category"]') as HTMLSelectElement;
    // 7 categories + 1 "all" placeholder
    expect(select.querySelectorAll('option').length).toBe(component.allCategories.length + 1);
  });

  it('should render every priority option plus the all-priorities placeholder', () => {
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('[data-testid="archive-priority"]') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length).toBe(component.allPriorities.length + 1);
  });

  // ---- Empty state ----

  it('should render the empty state when load returns no items', async () => {
    mockBff.get.mockReturnValue(of({ items: [], next_cursor: null }));
    component.search();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="archive-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="archive-table"]')).toBeNull();
    expect(component.isEmpty()).toBe(true);
  });

  it('should disable export button when empty', () => {
    mockBff.get.mockReturnValue(of({ items: [], next_cursor: null }));
    component.search();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const exportBtn = el.querySelector('[data-testid="export-csv"]') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
  });

  // ---- Pagination / loadMore ----

  it('should expose hasMore when a next_cursor is returned', () => {
    mockBff.get.mockReturnValue(of({ items: mockResponse.items, next_cursor: 'cursor-2' }));
    component.search();
    expect(component.hasMore()).toBe(true);
    expect(component.nextCursor()).toBe('cursor-2');
  });

  it('should render the load-more button when there are more pages', () => {
    mockBff.get.mockReturnValue(of({ items: mockResponse.items, next_cursor: 'cursor-2' }));
    component.search();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="archive-load-more"]')).toBeTruthy();
  });

  it('should append the next page items on loadMore', () => {
    mockBff.get.mockReturnValue(of({ items: mockResponse.items, next_cursor: 'cursor-2' }));
    component.search();
    expect(component.notifications().length).toBe(1);

    mockBff.get.mockReturnValue(
      of({
        items: [{ ...mockResponse.items[0], id: 'notif-002', title: 'Page Two' }],
        next_cursor: null,
      }),
    );
    component.loadMore();

    expect(component.notifications().length).toBe(2);
    expect(component.notifications()[1].id).toBe('notif-002');
    expect(component.hasMore()).toBe(false);
  });

  it('should pass the cursor param when loading a subsequent page', () => {
    mockBff.get.mockReturnValue(of({ items: mockResponse.items, next_cursor: 'cursor-99' }));
    component.search();

    mockBff.get.mockClear();
    mockBff.get.mockReturnValue(of({ items: [], next_cursor: null }));
    component.loadMore();

    const params = mockBff.get.mock.calls[0][1] as HttpParams;
    expect(params.get('cursor')).toBe('cursor-99');
  });

  it('should not loadMore when there is no next cursor', () => {
    // initial load returned next_cursor null -> hasMore false
    expect(component.hasMore()).toBe(false);
    mockBff.get.mockClear();
    component.loadMore();
    expect(mockBff.get).not.toHaveBeenCalled();
  });

  it('should not loadMore while a load is already in flight', () => {
    mockBff.get.mockReturnValue(of({ items: mockResponse.items, next_cursor: 'cursor-x' }));
    component.search();
    // simulate in-flight by forcing loading true
    component.loading.set(true);
    mockBff.get.mockClear();
    component.loadMore();
    expect(mockBff.get).not.toHaveBeenCalled();
  });

  // ---- Filter signal setters + param wiring ----

  it('should update the date-from signal', () => {
    component.onDateFromChange('2026-01-01');
    expect(component.dateFrom()).toBe('2026-01-01');
  });

  it('should update the date-to signal', () => {
    component.onDateToChange('2026-12-31');
    expect(component.dateTo()).toBe('2026-12-31');
  });

  it('should update the selected category signal', () => {
    component.onCategoryChange('assessment');
    expect(component.selectedCategory()).toBe('assessment');
  });

  it('should update the selected priority signal', () => {
    component.onPriorityChange('high');
    expect(component.selectedPriority()).toBe('high');
  });

  it('should include every active filter in the request params', () => {
    component.onSearchInput('streak');
    component.onDateFromChange('2026-01-01');
    component.onDateToChange('2026-12-31');
    component.onCategoryChange('engagement');
    component.onPriorityChange('normal');

    mockBff.get.mockClear();
    mockBff.get.mockReturnValue(of(mockResponse));
    component.search();

    const params = mockBff.get.mock.calls[0][1] as HttpParams;
    expect(params.get('q')).toBe('streak');
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-12-31');
    expect(params.get('category')).toBe('engagement');
    expect(params.get('priority')).toBe('normal');
    expect(params.get('limit')).toBe('20');
  });

  it('should omit optional filter params when filters are empty', () => {
    mockBff.get.mockClear();
    mockBff.get.mockReturnValue(of(mockResponse));
    component.search();
    const params = mockBff.get.mock.calls[0][1] as HttpParams;
    expect(params.has('q')).toBe(false);
    expect(params.has('from')).toBe(false);
    expect(params.has('to')).toBe(false);
    expect(params.has('category')).toBe(false);
    expect(params.has('priority')).toBe(false);
    expect(params.has('cursor')).toBe(false);
  });

  // ---- Load error path ----

  it('should clear loading on a load error', () => {
    mockBff.get.mockReturnValue(throwError(() => new Error('500 server error')));
    component.search();
    expect(component.loading()).toBe(false);
  });

  it('should keep notifications empty on a load error', () => {
    mockBff.get.mockReturnValue(throwError(() => ({ status: 503 })));
    component.search();
    expect(component.notifications().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
  });

  // ---- CSV export ----

  it('should export CSV requesting up to 1000 items', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const revokeUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    mockBff.get.mockClear();
    mockBff.get.mockReturnValue(of(mockResponse));
    component.exportCsv();

    const [path, params] = mockBff.get.mock.calls[0];
    expect(path).toBe('/api/v1/notifications/archive');
    expect((params as HttpParams).get('limit')).toBe('1000');
    expect(clickSpy).toHaveBeenCalled();
    expect(component.exporting()).toBe(false);

    clickSpy.mockRestore();
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('should CSV-escape titles/bodies containing commas, quotes and newlines', () => {
    const blobSpy = vi.fn();
    const originalBlob = globalThis.Blob;
    // capture the CSV text passed to the Blob constructor
    (globalThis as unknown as { Blob: unknown }).Blob = function (
      this: unknown,
      parts: string[],
    ) {
      blobSpy(parts);
      return new originalBlob(parts as BlobPart[]);
    } as unknown as typeof Blob;

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const revokeUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    mockBff.get.mockClear();
    mockBff.get.mockReturnValue(
      of({
        items: [
          {
            id: 'notif-csv',
            title: 'Hello, "World"',
            body: 'line1\nline2',
            priority: 'high',
            category: 'social',
            status: 'read',
            is_read: true,
            created_at: '2026-04-01T00:00:00Z',
          },
        ],
        next_cursor: null,
      }),
    );
    component.exportCsv();

    const csvText = (blobSpy.mock.calls[0][0] as string[])[0];
    // comma + quote in title -> wrapped + doubled quotes
    expect(csvText).toContain('"Hello, ""World"""');
    // newline in body -> wrapped in quotes
    expect(csvText).toContain('"line1\nline2"');
    // is_read true -> Yes
    expect(csvText).toContain('Yes');

    (globalThis as unknown as { Blob: unknown }).Blob = originalBlob;
    clickSpy.mockRestore();
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('should reset exporting flag on a CSV export error', () => {
    mockBff.get.mockReturnValue(throwError(() => new Error('export failed')));
    component.exportCsv();
    expect(component.exporting()).toBe(false);
  });

  // ---- trackById ----

  it('should track rows by id', () => {
    expect(component.trackById(0, mockResponse.items[0] as never)).toBe('notif-001');
  });
});
