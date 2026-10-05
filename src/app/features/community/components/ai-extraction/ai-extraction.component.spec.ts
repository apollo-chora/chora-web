import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AiExtractionComponent } from './ai-extraction.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

const EXTRACT_URL = `${environment.bffBaseUrl}/api/v1/community/ai/extract`;
const BULK_URL = `${environment.bffBaseUrl}/api/v1/community/atoms/bulk`;

interface CandidateStub {
  id: string;
  title: string;
  content: string;
  atom_type: string;
  confidence: number;
  tags: string[];
}

const STUB_CANDIDATES: readonly CandidateStub[] = [
  {
    id: 'cand-1',
    title: 'Photosynthesis Basics',
    content: 'Plants convert light into chemical energy.',
    atom_type: 'concept',
    confidence: 92,
    tags: ['biology', 'energy'],
  },
  {
    id: 'cand-2',
    title: 'Cellular Respiration',
    content: 'Cells release energy stored in glucose.',
    atom_type: 'concept',
    confidence: 64,
    tags: ['biology'],
  },
  {
    id: 'cand-3',
    title: 'Mitochondria',
    content: 'The powerhouse of the cell.',
    atom_type: 'fact',
    confidence: 40,
    tags: [],
  },
];

const DOCUMENT_PREVIEW = 'Source document text preview...';

function build(): {
  fixture: ComponentFixture<AiExtractionComponent>;
  httpMock: HttpTestingController;
  component: AiExtractionComponent;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [AiExtractionComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(AiExtractionComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    httpMock,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

/**
 * Drives the component from idle → success by invoking onFileSelect with a
 * synthetic file input event, then flushing the extract POST with stub data.
 */
function driveToSuccess(
  component: AiExtractionComponent,
  httpMock: HttpTestingController,
  fixture: ComponentFixture<AiExtractionComponent>,
  candidates: readonly CandidateStub[] = STUB_CANDIDATES,
): void {
  const file = new File(['hello'], 'doc.txt', { type: 'text/plain' });
  const fileList = {
    0: file,
    length: 1,
    item: (i: number) => (i === 0 ? file : null),
  } as unknown as FileList;
  const target = { files: fileList } as unknown as HTMLInputElement;
  component.onFileSelect({ target } as unknown as Event);
  fixture.detectChanges();

  httpMock.expectOne(EXTRACT_URL).flush({
    candidates,
    document_preview: DOCUMENT_PREVIEW,
  });
  fixture.detectChanges();
}

describe('AiExtractionComponent', () => {
  let fixture: ComponentFixture<AiExtractionComponent>;
  let httpMock: HttpTestingController;
  let component: AiExtractionComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = build();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell + idle state', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root section with the ai-extraction data-testid', () => {
      const root = element.querySelector('[data-testid="ai-extraction"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('ai-extraction');
    });

    it('renders the title using the raw i18n key', () => {
      const title = element.querySelector('[data-testid="extraction-title"]');
      expect(title?.textContent?.trim()).toBe('community.extraction.title');
    });

    it('starts in the idle state showing the dropzone', () => {
      expect(component.extractionState().status).toBe('idle');
      expect(
        element.querySelector('[data-testid="extraction-dropzone"]'),
      ).not.toBeNull();
    });

    it('renders the file input in idle state', () => {
      expect(
        element.querySelector('[data-testid="extraction-file-input"]'),
      ).not.toBeNull();
    });

    it('does not render processing/error/results panels while idle', () => {
      expect(
        element.querySelector('[data-testid="extraction-processing"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="extraction-error"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="candidates-panel"]'),
      ).toBeNull();
    });
  });

  describe('drag-and-drop interactions', () => {
    // jsdom does not implement DragEvent/DataTransfer, so the handlers are
    // exercised directly with minimal event-shaped stubs (preventDefault /
    // stopPropagation / dataTransfer.files). This characterizes the same
    // observable behavior as a real drag event.
    function fakeDragEvent(files?: File[]): DragEvent {
      const fileList =
        files === undefined
          ? undefined
          : ({
              ...files,
              length: files.length,
              item: (i: number) => files[i] ?? null,
            } as unknown as FileList);
      return {
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
        dataTransfer: fileList ? { files: fileList } : undefined,
      } as unknown as DragEvent;
    }

    it('sets isDragOver true on dragover and toggles the active class', () => {
      component.onDragOver(fakeDragEvent());
      fixture.detectChanges();

      expect(component.isDragOver()).toBe(true);
      const dropzone = element.querySelector(
        '[data-testid="extraction-dropzone"]',
      ) as HTMLElement;
      expect(
        dropzone.classList.contains('ai-extraction__dropzone--active'),
      ).toBe(true);
    });

    it('clears isDragOver on dragleave', () => {
      component.isDragOver.set(true);
      component.onDragLeave(fakeDragEvent());
      fixture.detectChanges();

      expect(component.isDragOver()).toBe(false);
    });

    it('starts extraction on drop with files (POSTs to the extract endpoint)', () => {
      const file = new File(['x'], 'dropped.txt', { type: 'text/plain' });
      component.onDrop(fakeDragEvent([file]));
      fixture.detectChanges();

      expect(component.selectedFile()).toBe(file);
      expect(component.extractionState().status).toBe('uploading');
      const req = httpMock.expectOne(EXTRACT_URL);
      expect(req.request.method).toBe('POST');
      req.flush({ candidates: [], document_preview: '' });
    });

    it('does nothing on drop when there are no files', () => {
      component.onDrop(fakeDragEvent([]));
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('idle');
      expect(component.isDragOver()).toBe(false);
      // No HTTP fired — afterEach verify() asserts no outstanding requests.
    });
  });

  describe('file select → uploading state', () => {
    it('transitions to uploading and shows the processing panel', () => {
      const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
      const fileList = {
        0: file,
        length: 1,
        item: () => file,
      } as unknown as FileList;
      const target = { files: fileList } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('uploading');
      const processing = element.querySelector(
        '[data-testid="extraction-processing"]',
      );
      expect(processing).not.toBeNull();
      expect(processing?.textContent?.trim()).toBe(
        'community.extraction.uploading',
      );

      httpMock.expectOne(EXTRACT_URL).flush({
        candidates: [],
        document_preview: '',
      });
    });

    it('ignores a file-select event with no files', () => {
      const target = { files: null } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      fixture.detectChanges();
      expect(component.extractionState().status).toBe('idle');
    });
  });

  describe('extraction success path', () => {
    beforeEach(() => {
      driveToSuccess(component, httpMock, fixture);
    });

    it('moves to the success state with mapped pending candidates', () => {
      const state = component.extractionState();
      expect(state.status).toBe('success');
      expect(component.candidates().length).toBe(3);
      // Every candidate is mapped to status 'pending' on success.
      expect(component.candidates().every((c) => c.status === 'pending')).toBe(
        true,
      );
    });

    it('renders one candidate card per candidate', () => {
      const cards = element.querySelectorAll(
        '[data-testid="candidate-card"]',
      );
      expect(cards.length).toBe(3);
    });

    it('renders the document preview in the source panel', () => {
      const panel = element.querySelector('[data-testid="source-panel"]');
      expect(panel?.textContent).toContain(DOCUMENT_PREVIEW);
      expect(component.documentPreview()).toBe(DOCUMENT_PREVIEW);
    });

    it('shows the candidate count in the candidates panel header', () => {
      const panel = element.querySelector('[data-testid="candidates-panel"]');
      expect(panel?.textContent).toContain('(3)');
    });

    it('renders confidence values with computed confidence classes', () => {
      const badges = element.querySelectorAll(
        '[data-testid="candidate-confidence"]',
      );
      expect(badges.length).toBe(3);
      // 92 → high, 64 → medium, 40 → low (matches getConfidenceClass).
      expect(badges[0].className).toContain('ai-extraction__confidence--high');
      expect(badges[1].className).toContain(
        'ai-extraction__confidence--medium',
      );
      expect(badges[2].className).toContain('ai-extraction__confidence--low');
      expect(badges[0].textContent).toContain('92%');
    });

    it('initially shows all candidates as pending in the stats bar', () => {
      expect(component.acceptedCount()).toBe(0);
      expect(component.rejectedCount()).toBe(0);
      expect(component.pendingCount()).toBe(3);
      const stats = element.querySelector('[data-testid="extraction-stats"]');
      expect(stats?.textContent).toContain('community.extraction.pending');
    });

    it('disables submit-accepted until at least one candidate is accepted', () => {
      const submit = element.querySelector(
        '[data-testid="submit-accepted-btn"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(component.canSubmitAccepted()).toBe(false);
    });
  });

  describe('extraction error path', () => {
    it('moves to the error state on a 500 and renders the error panel', () => {
      const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
      const fileList = {
        0: file,
        length: 1,
        item: () => file,
      } as unknown as FileList;
      const target = { files: fileList } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      fixture.detectChanges();

      httpMock
        .expectOne(EXTRACT_URL)
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Internal Server Error' },
        );
      fixture.detectChanges();

      const state = component.extractionState();
      expect(state.status).toBe('error');
      const errPanel = element.querySelector(
        '[data-testid="extraction-error"]',
      );
      expect(errPanel).not.toBeNull();
      expect(errPanel?.getAttribute('role')).toBe('alert');
    });

    it('returns to idle when the retry button is clicked', () => {
      const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
      const fileList = {
        0: file,
        length: 1,
        item: () => file,
      } as unknown as FileList;
      const target = { files: fileList } as unknown as HTMLInputElement;
      component.onFileSelect({ target } as unknown as Event);
      fixture.detectChanges();

      httpMock
        .expectOne(EXTRACT_URL)
        .flush({}, { status: 422, statusText: 'Unprocessable Entity' });
      fixture.detectChanges();

      const retry = element.querySelector(
        '[data-testid="retry-btn"]',
      ) as HTMLButtonElement;
      retry.click();
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('idle');
      expect(component.selectedFile()).toBeNull();
      expect(
        element.querySelector('[data-testid="extraction-dropzone"]'),
      ).not.toBeNull();
    });
  });

  describe('candidate accept / reject / edit actions', () => {
    beforeEach(() => {
      driveToSuccess(component, httpMock, fixture);
    });

    it('accepts a candidate, bumping acceptedCount and enabling submit', () => {
      component.acceptCandidate('cand-1');
      fixture.detectChanges();

      expect(component.acceptedCount()).toBe(1);
      expect(component.pendingCount()).toBe(2);
      expect(component.canSubmitAccepted()).toBe(true);
      const submit = element.querySelector(
        '[data-testid="submit-accepted-btn"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    it('accepts a candidate via the accept button click', () => {
      const acceptBtn = element.querySelector(
        '[data-testid="accept-btn"]',
      ) as HTMLButtonElement;
      acceptBtn.click();
      fixture.detectChanges();
      expect(component.acceptedCount()).toBe(1);
    });

    it('rejects a candidate, bumping rejectedCount', () => {
      component.rejectCandidate('cand-2');
      fixture.detectChanges();
      expect(component.rejectedCount()).toBe(1);
      expect(component.pendingCount()).toBe(2);
    });

    it('enters editing mode and renders the edit textarea', () => {
      component.startEditCandidate('cand-1');
      fixture.detectChanges();

      const ta = element.querySelector('[data-testid="edit-textarea"]');
      expect(ta).not.toBeNull();
      // editing counts as pending for the stats bar.
      expect(component.pendingCount()).toBe(3);
    });

    it('captures edited content and saveEdit accepts the candidate', () => {
      component.startEditCandidate('cand-1');
      fixture.detectChanges();

      const ta = element.querySelector(
        '[data-testid="edit-textarea"]',
      ) as HTMLTextAreaElement;
      ta.value = 'Revised content';
      ta.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      component.saveEdit('cand-1');
      fixture.detectChanges();

      const saved = component
        .candidates()
        .find((c) => c.id === 'cand-1');
      expect(saved?.status).toBe('accepted');
      expect(saved?.content).toBe('Revised content');
      expect(saved?.edited_content).toBeUndefined();
      expect(component.acceptedCount()).toBe(1);
    });

    it('cancelEdit returns the candidate to pending', () => {
      component.startEditCandidate('cand-1');
      fixture.detectChanges();
      component.cancelEdit('cand-1');
      fixture.detectChanges();

      const c = component.candidates().find((x) => x.id === 'cand-1');
      expect(c?.status).toBe('pending');
    });

    it('onEditContent is a no-op when not in the success state', () => {
      component.onStartOver();
      const target = { value: 'x' } as unknown as HTMLTextAreaElement;
      component.onEditContent('cand-1', { target } as unknown as Event);
      // No throw; state remains idle.
      expect(component.extractionState().status).toBe('idle');
    });
  });

  describe('submit accepted candidates', () => {
    beforeEach(() => {
      driveToSuccess(component, httpMock, fixture);
      component.acceptCandidate('cand-1');
      component.acceptCandidate('cand-2');
      fixture.detectChanges();
    });

    it('POSTs only accepted candidates to the bulk endpoint and removes them on success', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      component.onSubmitAccepted();

      const req = httpMock.expectOne(BULK_URL);
      expect(req.request.method).toBe('POST');
      const body = req.request.body as {
        atoms: Array<{ title: string }>;
      };
      expect(body.atoms.length).toBe(2);
      expect(body.atoms.map((a) => a.title)).toEqual([
        'Photosynthesis Basics',
        'Cellular Respiration',
      ]);
      req.flush({ count: 2 });
      fixture.detectChanges();

      // Accepted ones removed, only the still-pending candidate remains.
      expect(component.candidates().length).toBe(1);
      expect(component.candidates()[0].id).toBe('cand-3');
      expect(showSpy).toHaveBeenCalledWith(
        'community.extraction.submitted',
        'success',
      );
    });

    it('shows an error toast and keeps candidates when the bulk POST fails', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      component.onSubmitAccepted();

      httpMock
        .expectOne(BULK_URL)
        .flush({}, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();

      // Nothing removed on failure.
      expect(component.candidates().length).toBe(3);
      expect(showSpy).toHaveBeenCalledWith(
        'community.extraction.submit-error',
        'error',
      );
    });

    it('onSubmitAccepted is a no-op when nothing is accepted', () => {
      // Reset back to a fresh success with all pending.
      driveToSuccess(component, httpMock, fixture);
      component.onSubmitAccepted();
      // No HTTP fired — afterEach verify() asserts no outstanding requests.
      expect(component.candidates().length).toBe(3);
    });
  });

  describe('getConfidenceClass helper', () => {
    it('returns high at >= 80', () => {
      expect(component.getConfidenceClass(80)).toBe(
        'ai-extraction__confidence--high',
      );
      expect(component.getConfidenceClass(100)).toBe(
        'ai-extraction__confidence--high',
      );
    });

    it('returns medium between 50 and 79', () => {
      expect(component.getConfidenceClass(50)).toBe(
        'ai-extraction__confidence--medium',
      );
      expect(component.getConfidenceClass(79)).toBe(
        'ai-extraction__confidence--medium',
      );
    });

    it('returns low below 50', () => {
      expect(component.getConfidenceClass(49)).toBe(
        'ai-extraction__confidence--low',
      );
      expect(component.getConfidenceClass(0)).toBe(
        'ai-extraction__confidence--low',
      );
    });
  });

  describe('trackByCandidateId + start over', () => {
    it('trackByCandidateId returns the candidate id', () => {
      const candidate = {
        id: 'abc',
        title: 't',
        content: 'c',
        atom_type: 'concept',
        confidence: 1,
        tags: [],
        status: 'pending' as const,
      };
      expect(component.trackByCandidateId(0, candidate)).toBe('abc');
    });

    it('onStartOver resets state to idle and clears the selected file', () => {
      driveToSuccess(component, httpMock, fixture);
      expect(component.extractionState().status).toBe('success');

      component.onStartOver();
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('idle');
      expect(component.selectedFile()).toBeNull();
    });

    it('start-over button click from the results header resets to idle', () => {
      driveToSuccess(component, httpMock, fixture);
      const startOver = element.querySelector(
        '[data-testid="start-over-btn"]',
      ) as HTMLButtonElement;
      startOver.click();
      fixture.detectChanges();
      expect(component.extractionState().status).toBe('idle');
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without error', () => {
      driveToSuccess(component, httpMock, fixture);
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Uncovered-branch characterization (false arms / early-return guards /
  // optional-chain short-circuits / non-success state guards).
  // ---------------------------------------------------------------------------

  describe('uncovered branch coverage', () => {
    it('onDrop with no dataTransfer is a no-op (optional-chain short-circuit)', () => {
      // dataTransfer undefined → event.dataTransfer?.files is undefined →
      // `files && files.length > 0` short-circuits on the nullish left side.
      const dragEvent = {
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
        dataTransfer: undefined,
      } as unknown as DragEvent;

      component.onDrop(dragEvent);
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('idle');
      expect(component.isDragOver()).toBe(false);
      expect(component.selectedFile()).toBeNull();
      // No HTTP fired — afterEach verify() asserts no outstanding requests.
    });

    it('onFileSelect with a present-but-empty file list is a no-op (length === 0 arm)', () => {
      // target.files truthy but length 0 → second predicate `length > 0` false.
      const emptyList = {
        length: 0,
        item: () => null,
      } as unknown as FileList;
      const target = { files: emptyList } as unknown as HTMLInputElement;

      component.onFileSelect({ target } as unknown as Event);
      fixture.detectChanges();

      expect(component.extractionState().status).toBe('idle');
      expect(component.selectedFile()).toBeNull();
    });

    it('documentPreview is the empty string when not in the success state', () => {
      // computed ternary falsy arm — idle from the start.
      expect(component.extractionState().status).toBe('idle');
      expect(component.documentPreview()).toBe('');
    });

    it('updateCandidateStatus guard: acceptCandidate is a no-op while not in success', () => {
      // acceptCandidate → updateCandidateStatus, which early-returns when the
      // state is not 'success'. From idle nothing changes and nothing throws.
      expect(component.extractionState().status).toBe('idle');
      expect(() => component.acceptCandidate('does-not-exist')).not.toThrow();
      expect(component.extractionState().status).toBe('idle');
      expect(component.candidates().length).toBe(0);
    });

    it('saveEdit guard: is a no-op while not in success', () => {
      expect(component.extractionState().status).toBe('idle');
      expect(() => component.saveEdit('does-not-exist')).not.toThrow();
      expect(component.extractionState().status).toBe('idle');
    });

    it('saveEdit without prior edited_content keeps the original content (|| falsy arm)', () => {
      driveToSuccess(component, httpMock, fixture);
      // No startEditCandidate / onEditContent first, so edited_content is
      // undefined → `c.edited_content || c.content` falls through to c.content.
      component.saveEdit('cand-1');
      fixture.detectChanges();

      const saved = component.candidates().find((c) => c.id === 'cand-1');
      expect(saved?.status).toBe('accepted');
      expect(saved?.content).toBe('Plants convert light into chemical energy.');
      expect(saved?.edited_content).toBeUndefined();
    });

    it('saveEdit leaves non-matching candidates untouched (ternary false arm)', () => {
      driveToSuccess(component, httpMock, fixture);
      component.saveEdit('cand-1');
      fixture.detectChanges();

      const other = component.candidates().find((c) => c.id === 'cand-2');
      // cand-2 is unaffected by saving cand-1.
      expect(other?.status).toBe('pending');
      expect(other?.content).toBe('Cells release energy stored in glucose.');
    });

    it('onSubmitAccepted success handler skips removal when state left success before the response', () => {
      driveToSuccess(component, httpMock, fixture);
      component.acceptCandidate('cand-1');
      fixture.detectChanges();

      // Fire the bulk POST, then leave the success state before flushing so the
      // success handler's `if (state.status === 'success')` guard is false.
      component.onSubmitAccepted();
      const req = httpMock.expectOne(BULK_URL);

      component.onStartOver();
      fixture.detectChanges();
      expect(component.extractionState().status).toBe('idle');

      req.flush({ count: 1 });
      fixture.detectChanges();

      // Removal branch skipped — state remains idle, no throw.
      expect(component.extractionState().status).toBe('idle');
      expect(component.candidates().length).toBe(0);
    });
  });

  describe('empty candidates success', () => {
    it('renders the no-candidates panel when extraction returns none', () => {
      driveToSuccess(component, httpMock, fixture, []);
      expect(component.candidates().length).toBe(0);
      const noCandidates = element.querySelector(
        '.ai-extraction__no-candidates',
      );
      expect(noCandidates).not.toBeNull();
      expect(noCandidates?.textContent).toContain(
        'community.extraction.no-candidates',
      );
    });
  });
});
