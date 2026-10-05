import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { EmailTemplateEditorComponent } from './email-template-editor.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { EmailTemplate, TemplateVariable } from '../../models/communication.model';

// Absolute URL: BffClientService prepends environment.bffBaseUrl.
const TEMPLATES_URL = 'https://api.chora.site/api/v1/communication/email-templates';

function makeVariable(over: Partial<TemplateVariable> = {}): TemplateVariable {
  return {
    name: 'first_name',
    description: 'Learner first name',
    example_value: 'Ada',
    ...over,
  };
}

function makeTemplate(over: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: 'tpl-1',
    name: 'Welcome Email',
    subject: 'Welcome, {{first_name}}!',
    body_html: '<p>Hello {{first_name}}</p>',
    variables: [makeVariable()],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-02T08:30:00Z',
    ...over,
  };
}

describe('EmailTemplateEditorComponent', () => {
  let component: EmailTemplateEditorComponent;
  let fixture: ComponentFixture<EmailTemplateEditorComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailTemplateEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailTemplateEditorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  // ---------------------------------------------------------------------------
  // Pre-existing tests (kept verbatim)
  // ---------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="email-template-editor"]');
    expect(el).toBeTruthy();
  });

  it('should start with no selected template', () => {
    expect(component.selectedTemplateId()).toBeNull();
    expect(component.selectedTemplate()).toBeNull();
  });

  it('should toggle preview', () => {
    expect(component.showPreview()).toBe(false);
    component.togglePreview();
    expect(component.showPreview()).toBe(true);
    component.togglePreview();
    expect(component.showPreview()).toBe(false);
  });

  it('should update editSubject and editBodyHtml', () => {
    component.onSubjectChange('New Subject');
    expect(component.editSubject()).toBe('New Subject');
    component.onBodyChange('<p>Body</p>');
    expect(component.editBodyHtml()).toBe('<p>Body</p>');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Load on init (GET email-templates)
  // ---------------------------------------------------------------------------

  describe('loadTemplates() on init', () => {
    it('issues a GET to the email-templates path and clears loading on success', () => {
      // Initial detectChanges in beforeEach already triggered ngOnInit -> loadTemplates.
      const req = httpMock.expectOne(TEMPLATES_URL);
      expect(req.request.method).toBe('GET');
      expect(component.loading()).toBe(true);

      const templates = [makeTemplate(), makeTemplate({ id: 'tpl-2', name: 'Reminder' })];
      req.flush(templates);

      expect(component.loading()).toBe(false);
      expect(component.templates().length).toBe(2);
      expect(component.isEmpty()).toBe(false);
    });

    it('keeps existing templates when the response body is null', () => {
      const req = httpMock.expectOne(TEMPLATES_URL);
      req.flush(null);

      expect(component.loading()).toBe(false);
      // null branch skips templates.set -> stays empty array, isEmpty true
      expect(component.templates()).toEqual([]);
      expect(component.isEmpty()).toBe(true);
    });

    it('renders the empty-state when zero templates come back', () => {
      const req = httpMock.expectOne(TEMPLATES_URL);
      req.flush([]);
      fixture.detectChanges();

      expect(component.isEmpty()).toBe(true);
      const empty = fixture.nativeElement.querySelector('[data-testid="templates-empty"]');
      expect(empty).toBeTruthy();
    });

    // NOTE: CommunicationService.loadEmailTemplates() catches HTTP errors and
    // re-emits `of(null)` via the success channel, so the component's `error:`
    // callback (which would toast) is NEVER reached on a load failure. We
    // characterize the actual behavior: loading clears, templates stay empty,
    // NO error toast is shown. (prodBugFlag — see run summary.)
    it('clears loading and shows NO toast on a 5xx (error swallowed by service)', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      const req = httpMock.expectOne(TEMPLATES_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });

      expect(component.loading()).toBe(false);
      expect(component.templates()).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('clears loading and shows NO toast on a 4xx (error swallowed by service)', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      const req = httpMock.expectOne(TEMPLATES_URL);
      req.flush('forbidden', { status: 403, statusText: 'Forbidden' });

      expect(component.loading()).toBe(false);
      expect(component.templates()).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Rendering of the two-panel layout
  // ---------------------------------------------------------------------------

  describe('two-panel rendering', () => {
    function loadOne(tpl = makeTemplate()): void {
      httpMock.expectOne(TEMPLATES_URL).flush([tpl]);
      fixture.detectChanges();
    }

    it('renders the loading skeleton while loading', () => {
      // beforeEach left loading() true with an outstanding request.
      const loadingEl = fixture.nativeElement.querySelector('[data-testid="templates-loading"]');
      expect(loadingEl).toBeTruthy();
      // Drain the request so afterEach.verify is clean.
      httpMock.expectOne(TEMPLATES_URL).flush([]);
    });

    it('renders the template list with a row per template', () => {
      loadOne();
      const list = fixture.nativeElement.querySelector('[data-testid="template-list"]');
      expect(list).toBeTruthy();
      const row = fixture.nativeElement.querySelector('[data-testid="template-tpl-1"]');
      expect(row).toBeTruthy();
      expect(row.textContent).toContain('Welcome Email');
    });

    it('shows the editor placeholder before any template is selected', () => {
      loadOne();
      const placeholder = fixture.nativeElement.querySelector('[data-testid="editor-placeholder"]');
      expect(placeholder).toBeTruthy();
      const editor = fixture.nativeElement.querySelector('[data-testid="template-editor"]');
      expect(editor).toBeFalsy();
    });

    it('renders the editor with subject + body + variable toolbar after selecting', () => {
      loadOne();
      component.selectTemplate('tpl-1');
      fixture.detectChanges();

      const editor = fixture.nativeElement.querySelector('[data-testid="template-editor"]');
      expect(editor).toBeTruthy();

      const subject = fixture.nativeElement.querySelector(
        '[data-testid="input-subject"]',
      ) as HTMLInputElement;
      expect(subject.value).toBe('Welcome, {{first_name}}!');

      const body = fixture.nativeElement.querySelector(
        '[data-testid="textarea-body"]',
      ) as HTMLTextAreaElement;
      expect(body.value).toBe('<p>Hello {{first_name}}</p>');

      const toolbar = fixture.nativeElement.querySelector('[data-testid="variable-toolbar"]');
      expect(toolbar).toBeTruthy();
      const varBtn = fixture.nativeElement.querySelector('[data-testid="var-first_name"]');
      expect(varBtn).toBeTruthy();
    });

    it('hides the variable toolbar when the template has no variables', () => {
      loadOne(makeTemplate({ variables: [] }));
      component.selectTemplate('tpl-1');
      fixture.detectChanges();

      const toolbar = fixture.nativeElement.querySelector('[data-testid="variable-toolbar"]');
      expect(toolbar).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // Selection + computed signals
  // ---------------------------------------------------------------------------

  describe('selection + computed', () => {
    beforeEach(() => {
      httpMock
        .expectOne(TEMPLATES_URL)
        .flush([
          makeTemplate(),
          makeTemplate({
            id: 'tpl-2',
            name: 'Reminder',
            subject: 'Hi',
            body_html: 'Body 2',
            variables: [],
          }),
        ]);
      fixture.detectChanges();
    });

    it('selectTemplate sets the id, subject, body and clears preview', () => {
      component.togglePreview(); // turn preview on first
      expect(component.showPreview()).toBe(true);

      component.selectTemplate('tpl-1');

      expect(component.selectedTemplateId()).toBe('tpl-1');
      expect(component.editSubject()).toBe('Welcome, {{first_name}}!');
      expect(component.editBodyHtml()).toBe('<p>Hello {{first_name}}</p>');
      expect(component.showPreview()).toBe(false);
    });

    it('selectedTemplate resolves the chosen template object', () => {
      component.selectTemplate('tpl-2');
      expect(component.selectedTemplate()?.name).toBe('Reminder');
    });

    it('selectedVariables returns the template variables', () => {
      component.selectTemplate('tpl-1');
      expect(component.selectedVariables().length).toBe(1);
      expect(component.selectedVariables()[0].name).toBe('first_name');
    });

    it('selectedVariables is empty for a variable-less template', () => {
      component.selectTemplate('tpl-2');
      expect(component.selectedVariables()).toEqual([]);
    });

    it('selectTemplate with an unknown id sets the id but leaves edit fields untouched', () => {
      component.onSubjectChange('untouched-subject');
      component.selectTemplate('does-not-exist');
      expect(component.selectedTemplateId()).toBe('does-not-exist');
      expect(component.selectedTemplate()).toBeNull();
      // tpl not found -> edit fields not overwritten
      expect(component.editSubject()).toBe('untouched-subject');
    });

    it('isSelected reflects the current selection', () => {
      expect(component.isSelected('tpl-1')).toBe(false);
      component.selectTemplate('tpl-1');
      expect(component.isSelected('tpl-1')).toBe(true);
      expect(component.isSelected('tpl-2')).toBe(false);
    });

    it('marks the selected list row via aria-selected', () => {
      component.selectTemplate('tpl-1');
      fixture.detectChanges();
      const row = fixture.nativeElement.querySelector('[data-testid="template-tpl-1"]');
      expect(row.getAttribute('aria-selected')).toBe('true');
    });
  });

  // ---------------------------------------------------------------------------
  // previewHtml computed
  // ---------------------------------------------------------------------------

  describe('previewHtml', () => {
    beforeEach(() => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      fixture.detectChanges();
    });

    it('substitutes variable tags with example values', () => {
      component.selectTemplate('tpl-1');
      // body_html = '<p>Hello {{first_name}}</p>', example_value = 'Ada'
      expect(component.previewHtml()).toBe('<p>Hello Ada</p>');
    });

    it('replaces every occurrence of the variable tag (global regex)', () => {
      component.selectTemplate('tpl-1');
      component.onBodyChange('{{first_name}} and {{first_name}}');
      expect(component.previewHtml()).toBe('Ada and Ada');
    });

    it('leaves the body unchanged when there are no variables', () => {
      // No template selected -> selectedVariables empty -> body passthrough.
      component.onBodyChange('<b>raw {{first_name}}</b>');
      expect(component.previewHtml()).toBe('<b>raw {{first_name}}</b>');
    });

    it('renders the preview panel when preview is toggled on', () => {
      component.selectTemplate('tpl-1');
      component.togglePreview();
      fixture.detectChanges();

      const preview = fixture.nativeElement.querySelector('[data-testid="template-preview"]');
      expect(preview).toBeTruthy();
      expect(preview.innerHTML).toContain('Ada');

      // textarea is hidden while previewing
      const body = fixture.nativeElement.querySelector('[data-testid="textarea-body"]');
      expect(body).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // hasChanges computed
  // ---------------------------------------------------------------------------

  describe('hasChanges', () => {
    beforeEach(() => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      fixture.detectChanges();
    });

    it('is false when nothing is selected', () => {
      expect(component.hasChanges()).toBe(false);
    });

    it('is false right after selecting (edit fields match the template)', () => {
      component.selectTemplate('tpl-1');
      expect(component.hasChanges()).toBe(false);
    });

    it('is true after editing the subject', () => {
      component.selectTemplate('tpl-1');
      component.onSubjectChange('Changed subject');
      expect(component.hasChanges()).toBe(true);
    });

    it('is true after editing the body', () => {
      component.selectTemplate('tpl-1');
      component.onBodyChange('<p>New body</p>');
      expect(component.hasChanges()).toBe(true);
    });

    it('disables the save button when there are no changes', () => {
      component.selectTemplate('tpl-1');
      fixture.detectChanges();
      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="btn-save-template"]',
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('enables the save button once a change is made', () => {
      component.selectTemplate('tpl-1');
      component.onSubjectChange('edited');
      fixture.detectChanges();
      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="btn-save-template"]',
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // insertVariable
  // ---------------------------------------------------------------------------

  describe('insertVariable', () => {
    beforeEach(() => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate({ body_html: 'AB' })]);
      fixture.detectChanges();
      component.selectTemplate('tpl-1');
      fixture.detectChanges();
    });

    it('inserts the variable tag at the cursor position', () => {
      const textarea = component.bodyTextarea.nativeElement;
      // Place cursor between A and B.
      textarea.selectionStart = 1;
      textarea.selectionEnd = 1;

      component.insertVariable(makeVariable({ name: 'last_name' }));

      expect(component.editBodyHtml()).toBe('A{{last_name}}B');
    });

    it('replaces the selected range when there is a selection', () => {
      const textarea = component.bodyTextarea.nativeElement;
      // Select "AB" entirely.
      textarea.selectionStart = 0;
      textarea.selectionEnd = 2;

      component.insertVariable(makeVariable({ name: 'x' }));

      expect(component.editBodyHtml()).toBe('{{x}}');
    });

    it('does nothing when the textarea ref is unavailable', () => {
      // Force the textarea ref to be absent (preview mode hides it).
      component.togglePreview();
      fixture.detectChanges();
      const before = component.editBodyHtml();

      // bodyTextarea?.nativeElement is now undefined -> early return.
      expect(() => component.insertVariable(makeVariable())).not.toThrow();
      expect(component.editBodyHtml()).toBe(before);
    });

    it('clicking a variable button inserts its tag', () => {
      const textarea = component.bodyTextarea.nativeElement;
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;

      const varBtn = fixture.nativeElement.querySelector(
        '[data-testid="var-first_name"]',
      ) as HTMLButtonElement;
      varBtn.click();

      expect(component.editBodyHtml()).toContain('{{first_name}}');
    });
  });

  // ---------------------------------------------------------------------------
  // saveTemplate (PUT email-templates/{id})
  // ---------------------------------------------------------------------------

  describe('saveTemplate', () => {
    beforeEach(() => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      fixture.detectChanges();
      component.selectTemplate('tpl-1');
      fixture.detectChanges();
    });

    it('does nothing when there are no changes (no HTTP request)', () => {
      component.saveTemplate();
      httpMock.expectNone(`${TEMPLATES_URL}/tpl-1`);
      expect(component.saving()).toBe(false);
    });

    it('PUTs the edited subject + body and updates state on success', () => {
      component.onSubjectChange('Updated subject');
      component.onBodyChange('<p>Updated body</p>');

      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.saveTemplate();
      expect(component.saving()).toBe(true);

      const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        subject: 'Updated subject',
        body_html: '<p>Updated body</p>',
      });

      const updated = makeTemplate({
        subject: 'Updated subject',
        body_html: '<p>Updated body</p>',
      });
      req.flush(updated);

      expect(component.saving()).toBe(false);
      expect(component.editSubject()).toBe('Updated subject');
      expect(component.editBodyHtml()).toBe('<p>Updated body</p>');
      expect(component.templates()[0].subject).toBe('Updated subject');
      // No changes remain after persisting.
      expect(component.hasChanges()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admin.communication.template_saved', 'success');
    });

    it('shows a save-error toast when the server returns a null body', () => {
      component.onSubjectChange('Edited');
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.saveTemplate();
      const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`);
      req.flush(null);

      expect(component.saving()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admin.communication.template_save_error', 'error');
    });

    it('shows a save-error toast and clears saving on a 500', () => {
      component.onSubjectChange('Edited');
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.saveTemplate();
      const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`);
      req.flush('err', { status: 500, statusText: 'Server Error' });

      expect(component.saving()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admin.communication.template_save_error', 'error');
    });

    it('encodes the template id in the PUT url', () => {
      // Re-seed with a template whose id needs URL-encoding.
      const tpl = makeTemplate({ id: 'tpl/with space' });
      // New load by re-creating selection state via service is overkill; instead
      // assert the encode path directly through the running selection.
      component.templates.set([tpl]);
      component.selectTemplate('tpl/with space');
      component.onSubjectChange('Edited');

      component.saveTemplate();
      const req = httpMock.expectOne(`${TEMPLATES_URL}/${encodeURIComponent('tpl/with space')}`);
      expect(req.request.method).toBe('PUT');
      req.flush(tpl);
    });
  });

  // ---------------------------------------------------------------------------
  // formatDateTime helper
  // ---------------------------------------------------------------------------

  describe('formatDateTime', () => {
    it('formats a valid ISO string to a locale string', () => {
      const out = component.formatDateTime('2026-02-02T08:30:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toBe('2026-02-02T08:30:00Z');
    });

    it('returns the original string for an unparseable input (Invalid Date)', () => {
      // new Date('not-a-date').toLocaleString() === 'Invalid Date' (no throw),
      // so characterize the actual behavior.
      const out = component.formatDateTime('not-a-date');
      expect(out).toBe('Invalid Date');
    });

    it('renders the formatted updated_at in the list row', () => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      fixture.detectChanges();
      const dateEl = fixture.nativeElement.querySelector('.email-template-editor__list-date');
      expect(dateEl?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // togglePreview button label
  // ---------------------------------------------------------------------------

  describe('preview toggle button', () => {
    beforeEach(() => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      fixture.detectChanges();
      component.selectTemplate('tpl-1');
      fixture.detectChanges();
    });

    it('shows the show-preview key when preview is off', () => {
      const btn = fixture.nativeElement.querySelector('[data-testid="btn-toggle-preview"]');
      expect(btn.textContent).toContain('admin.communication.show_preview');
    });

    it('shows the hide-preview key when preview is on', () => {
      component.togglePreview();
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('[data-testid="btn-toggle-preview"]');
      expect(btn.textContent).toContain('admin.communication.hide_preview');
    });

    it('clicking the toggle button flips showPreview', () => {
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="btn-toggle-preview"]',
      ) as HTMLButtonElement;
      expect(component.showPreview()).toBe(false);
      btn.click();
      expect(component.showPreview()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // ngOnDestroy
  // ---------------------------------------------------------------------------

  describe('ngOnDestroy', () => {
    it('unsubscribes without throwing', () => {
      httpMock.expectOne(TEMPLATES_URL).flush([makeTemplate()]);
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  afterEach(() => {
    // Tests that don't exercise HTTP (e.g. the shell/render checks) leave the
    // ngOnInit GET outstanding. Drain any leftover requests so verify() is clean
    // without forcing every characterization test to flush.
    for (const req of httpMock.match(() => true)) {
      req.flush([]);
    }
    httpMock.verify();
  });
});
