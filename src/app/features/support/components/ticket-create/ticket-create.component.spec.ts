import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { TicketCreateComponent } from './ticket-create.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { Ticket } from '../../models/support.model';

const BASE_URL = 'https://api.chora.site';
const TICKETS_URL = `${BASE_URL}/api/v1/support/tickets`;

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'tk-1',
    tenant_id: 't-1',
    creator_gcid: 'g-1',
    assigned_agent_gcid: null,
    subject: 'Login broken',
    description: 'cannot log in',
    status: 'open',
    priority: 'medium',
    category: 'general',
    tags: [],
    escalation_count: 0,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-06-04T00:00:00Z',
    updated_at: '2026-06-04T00:00:00Z',
    ...overrides,
  };
}

describe('TicketCreateComponent', () => {
  let component: TicketCreateComponent;
  let fixture: ComponentFixture<TicketCreateComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketCreateComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketCreateComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="ticket-create"]');
    expect(el).toBeTruthy();
  });

  it('should have ticket form', () => {
    const form = fixture.nativeElement.querySelector('[data-testid="ticket-form"]');
    expect(form).toBeTruthy();
  });

  it('should have category select', () => {
    const select = fixture.nativeElement.querySelector('[data-testid="select-category"]');
    expect(select).toBeTruthy();
  });

  it('should have priority select', () => {
    const select = fixture.nativeElement.querySelector('[data-testid="select-priority"]');
    expect(select).toBeTruthy();
  });

  it('should have subject input', () => {
    const input = fixture.nativeElement.querySelector('[data-testid="input-subject"]');
    expect(input).toBeTruthy();
  });

  it('should have description textarea', () => {
    const textarea = fixture.nativeElement.querySelector('[data-testid="input-description"]');
    expect(textarea).toBeTruthy();
  });

  it('should have attachment area', () => {
    const area = fixture.nativeElement.querySelector('[data-testid="attachment-area"]');
    expect(area).toBeTruthy();
  });

  it('should update subject', () => {
    component.updateSubject('Test subject');
    expect(component.subject()).toBe('Test subject');
  });

  it('should update description', () => {
    component.updateDescription('Test description');
    expect(component.description()).toBe('Test description');
  });

  it('should update category', () => {
    component.updateCategory('billing');
    expect(component.category()).toBe('billing');
  });

  it('should update priority', () => {
    component.updatePriority('high');
    expect(component.priority()).toBe('high');
  });

  it('should compute isValid correctly', () => {
    expect(component.isValid()).toBe(false);

    component.updateSubject('Something');
    expect(component.isValid()).toBe(true);

    component.updateSubject('   ');
    expect(component.isValid()).toBe(false);
  });

  it('should compute canSubmit correctly', () => {
    expect(component.canSubmit()).toBe(false);

    component.updateSubject('Something');
    expect(component.canSubmit()).toBe(true);
  });

  it('should not submit when canSubmit is false', () => {
    component.submit();
    expect(component.submitting()).toBe(false);
  });

  it('should remove attachment by index', () => {
    const file1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const file2 = new File(['b'], 'b.txt', { type: 'text/plain' });
    component.attachments.set([file1, file2]);
    expect(component.attachmentCount()).toBe(2);

    component.removeAttachment(0);
    expect(component.attachmentCount()).toBe(1);
    expect(component.attachments()[0].name).toBe('b.txt');
  });

  it('should format file size correctly', () => {
    expect(component.formatFileSize(500)).toBe('500 B');
    expect(component.formatFileSize(1500)).toBe('1.5 KB');
    expect(component.formatFileSize(1500000)).toBe('1.4 MB');
  });

  it('should have submit and cancel buttons', () => {
    const submit = fixture.nativeElement.querySelector('[data-testid="btn-submit"]');
    const cancel = fixture.nativeElement.querySelector('[data-testid="btn-cancel"]');
    expect(submit).toBeTruthy();
    expect(cancel).toBeTruthy();
  });

  it('should disable submit when form is invalid', () => {
    const submit = fixture.nativeElement.querySelector(
      '[data-testid="btn-submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Header / shell render
  // -------------------------------------------------------------------------

  it('should render header title and subtitle', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="create-title"]');
    const subtitle = fixture.nativeElement.querySelector('[data-testid="create-subtitle"]');
    expect(title).toBeTruthy();
    expect(subtitle).toBeTruthy();
  });

  it('should render an option per category and priority', () => {
    const catOptions = fixture.nativeElement.querySelectorAll(
      '[data-testid="select-category"] option',
    );
    const priOptions = fixture.nativeElement.querySelectorAll(
      '[data-testid="select-priority"] option',
    );
    expect(catOptions.length).toBe(component.allCategories.length);
    expect(priOptions.length).toBe(component.allPriorities.length);
  });

  it('should default category=general and priority=medium', () => {
    expect(component.category()).toBe('general');
    expect(component.priority()).toBe('medium');
  });

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  it('addAttachments should no-op on null', () => {
    component.addAttachments(null);
    expect(component.attachmentCount()).toBe(0);
  });

  it('addAttachments should append files from a FileList-like object', () => {
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['bb'], 'b.txt', { type: 'text/plain' });
    component.addAttachments([f1, f2] as unknown as FileList);
    expect(component.attachmentCount()).toBe(2);

    const f3 = new File(['ccc'], 'c.txt', { type: 'text/plain' });
    component.addAttachments([f3] as unknown as FileList);
    expect(component.attachmentCount()).toBe(3);
    expect(component.attachments().map((f) => f.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('should render attachment list when files present', () => {
    const f1 = new File(['a'], 'doc.pdf', { type: 'application/pdf' });
    component.attachments.set([f1]);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[data-testid="attachment-list"]');
    expect(list).toBeTruthy();
    const items = fixture.nativeElement.querySelectorAll('[data-testid="attachment-item"]');
    expect(items.length).toBe(1);
    expect((list as HTMLElement).textContent).toContain('doc.pdf');
  });

  it('should not render attachment list when empty', () => {
    const list = fixture.nativeElement.querySelector('[data-testid="attachment-list"]');
    expect(list).toBeFalsy();
  });

  it('trackAttachment should key by name and size', () => {
    const f = new File(['hello'], 'note.txt', { type: 'text/plain' });
    expect(component.trackAttachment(0, f)).toBe(`note.txt-${f.size}`);
  });

  it('removeAttachment with out-of-range index keeps list intact', () => {
    const f1 = new File(['a'], 'a.txt');
    component.attachments.set([f1]);
    component.removeAttachment(5);
    expect(component.attachmentCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // formatFileSize boundaries
  // -------------------------------------------------------------------------

  it('formatFileSize should handle byte/KB/MB boundaries', () => {
    expect(component.formatFileSize(0)).toBe('0 B');
    expect(component.formatFileSize(1023)).toBe('1023 B');
    expect(component.formatFileSize(1024)).toBe('1.0 KB');
    expect(component.formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  // -------------------------------------------------------------------------
  // submit() — success path
  // -------------------------------------------------------------------------

  it('submit should POST trimmed payload, toast success and navigate on success', () => {
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    const toastSpy = vi.spyOn(toast, 'show');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateSubject('  Need help  ');
    component.updateDescription('  details here  ');
    component.updateCategory('billing');
    component.updatePriority('high');

    component.submit();
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(TICKETS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      subject: 'Need help',
      description: 'details here',
      category: 'billing',
      priority: 'high',
    });

    req.flush(makeTicket({ id: 'tk-99' }));

    expect(component.submitting()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('support.ticket_created', 'success');
    expect(navSpy).toHaveBeenCalledWith(['/support', 'tickets', 'tk-99']);
  });

  it('submit should send undefined description when blank', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateSubject('Hi');
    component.updateDescription('   ');
    component.submit();

    const req = httpMock.expectOne(TICKETS_URL);
    expect(req.request.body.description).toBeUndefined();
    req.flush(makeTicket());
  });

  // -------------------------------------------------------------------------
  // submit() — error path (service catches and returns null)
  // -------------------------------------------------------------------------

  it('submit should toast error and not navigate when service yields null on 500', () => {
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    const toastSpy = vi.spyOn(toast, 'show');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateSubject('Broken');
    component.submit();
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(TICKETS_URL);
    req.flush('boom', { status: 500, statusText: 'Server Error' });

    // service catchError emits of(null) -> next() runs with ticket=null
    expect(component.submitting()).toBe(false);
    expect(navSpy).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalledWith('support.ticket_created', 'success');
  });

  it('submit should do nothing when form invalid', () => {
    component.submit();
    expect(component.submitting()).toBe(false);
    httpMock.expectNone(TICKETS_URL);
  });

  it('submit should be a no-op while already submitting', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateSubject('Hi');
    component.submit();
    const req = httpMock.expectOne(TICKETS_URL); // first submit fired
    expect(component.submitting()).toBe(true);

    // canSubmit() is now false because submitting() === true -> second submit no-ops
    component.submit();

    // resolve the single outstanding request to satisfy verify()
    req.flush(makeTicket());
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // cancel()
  // -------------------------------------------------------------------------

  it('cancel should navigate back to ticket list', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.cancel();
    expect(navSpy).toHaveBeenCalledWith(['/support', 'tickets']);
  });

  it('clicking cancel button should navigate to ticket list', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="btn-cancel"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(navSpy).toHaveBeenCalledWith(['/support', 'tickets']);
  });

  // -------------------------------------------------------------------------
  // submit button enablement reflects state
  // -------------------------------------------------------------------------

  it('submit button should enable once subject is set', () => {
    component.updateSubject('A valid subject');
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector(
      '[data-testid="btn-submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
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
