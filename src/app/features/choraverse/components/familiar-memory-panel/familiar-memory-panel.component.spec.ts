import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { throwError } from 'rxjs';
import { FamiliarMemoryPanelComponent } from './familiar-memory-panel.component';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import type { MemoryEntry } from '../../models/familiar-chat.model';

describe('FamiliarMemoryPanelComponent', () => {
  let component: FamiliarMemoryPanelComponent;
  let fixture: ComponentFixture<FamiliarMemoryPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarMemoryPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarMemoryPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="familiar-memory-panel"]');
    expect(el).toBeTruthy();
  });

  it('should start with empty entries', () => {
    expect(component.entries()).toEqual([]);
  });

  it('should compute sourceClass correctly', () => {
    expect(component.sourceClass('chat')).toBe('familiar-memory-panel__source--chat');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Branch-coverage augmentation: drives the uncovered conditional arms.
// ---------------------------------------------------------------------------

const MEMORY_URL = 'https://api.chora.site/api/v1/familiar/memory';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'entry-1',
    content: 'Asked about photosynthesis',
    source: 'conversation',
    relevance_score: 88,
    created_at: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

describe('FamiliarMemoryPanelComponent (branch coverage)', () => {
  let fixture: ComponentFixture<FamiliarMemoryPanelComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let service: FamiliarChatService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarMemoryPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(FamiliarChatService);
    fixture = TestBed.createComponent(FamiliarMemoryPanelComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ngOnInit fires loadMemory() -> status 'loading' then flushes the GET.
  function flushLoad(body: MemoryEntry[]): void {
    fixture.detectChanges(); // triggers ngOnInit
    const req = httpMock.expectOne(MEMORY_URL);
    expect(req.request.method).toBe('GET');
    req.flush(body);
    fixture.detectChanges();
  }

  // --- entries() ternary: success arm (truthy) + non-empty @for loop arm ---
  it('entries() returns the loaded entries when the load succeeds (ternary true)', () => {
    const e = makeEntry();
    flushLoad([e]);
    expect(fixture.componentInstance.entries()).toEqual([e]);
    expect(element.querySelector('[data-testid="memory-list"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="memory-entry-entry-1"]')).toBeTruthy();
  });

  // --- entries() ternary: NON-success arm (falsy -> []) while loading ---
  it('entries() returns [] while the load is still pending (ternary false)', () => {
    fixture.detectChanges(); // ngOnInit -> status 'loading', not yet flushed
    expect(fixture.componentInstance.entries()).toEqual([]);
    expect(element.querySelector('[data-testid="memory-loading"]')).toBeTruthy();
    // resolve so afterEach verify() is clean
    httpMock.expectOne(MEMORY_URL).flush([]);
  });

  // --- isEmpty() &&: success + length === 0 -> true (empty state + empty @for arm) ---
  it('isEmpty() is true and renders the empty state for zero entries', () => {
    flushLoad([]);
    expect(fixture.componentInstance.isEmpty()).toBe(true);
    expect(element.querySelector('[data-testid="memory-empty"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="memory-list"]')).toBeNull();
  });

  // --- isEmpty() &&: success + length > 0 -> right operand false ---
  it('isEmpty() is false when the load returns entries', () => {
    flushLoad([makeEntry()]);
    expect(fixture.componentInstance.isEmpty()).toBe(false);
    expect(element.querySelector('[data-testid="memory-empty"]')).toBeNull();
  });

  // --- isEmpty() &&: NON-success -> left operand false (short-circuit) ---
  it('isEmpty() short-circuits to false on load error (status !== success)', () => {
    fixture.detectChanges(); // ngOnInit
    httpMock.expectOne(MEMORY_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.isEmpty()).toBe(false);
    expect(fixture.componentInstance.entries()).toEqual([]);
    expect(element.querySelector('[data-testid="memory-error"]')).toBeTruthy();
  });

  // --- clearMemory(): confirmed FALSE -> early-return guard (no DELETE) ---
  it('clearMemory() returns early when the confirm dialog is dismissed', async () => {
    flushLoad([makeEntry()]);
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(false);

    await fixture.componentInstance.clearMemory();

    httpMock.expectNone(MEMORY_URL); // early return => no DELETE
    expect(fixture.componentInstance.entries().length).toBe(1);
  });

  // --- clearMemory(): confirmed TRUE + DELETE success -> next callback ---
  it('clearMemory() clears entries and shows success toast on confirm + success', async () => {
    flushLoad([makeEntry()]);
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
    const showSpy = vi.spyOn(
      (
        fixture.componentInstance as unknown as {
          toast: { show: (m: string, t: string) => void };
        }
      ).toast,
      'show',
    );

    await fixture.componentInstance.clearMemory();

    const del = httpMock.expectOne(MEMORY_URL);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    fixture.detectChanges();

    expect(showSpy).toHaveBeenCalledWith('choraverse.familiar_memory.cleared', 'success');
    expect(fixture.componentInstance.entries()).toEqual([]);
    expect(fixture.componentInstance.isEmpty()).toBe(true);
  });

  // --- clearMemory(): confirmed TRUE + observable errors -> error callback ---
  it('clearMemory() shows the error toast when the clear observable errors', async () => {
    flushLoad([makeEntry()]);
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
    // The real service swallows errors via catchError; force the error arm of the
    // component subscribe by making clearMemory() emit an error directly.
    vi.spyOn(service, 'clearMemory').mockReturnValue(throwError(() => new Error('clear failed')));
    const showSpy = vi.spyOn(
      (
        fixture.componentInstance as unknown as {
          toast: { show: (m: string, t: string) => void };
        }
      ).toast,
      'show',
    );

    await fixture.componentInstance.clearMemory();

    expect(showSpy).toHaveBeenCalledWith('choraverse.familiar_memory.clear_error', 'error');
    httpMock.expectNone(MEMORY_URL); // clearMemory() was stubbed, no real DELETE
  });

  // --- sourceClass(): characterize per source (string interpolation) ---
  it('sourceClass() builds the BEM modifier for each source value', () => {
    flushLoad([]);
    const cmp = fixture.componentInstance;
    expect(cmp.sourceClass('conversation')).toBe('familiar-memory-panel__source--conversation');
    expect(cmp.sourceClass('assessment')).toBe('familiar-memory-panel__source--assessment');
  });

  // --- ngOnDestroy(): unsubscribes without error ---
  it('ngOnDestroy() tears down subscriptions cleanly', () => {
    flushLoad([makeEntry()]);
    expect(() => fixture.destroy()).not.toThrow();
  });
});
