import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RevisionDiffViewerComponent } from './revision-diff-viewer.component';
import type { AtomRevision } from '../../models/atom.models';
import { environment } from '../../../../../environments/environment';

const ATOM_ID = 'atom-7f3c';

function revUrl(atomId: string): string {
  return `${environment.bffBaseUrl}/api/v1/atoms/${atomId}/revisions`;
}

function makeRevision(overrides: Partial<AtomRevision> = {}): AtomRevision {
  return {
    id: overrides.id ?? 'rev-1',
    atom_id: overrides.atom_id ?? ATOM_ID,
    revision_number: overrides.revision_number ?? 1,
    content: overrides.content ?? { stem: 'What is 2 + 2?' },
    validation_rules: overrides.validation_rules ?? [],
    published_at:
      overrides.published_at !== undefined ? overrides.published_at : null,
    created_at: overrides.created_at ?? '2026-05-26T01:00:00Z',
  };
}

const TWO_REVISIONS: readonly AtomRevision[] = [
  makeRevision({
    id: 'rev-1',
    revision_number: 1,
    content: { stem: 'What is 2 + 2?', answer: 4 },
    published_at: '2026-05-26T02:00:00Z',
    created_at: '2026-05-26T01:00:00Z',
  }),
  makeRevision({
    id: 'rev-2',
    revision_number: 2,
    content: { stem: 'What is 2 + 2?', answer: 5 },
    published_at: null,
    created_at: '2026-05-27T01:00:00Z',
  }),
];

/**
 * Build the component with a required `atomId` input, fire the initial
 * change-detection (triggers ngOnInit → loadRevisions → GET), flush the GET
 * with the supplied revisions, then run another CD pass to settle the view.
 */
function setup(
  revisions: readonly AtomRevision[],
  atomId = ATOM_ID,
): {
  fixture: ComponentFixture<RevisionDiffViewerComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [RevisionDiffViewerComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(RevisionDiffViewerComponent);
  fixture.componentRef.setInput('atomId', atomId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock
    .expectOne(revUrl(atomId))
    .flush({ data: [...revisions] });
  fixture.detectChanges();
  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('RevisionDiffViewerComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('shell + loading', () => {
    it('renders the root section with the revision-diff-viewer surface class', () => {
      TestBed.configureTestingModule({
        imports: [RevisionDiffViewerComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(RevisionDiffViewerComponent);
      fixture.componentRef.setInput('atomId', ATOM_ID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const root = element.querySelector('[data-testid="revision-diff-viewer"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('revision-diff-viewer');

      // GET fired immediately on init → loading state visible.
      const req = httpMock.expectOne(revUrl(ATOM_ID));
      expect(req.request.method).toBe('GET');
      const loading = element.querySelector(
        '[data-testid="revisions-loading"]',
      );
      expect(loading).not.toBeNull();

      req.flush({ data: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('renders the i18n title key in the header', () => {
      const { element } = setup(TWO_REVISIONS);
      const title = element.querySelector('[data-testid="revision-diff-title"]');
      expect(title?.textContent?.trim()).toBe('atomic.revision-diff.title');
    });
  });

  describe('error state', () => {
    it('shows the error panel when the revisions GET fails (5xx)', () => {
      TestBed.configureTestingModule({
        imports: [RevisionDiffViewerComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(RevisionDiffViewerComponent);
      fixture.componentRef.setInput('atomId', ATOM_ID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      httpMock
        .expectOne(revUrl(ATOM_ID))
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Internal Server Error' },
        );
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const err = element.querySelector('[data-testid="revisions-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('atomic.revision-diff.load-error');
      httpMock.verify();
    });

    it('exposes the error code on the revisionsState signal after a 4xx', () => {
      TestBed.configureTestingModule({
        imports: [RevisionDiffViewerComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(RevisionDiffViewerComponent);
      fixture.componentRef.setInput('atomId', ATOM_ID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      httpMock
        .expectOne(revUrl(ATOM_ID))
        .flush(
          { error: 'not found' },
          { status: 404, statusText: 'Not Found' },
        );
      fixture.detectChanges();

      const state = fixture.componentInstance.revisionsState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.code).toBe('REVISIONS_LOAD_FAILED');
      }
      expect(fixture.componentInstance.revisions()).toEqual([]);
      httpMock.verify();
    });
  });

  describe('empty state', () => {
    it('renders the empty-state message when no revisions exist', () => {
      const { element, httpMock } = setup([]);
      const empty = element.querySelector('[data-testid="revisions-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('atomic.revision-diff.no-revisions');
      // No timeline rendered.
      expect(
        element.querySelector('[data-testid="revision-timeline"]'),
      ).toBeNull();
      httpMock.verify();
    });
  });

  describe('success state — timeline + auto-selection', () => {
    it('renders one timeline item per revision', () => {
      const { element, httpMock } = setup(TWO_REVISIONS);
      const items = element.querySelectorAll(
        '[data-testid="revision-timeline-item"]',
      );
      expect(items.length).toBe(2);
      httpMock.verify();
    });

    it('sorts revisions descending by revision_number', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const revs = fixture.componentInstance.revisions();
      expect(revs.map((r) => r.revision_number)).toEqual([2, 1]);
      httpMock.verify();
    });

    it('auto-selects the latest two revisions (right=newest, left=next)', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const c = fixture.componentInstance;
      expect(c.selectedRight()?.revision_number).toBe(2);
      expect(c.selectedLeft()?.revision_number).toBe(1);
      expect(c.canCompare()).toBe(true);
      expect(c.leftLabel()).toBe('v1');
      expect(c.rightLabel()).toBe('v2');
      httpMock.verify();
    });

    it('only selects the right side when a single revision is returned', () => {
      const { fixture, httpMock } = setup([
        makeRevision({ id: 'rev-only', revision_number: 1 }),
      ]);
      const c = fixture.componentInstance;
      expect(c.selectedRight()?.revision_number).toBe(1);
      expect(c.selectedLeft()).toBeNull();
      expect(c.canCompare()).toBe(false);
      expect(c.leftLabel()).toBe('--');
      expect(c.rightLabel()).toBe('v1');
      httpMock.verify();
    });

    it('renders the published badge only for published revisions', () => {
      const { element, httpMock } = setup(TWO_REVISIONS);
      // rev-1 is published, rev-2 is not → exactly one badge.
      const badges = element.querySelectorAll(
        '.revision-diff-viewer__timeline-badge',
      );
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('atomic.revision-diff.published');
      httpMock.verify();
    });
  });

  describe('diff panel', () => {
    it('renders the diff table with the auto-selected pair', () => {
      const { element, httpMock } = setup(TWO_REVISIONS);
      const panel = element.querySelector('[data-testid="diff-panel"]');
      expect(panel).not.toBeNull();
      const table = element.querySelector('[data-testid="diff-table"]');
      expect(table).not.toBeNull();
      // Labels reflect the auto-selected revisions.
      expect(
        element
          .querySelector('[data-testid="diff-left-label"]')
          ?.textContent?.trim(),
      ).toBe('v1');
      expect(
        element
          .querySelector('[data-testid="diff-right-label"]')
          ?.textContent?.trim(),
      ).toBe('v2');
      httpMock.verify();
    });

    it('computes a diff with both unchanged and changed lines', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const lines = fixture.componentInstance.diffLines();
      // left content (v1: answer 4) vs right content (v2: answer 5) serialized
      // to pretty JSON. The stem line is unchanged; the answer line differs.
      expect(lines.length).toBeGreaterThan(0);
      const types = new Set(lines.map((l) => l.type));
      expect(types.has('unchanged')).toBe(true);
      expect(types.has('removed') || types.has('added')).toBe(true);
      // The differing answer values must surface in the diff content.
      const allContent = lines.map((l) => l.content).join('\n');
      expect(allContent).toContain('"answer": 4');
      expect(allContent).toContain('"answer": 5');
      httpMock.verify();
    });

    it('shows the select-two prompt and no diff table when only one side is chosen', () => {
      const { fixture, element, httpMock } = setup(TWO_REVISIONS);
      // Clear the auto-selected left side → canCompare() becomes false.
      fixture.componentInstance.selectedLeft.set(null);
      fixture.detectChanges();
      expect(fixture.componentInstance.canCompare()).toBe(false);
      expect(element.querySelector('[data-testid="diff-table"]')).toBeNull();
      const panel = element.querySelector('[data-testid="diff-panel"]');
      expect(panel?.textContent).toContain('atomic.revision-diff.select-two');
      httpMock.verify();
    });

    it('emits all-unchanged diff lines (and a diff table) when both sides are identical', () => {
      // Characterizes CURRENT behavior: identical content still produces
      // `unchanged` DiffLines (one per serialized line), so the template
      // renders the diff TABLE — the no-changes branch only fires when the
      // serialized text is empty (length === 0), which never happens for a
      // JSON.stringify of an object (always at least "{}").
      const identical = makeRevision({ content: { stem: 'same' } });
      const { fixture, element, httpMock } = setup(TWO_REVISIONS);
      fixture.componentInstance.selectLeftRevision({
        ...identical,
        id: 'a',
      });
      fixture.componentInstance.selectRightRevision({
        ...identical,
        id: 'b',
      });
      fixture.detectChanges();
      const lines = fixture.componentInstance.diffLines();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => l.type === 'unchanged')).toBe(true);
      expect(element.querySelector('[data-testid="diff-table"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('user interactions', () => {
    it('selects the left revision when the Left button is clicked', () => {
      const { fixture, element, httpMock } = setup(TWO_REVISIONS);
      const c = fixture.componentInstance;
      // Click the first "Left" button (newest revision v2).
      const leftBtn = element.querySelector(
        '[data-testid="select-left-btn"]',
      ) as HTMLButtonElement;
      leftBtn.click();
      fixture.detectChanges();
      expect(c.selectedLeft()?.revision_number).toBe(2);
      expect(c.isLeftSelected(c.revisions()[0])).toBe(true);
      httpMock.verify();
    });

    it('selects the right revision when the Right button is clicked', () => {
      const { fixture, element, httpMock } = setup(TWO_REVISIONS);
      const c = fixture.componentInstance;
      const rightButtons = element.querySelectorAll(
        '[data-testid="select-right-btn"]',
      );
      // Click the LAST "Right" button (oldest revision v1).
      (rightButtons[rightButtons.length - 1] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(c.selectedRight()?.revision_number).toBe(1);
      httpMock.verify();
    });

    it('isLeftSelected / isRightSelected reflect the current selection by id', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const c = fixture.componentInstance;
      const [newest, oldest] = c.revisions();
      // Default: right=newest(v2), left=oldest(v1).
      expect(c.isRightSelected(newest)).toBe(true);
      expect(c.isLeftSelected(oldest)).toBe(true);
      expect(c.isLeftSelected(newest)).toBe(false);
      expect(c.isRightSelected(oldest)).toBe(false);
      httpMock.verify();
    });
  });

  describe('formatDate', () => {
    it('returns -- for a null date', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      expect(fixture.componentInstance.formatDate(null)).toBe('--');
      httpMock.verify();
    });

    it('formats a valid ISO date into a non-empty localized string', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const out = fixture.componentInstance.formatDate('2026-05-26T01:00:00Z');
      expect(out).not.toBe('--');
      expect(out.length).toBeGreaterThan(0);
      expect(out).toContain('2026');
      httpMock.verify();
    });
  });

  describe('trackBy helpers', () => {
    it('trackByRevisionId returns the revision id', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      const rev = makeRevision({ id: 'rev-xyz' });
      expect(fixture.componentInstance.trackByRevisionId(0, rev)).toBe(
        'rev-xyz',
      );
      httpMock.verify();
    });

    it('trackByDiffLine returns the index', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      expect(fixture.componentInstance.trackByDiffLine(3)).toBe(3);
      httpMock.verify();
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without throwing', () => {
      const { fixture, httpMock } = setup(TWO_REVISIONS);
      expect(() => fixture.destroy()).not.toThrow();
      httpMock.verify();
    });
  });
});
