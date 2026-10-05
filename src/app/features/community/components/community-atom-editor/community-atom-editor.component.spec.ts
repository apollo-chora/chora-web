import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CommunityAtomEditorComponent } from './community-atom-editor.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

const DRAFT_URL = `${environment.bffBaseUrl}/api/v1/community/drafts/current`;
const ATOMS_URL = `${environment.bffBaseUrl}/api/v1/community/atoms`;

function inputEvent(value: string): Event {
  const target = document.createElement('input');
  target.value = value;
  return { target, preventDefault: () => {}, stopPropagation: () => {} } as unknown as Event;
}

function selectEvent(value: string): Event {
  // A bare value object — a real <select> without a matching <option> would
  // refuse to hold an arbitrary .value, so model the target directly.
  return { target: { value } } as unknown as Event;
}

describe('CommunityAtomEditorComponent', () => {
  let fixture: ComponentFixture<CommunityAtomEditorComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: CommunityAtomEditorComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CommunityAtomEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(CommunityAtomEditorComponent);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Helper: trigger ngOnInit + flush the draft GET, then settle.
  function initWith(
    draft:
      | { title: string; content: string; atom_type: string; tags: string[] }
      | null,
  ): void {
    fixture.detectChanges(); // runs ngOnInit → loadDraft GET
    httpMock.expectOne(DRAFT_URL).flush(draft);
    fixture.detectChanges();
  }

  function initWithError(): void {
    fixture.detectChanges();
    httpMock
      .expectOne(DRAFT_URL)
      .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
  }

  describe('shell render', () => {
    it('creates the component', () => {
      initWith(null);
      expect(component).toBeTruthy();
    });

    it('renders the root with data-testid + community-atom-editor class', () => {
      initWith(null);
      const root = element.querySelector('[data-testid="community-atom-editor"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('community-atom-editor');
    });

    it('renders the contribute title using the raw i18n key', () => {
      initWith(null);
      const title = element.querySelector('[data-testid="contribute-title"]');
      expect(title?.textContent?.trim()).toBe('community.contribute.title');
    });

    it('renders all four atom-type options in the select', () => {
      initWith(null);
      const options = element.querySelectorAll(
        '[data-testid="atom-type-select"] option',
      );
      expect(options.length).toBe(4);
    });

    it('renders the submit button (disabled with empty form)', () => {
      initWith(null);
      const submit = element.querySelector(
        '[data-testid="submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit).not.toBeNull();
      expect(submit.disabled).toBe(true);
    });

    it('hides the autosave indicator until a draft is saved', () => {
      initWith(null);
      const autosave = element.querySelector('[data-testid="autosave-status"]');
      expect(autosave).toBeNull();
    });
  });

  describe('loadDraft (ngOnInit GET)', () => {
    it('issues a GET to the drafts/current path on init', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(DRAFT_URL);
      expect(req.request.method).toBe('GET');
      req.flush(null);
      fixture.detectChanges();
    });

    it('populates the form fields when a draft is returned', () => {
      initWith({
        title: 'Photosynthesis',
        content: 'Plants convert light to energy.',
        atom_type: 'concept',
        tags: ['biology', 'plants'],
      });

      expect(component.title()).toBe('Photosynthesis');
      expect(component.content()).toBe('Plants convert light to energy.');
      expect(component.selectedType()).toBe('concept');
      expect(component.tags()).toEqual(['biology', 'plants']);
      // NOTE: loadDraft sets isDirty(false), but the dirty-tracking effect()
      // re-runs after the signal writes and flips it back to true — so by the
      // time change detection settles, isDirty is true again. Characterizing
      // the actual settled value rather than the transient false.
      expect(component.isDirty()).toBe(true);

      const titleInput = element.querySelector(
        '[data-testid="atom-title-input"]',
      ) as HTMLInputElement;
      expect(titleInput.value).toBe('Photosynthesis');
    });

    it('falls back to defaults for missing draft fields', () => {
      initWith({
        title: '',
        content: '',
        atom_type: 'factoid',
        tags: [],
      });
      expect(component.title()).toBe('');
      expect(component.selectedType()).toBe('factoid');
      expect(component.tags()).toEqual([]);
    });

    it('keeps an empty form when no draft exists (null body)', () => {
      initWith(null);
      expect(component.title()).toBe('');
      expect(component.content()).toBe('');
      expect(component.selectedType()).toBe('factoid');
    });

    it('starts fresh on a draft fetch error (4xx)', () => {
      initWithError();
      expect(component.title()).toBe('');
      expect(component.content()).toBe('');
      // error handler does not throw — component still alive
      expect(component).toBeTruthy();
    });
  });

  describe('form input handlers', () => {
    beforeEach(() => initWith(null));

    it('onTitleInput updates the title signal', () => {
      component.onTitleInput(inputEvent('My Atom'));
      expect(component.title()).toBe('My Atom');
    });

    it('onContentInput updates the content signal', () => {
      component.onContentInput(inputEvent('Some body text'));
      expect(component.content()).toBe('Some body text');
    });

    it('onTypeChange updates the selectedType signal', () => {
      component.onTypeChange(selectEvent('procedure'));
      expect(component.selectedType()).toBe('procedure');
    });
  });

  describe('tags', () => {
    beforeEach(() => initWith(null));

    it('addTag appends a trimmed lower-cased tag and clears the input', () => {
      component.onTagInputChange(inputEvent('  Biology  '));
      component.addTag();
      expect(component.tags()).toEqual(['biology']);
      expect(component.tagInput()).toBe('');
    });

    it('addTag ignores duplicate tags', () => {
      component.tagInput.set('math');
      component.addTag();
      component.tagInput.set('math');
      component.addTag();
      expect(component.tags()).toEqual(['math']);
    });

    it('addTag ignores an empty/whitespace tag', () => {
      component.tagInput.set('   ');
      component.addTag();
      expect(component.tags()).toEqual([]);
    });

    it('removeTag removes the named tag', () => {
      component.tags.set(['a', 'b', 'c']);
      component.removeTag('b');
      expect(component.tags()).toEqual(['a', 'c']);
    });

    it('onTagInputKeydown adds a tag on Enter and prevents default', () => {
      component.tagInput.set('science');
      let prevented = false;
      const evt = {
        key: 'Enter',
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as KeyboardEvent;
      component.onTagInputKeydown(evt);
      expect(prevented).toBe(true);
      expect(component.tags()).toEqual(['science']);
    });

    it('onTagInputKeydown adds a tag on comma', () => {
      component.tagInput.set('history');
      const evt = {
        key: ',',
        preventDefault: () => {},
      } as unknown as KeyboardEvent;
      component.onTagInputKeydown(evt);
      expect(component.tags()).toEqual(['history']);
    });

    it('onTagInputKeydown does nothing on a non-trigger key', () => {
      component.tagInput.set('ignore');
      const evt = {
        key: 'a',
        preventDefault: () => {},
      } as unknown as KeyboardEvent;
      component.onTagInputKeydown(evt);
      expect(component.tags()).toEqual([]);
    });

    it('renders a chip per tag in the template', () => {
      component.tags.set(['alpha', 'beta']);
      fixture.detectChanges();
      const chips = element.querySelectorAll('[data-testid="atom-tag"]');
      expect(chips.length).toBe(2);
      expect(chips[0].textContent).toContain('alpha');
    });

    it('trackByTag returns the tag itself', () => {
      expect(component.trackByTag(0, 'foo')).toBe('foo');
    });
  });

  describe('media files', () => {
    beforeEach(() => initWith(null));

    function fakeFile(name: string, size: number): File {
      const f = new File(['x'], name, { type: 'image/png' });
      Object.defineProperty(f, 'size', { value: size });
      return f;
    }

    it('onFileSelect adds selected files', () => {
      const files = [fakeFile('a.png', 100)] as unknown as FileList;
      Object.defineProperty(files, 'length', { value: 1 });
      Object.defineProperty(files, '0', { value: files[0 as unknown as number] });
      const list = {
        0: fakeFile('a.png', 100),
        length: 1,
      } as unknown as FileList;
      const target = { files: list } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      expect(component.mediaFiles().length).toBe(1);
      expect(component.mediaFiles()[0].name).toBe('a.png');
    });

    it('onFileSelect does nothing when no files are present', () => {
      const target = { files: null } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      expect(component.mediaFiles().length).toBe(0);
    });

    it('removeFile removes the file at the given index', () => {
      component.mediaFiles.set([fakeFile('a.png', 1), fakeFile('b.png', 2)]);
      component.removeFile(0);
      expect(component.mediaFiles().length).toBe(1);
      expect(component.mediaFiles()[0].name).toBe('b.png');
    });

    it('renders the file list when files are present', () => {
      component.mediaFiles.set([fakeFile('doc.pdf', 2048)]);
      fixture.detectChanges();
      const fileList = element.querySelector('[data-testid="file-list"]');
      expect(fileList).not.toBeNull();
      expect(fileList?.textContent).toContain('doc.pdf');
    });

    it('trackByFileIndex returns the index', () => {
      expect(component.trackByFileIndex(3)).toBe(3);
    });
  });

  describe('drag-drop', () => {
    beforeEach(() => initWith(null));

    function fakeFile(name: string): File {
      return new File(['x'], name, { type: 'image/png' });
    }

    it('onDragOver sets isDragOver true', () => {
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as DragEvent;
      component.onDragOver(evt);
      expect(component.isDragOver()).toBe(true);
    });

    it('onDragLeave sets isDragOver false', () => {
      component.isDragOver.set(true);
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as DragEvent;
      component.onDragLeave(evt);
      expect(component.isDragOver()).toBe(false);
    });

    it('onDrop adds dropped files and clears isDragOver', () => {
      component.isDragOver.set(true);
      const list = { 0: fakeFile('drop.png'), length: 1 } as unknown as FileList;
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
        dataTransfer: { files: list },
      } as unknown as DragEvent;
      component.onDrop(evt);
      expect(component.isDragOver()).toBe(false);
      expect(component.mediaFiles().length).toBe(1);
    });

    it('onDrop with no files just clears isDragOver', () => {
      component.isDragOver.set(true);
      const empty = { length: 0 } as unknown as FileList;
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
        dataTransfer: { files: empty },
      } as unknown as DragEvent;
      component.onDrop(evt);
      expect(component.isDragOver()).toBe(false);
      expect(component.mediaFiles().length).toBe(0);
    });
  });

  describe('canSubmit', () => {
    beforeEach(() => initWith(null));

    it('is false when title and content are empty', () => {
      expect(component.canSubmit()).toBe(false);
    });

    it('is false with only a title', () => {
      component.title.set('Just a title');
      expect(component.canSubmit()).toBe(false);
    });

    it('is true when both title and content are non-empty', () => {
      component.title.set('Title');
      component.content.set('Content');
      expect(component.canSubmit()).toBe(true);
    });

    it('is false while submitting', () => {
      component.title.set('Title');
      component.content.set('Content');
      component.submitState.set({ status: 'submitting' });
      expect(component.canSubmit()).toBe(false);
    });

    it('enables the submit button once title + content present', () => {
      component.title.set('Title');
      component.content.set('Content');
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => initWith(null));

    it('does nothing (no POST) when the form is not submittable', () => {
      component.onSubmit();
      // no outstanding request — afterEach verify() asserts none
      expect(component.submitState().status).toBe('idle');
    });

    it('POSTs the trimmed payload and reports success', () => {
      component.title.set('  Newton  ');
      component.content.set('  F = ma  ');
      component.selectedType.set('principle');
      component.tags.set(['physics']);
      component.onSubmit();

      expect(component.submitState().status).toBe('submitting');

      const req = httpMock.expectOne(ATOMS_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        title: 'Newton',
        content: 'F = ma',
        atom_type: 'principle',
        tags: ['physics'],
      });
      req.flush({ id: 'atom-123' }, { status: 201, statusText: 'Created' });

      expect(component.submitState().status).toBe('success');
    });

    it('shows the success message and a success toast, and resets the form', () => {
      const toast = TestBed.inject(ToastService);
      component.title.set('Title');
      component.content.set('Body');
      component.tags.set(['t']);
      component.onSubmit();

      httpMock
        .expectOne(ATOMS_URL)
        .flush({ id: 'atom-1' }, { status: 201, statusText: 'Created' });
      fixture.detectChanges();

      // form reset to defaults
      expect(component.title()).toBe('');
      expect(component.content()).toBe('');
      expect(component.selectedType()).toBe('factoid');
      expect(component.tags()).toEqual([]);

      // success banner rendered
      const success = element.querySelector('[data-testid="submit-success"]');
      expect(success).not.toBeNull();

      // success toast queued
      const last = toast.toasts()[toast.toasts().length - 1];
      expect(last.message).toBe('community.atom_submitted');
      expect(last.type).toBe('success');
    });

    it('captures the error and queues an error toast on a failed POST', () => {
      const toast = TestBed.inject(ToastService);
      component.title.set('Title');
      component.content.set('Body');
      component.onSubmit();

      httpMock
        .expectOne(ATOMS_URL)
        .flush(
          { error: 'server boom' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(component.submitState().status).toBe('error');
      if (component.submitState().status === 'error') {
        expect(
          (component.submitState() as { status: 'error'; error: string }).error,
        ).toBeTruthy();
      }

      const last = toast.toasts()[toast.toasts().length - 1];
      expect(last.message).toBe('community.atom_submit_error');
      expect(last.type).toBe('error');
    });
  });

  describe('formatFileSize', () => {
    beforeEach(() => initWith(null));

    it('formats bytes', () => {
      expect(component.formatFileSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(component.formatFileSize(2048)).toBe('2.0 KB');
    });

    it('formats megabytes', () => {
      expect(component.formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without error', () => {
      initWith(null);
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Branch-coverage augmentation — arms not yet exercised above.
  // ---------------------------------------------------------------------------

  describe('onDrop edge: null dataTransfer (optional-chain nullish arm)', () => {
    beforeEach(() => initWith(null));

    it('adds no files when dataTransfer is null', () => {
      component.isDragOver.set(true);
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
        dataTransfer: null,
      } as unknown as DragEvent;
      component.onDrop(evt);
      // optional chain `event.dataTransfer?.files` is undefined → guard FALSE
      expect(component.isDragOver()).toBe(false);
      expect(component.mediaFiles().length).toBe(0);
    });
  });

  describe('auto-save interval (startAutoSave + saveDraft)', () => {
    // The interval callback's `if (this.isDirty() && this.content().trim()...)`
    // and the entire saveDraft PUT path are only reachable by advancing the
    // 30s timer. Use fakeAsync + tick; the source uses interval() (a timer).

    it('saves a draft when dirty and content is present (both && arms true)', fakeAsync(() => {
      fixture.detectChanges(); // ngOnInit: loadDraft GET + startAutoSave interval
      httpMock.expectOne(DRAFT_URL).flush(null); // resolve loadDraft GET

      component.content.set('a real body');
      component.isDirty.set(true);

      tick(30_000); // advance interval → callback fires → saveDraft()

      const put = httpMock.expectOne(DRAFT_URL);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({
        title: component.title(),
        content: 'a real body',
        atom_type: component.selectedType(),
        tags: component.tags(),
      });
      put.flush(null); // saveDraft next arm

      expect(component.autoSaveState()).toBe('saved');
      expect(component.isDirty()).toBe(false);
      expect(component.lastSavedAt()).not.toBeNull();

      fixture.destroy(); // stop the interval so no further ticks are pending
    }));

    it('sets autoSaveState to error when the PUT fails (saveDraft error arm)', fakeAsync(() => {
      fixture.detectChanges();
      httpMock.expectOne(DRAFT_URL).flush(null);

      component.content.set('content to save');
      component.isDirty.set(true);

      tick(30_000);

      httpMock
        .expectOne(DRAFT_URL)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(component.autoSaveState()).toBe('error');

      fixture.destroy();
    }));

    it('does NOT save when not dirty (first && arm false)', fakeAsync(() => {
      // The dirty-tracking effect() re-runs on any title/content/type/tags
      // write and flips isDirty back to true (characterized at loadDraft test
      // above). So content is supplied via the loaded draft, and isDirty is
      // set false as the LAST write — no tracked signal changes after it, so
      // the effect does not re-run before the interval fires.
      fixture.detectChanges();
      httpMock.expectOne(DRAFT_URL).flush({
        title: 'T',
        content: 'present body',
        atom_type: 'factoid',
        tags: [],
      });

      // Flush the effect once so its post-load re-run (isDirty→true) happens
      // now, THEN force isDirty false with no further tracked-signal writes.
      tick(0);
      component.isDirty.set(false);

      tick(30_000);

      // No PUT should fire; afterEach verify() also asserts none outstanding.
      httpMock.expectNone(DRAFT_URL);
      expect(component.autoSaveState()).toBe('idle');

      fixture.destroy();
    }));

    it('does NOT save when content is empty even if dirty (second && arm false)', fakeAsync(() => {
      fixture.detectChanges();
      httpMock.expectOne(DRAFT_URL).flush(null);

      component.content.set('   '); // whitespace only → trim().length === 0
      component.isDirty.set(true);

      tick(30_000);

      httpMock.expectNone(DRAFT_URL);
      expect(component.autoSaveState()).toBe('idle');

      fixture.destroy();
    }));
  });
});
