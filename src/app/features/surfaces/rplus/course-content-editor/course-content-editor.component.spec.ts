/**
 * CourseContentEditorComponent spec — R+ authoring panel. CHO-1612.
 *
 * Verifies:
 *   1. Loading state on init
 *   2. Ready state — renders item rows with kind badge, up/down/remove controls
 *   3. Empty state when items array is empty
 *   4. Error state on HTTP failure + retry re-fetches
 *   5. Add-item form: empty ref or title shows validation error
 *   6. Add-item form: success replaces item list from server response
 *   7. Remove: issues DELETE + updates item list
 *   8. Move up: disables first-item up-button; issues POST .../reorder
 *   9. Move down: disables last-item down-button; issues POST .../reorder
 *  10. Keyboard Alt+Arrow up/down triggers reorder
 *  11. addError clears on successful submit
 */
// describe/it/beforeEach/afterEach come from the GLOBAL Vitest API
// (globals:true) so AnalogJS setup-zone wraps each test body in a
// ProxyZone — required by Angular fakeAsync()/tick(). An explicit
// 'vitest' import would use unpatched bindings -> "Expected to be
// running in 'ProxyZone'".
import { expect } from 'vitest';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { CourseContentEditorComponent } from './course-content-editor.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';
import {
  buildCourseContentResponse,
  buildCourseContentItem,
} from '../../../../testing/builders/buildCourseContent';

const BASE = environment.bffBaseUrl;
const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';

function setup(courseId: string = COURSE_ID): {
  fixture: ComponentFixture<CourseContentEditorComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: CourseContentEditorComponent;
} {
  TestBed.configureTestingModule({
    imports: [CourseContentEditorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(CourseContentEditorComponent);
  fixture.componentRef.setInput('courseId', courseId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

function flushList(
  httpMock: HttpTestingController,
  body: object | null,
  status = 200,
): void {
  const req = httpMock.expectOne(
    `${BASE}/api/v1/courses/${COURSE_ID}/content`,
  );
  if (status !== 200) {
    req.flush(body, { status, statusText: String(status) });
  } else {
    req.flush(body);
  }
}

describe('CourseContentEditorComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('loading state', () => {
    it('shows the loading panel on first render', () => {
      const { fixture, element, httpMock } = setup();
      expect(
        element.querySelector('[data-testid="content-editor-loading"]'),
      ).not.toBeNull();
      flushList(httpMock, buildCourseContentResponse());
      httpMock.verify();
      fixture.destroy();
    });
  });

  describe('ready state', () => {
    it('renders one item row per item', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      // Default builder has 3 items
      const rows = element.querySelectorAll(
        '[data-testid^="content-editor-item-"][data-kind]',
      );
      expect(rows.length).toBe(3);
      httpMock.verify();
      fixture.destroy();
    }));

    it('attaches data-kind to each row', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(
        httpMock,
        buildCourseContentResponse({
          items: [
            buildCourseContentItem({ item_id: 'i1', kind: 'atom', position: 1 }),
            buildCourseContentItem({ item_id: 'i2', kind: 'video', position: 2 }),
          ],
        }),
      );
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="content-editor-item-i1"]')?.getAttribute('data-kind'),
      ).toBe('atom');
      expect(
        element.querySelector('[data-testid="content-editor-item-i2"]')?.getAttribute('data-kind'),
      ).toBe('video');
      httpMock.verify();
      fixture.destroy();
    }));

    it('first item up-button is disabled', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      // Default builder first item has item_id '09000000-0000-7000-8000-000000000001'
      const upBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-move-up-09000000-0000-7000-8000-000000000001"]',
      );
      expect(upBtn?.disabled).toBe(true);
      httpMock.verify();
      fixture.destroy();
    }));

    it('last item down-button is disabled', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      // Default builder last item has item_id '09000000-0000-7000-8000-000000000003'
      const downBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-move-down-09000000-0000-7000-8000-000000000003"]',
      );
      expect(downBtn?.disabled).toBe(true);
      httpMock.verify();
      fixture.destroy();
    }));

    it('item count chip reflects loaded item count', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const count = element.querySelector('[data-testid="content-editor-item-count"]');
      expect(count?.textContent?.trim()).toContain('3');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('empty state', () => {
    it('shows the empty panel when items array is empty', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, { course_id: COURSE_ID, items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="content-editor-empty"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('error state', () => {
    it('shows the error panel on HTTP failure', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, null, 500);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="content-editor-error"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('retry re-issues the GET request', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, null, 500);
      fixture.detectChanges();
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-retry"]',
      );
      retry!.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="content-editor-loading"]'),
      ).not.toBeNull();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="content-editor-loading"]'),
      ).toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('add-item form', () => {
    it('shows validation error when ref is empty on submit', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();

      // Leave ref and title empty; click add
      const addBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-add-btn"]',
      );
      addBtn!.click();
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="content-editor-add-error"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('POSTs { kind, ref, title } and updates the list on success', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      // Programmatically fill the form. Kind FIRST: switching kind now
      // invalidates the ref (CHO-2346), matching the real UI order where the
      // instructor chooses the kind before supplying its ref.
      component.updateKind('atom');
      component.updateRef('01000000-0000-7000-8000-000000000099');
      component.updateTitle('New Atom Title');

      const addBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-add-btn"]',
      );
      addBtn!.click();
      fixture.detectChanges();

      // Expect a POST to the content endpoint
      const postReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content`,
      );
      expect(postReq.request.method).toBe('POST');
      expect(postReq.request.body.kind).toBe('atom');
      expect(postReq.request.body.ref).toBe('01000000-0000-7000-8000-000000000099');
      expect(postReq.request.body.title).toBe('New Atom Title');

      const newItem = buildCourseContentItem({
        item_id: 'new-item',
        kind: 'atom',
        ref: '01000000-0000-7000-8000-000000000099',
        title: 'New Atom Title',
        position: 1,
      });
      postReq.flush({ course_id: COURSE_ID, items: [newItem] });
      fixture.detectChanges();

      const rows = element.querySelectorAll('[data-testid^="content-editor-item-"][data-kind]');
      expect(rows.length).toBe(1);
      httpMock.verify();
      fixture.destroy();
    }));

    it('clears the ref and title but keeps kind after successful add', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      // Kind FIRST: a kind switch clears the ref (CHO-2346).
      component.updateKind('video');
      component.updateRef('some-ref');
      component.updateTitle('Some Title');

      component.submitAddItem();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content`)
        .flush({ course_id: COURSE_ID, items: [] });
      fixture.detectChanges();

      expect(component.addForm().ref).toBe('');
      expect(component.addForm().title).toBe('');
      expect(component.addForm().kind).toBe('video');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('remove item', () => {
    it('issues DELETE and removes the item from the list', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', kind: 'atom', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', kind: 'video', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.removeItem('i1');
      fixture.detectChanges();

      const delReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/i1`,
      );
      expect(delReq.request.method).toBe('DELETE');
      delReq.flush({ course_id: COURSE_ID, items: [items[1]!] });
      fixture.detectChanges();

      const rows = element.querySelectorAll('[data-testid^="content-editor-item-"][data-kind]');
      expect(rows.length).toBe(1);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('reorder', () => {
    it('moveItem down POSTs ordered_item_ids to .../reorder', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.moveItem('i1', 1);
      fixture.detectChanges();

      const reorderReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      expect(reorderReq.request.method).toBe('POST');
      expect(reorderReq.request.body.ordered_item_ids).toEqual(['i2', 'i1']);
      reorderReq.flush({ course_id: COURSE_ID, items: [items[1]!, items[0]!] });
      fixture.detectChanges();

      httpMock.verify();
      fixture.destroy();
    }));

    it('moveItem up POSTs ordered_item_ids in new order', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.moveItem('i2', -1);
      fixture.detectChanges();

      const reorderReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      expect(reorderReq.request.body.ordered_item_ids).toEqual(['i2', 'i1']);
      reorderReq.flush({ course_id: COURSE_ID, items });
      fixture.detectChanges();

      httpMock.verify();
      fixture.destroy();
    }));

    it('onItemKey Alt+ArrowDown triggers moveItem(delta=1)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
      });
      component.onItemKey(event, 'i1');
      fixture.detectChanges();

      const reorderReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      reorderReq.flush({ course_id: COURSE_ID, items });
      fixture.detectChanges();

      httpMock.verify();
      fixture.destroy();
    }));

    it('onItemKey Alt+ArrowUp triggers moveItem(delta=-1)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        altKey: true,
      });
      component.onItemKey(event, 'i2');
      fixture.detectChanges();

      const reorderReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      reorderReq.flush({ course_id: COURSE_ID, items });
      fixture.detectChanges();

      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('surface shell', () => {
    it('root has surface-rplus class', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const root = element.querySelector(
        '[data-testid="rplus-course-content-editor"]',
      );
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders the heading translation key', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const heading = element.querySelector(
        '[data-testid="content-editor-heading"]',
      );
      expect(heading?.textContent).toContain(
        'rplus.courseContentEditor.heading',
      );
      httpMock.verify();
      fixture.destroy();
    }));

    it('breadcrumb course link routes to /r/catalog/:courseId', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const crumb = element.querySelector<HTMLAnchorElement>(
        '[data-testid="content-editor-breadcrumb-course"]',
      );
      // RouterLink renders the resolved href.
      expect(crumb?.getAttribute('href')).toContain(
        `/r/catalog/${COURSE_ID}`,
      );
      httpMock.verify();
      fixture.destroy();
    }));
  });

  // ── Added coverage ────────────────────────────────────────────────────

  describe('add-item form — additional paths', () => {
    it('shows validation error when title is empty but ref present', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      // ref filled, title blank -> the (!form.title.trim()) branch fires
      component.updateRef('some-ref');
      component.updateTitle('   ');
      component.submitAddItem();
      fixture.detectChanges();

      expect(component.addError()).toBe(
        'rplus.courseContentEditor.add_error_required',
      );
      expect(
        element.querySelector('[data-testid="content-editor-add-error"]'),
      ).not.toBeNull();
      // No POST should have been issued on validation failure.
      httpMock.verify();
      fixture.destroy();
    }));

    it('sets addPending while the POST is in flight and disables the button', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      component.updateRef('a-ref');
      component.updateTitle('A Title');
      component.submitAddItem();
      fixture.detectChanges();

      expect(component.addPending()).toBe(true);
      const addBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-add-btn"]',
      );
      expect(addBtn?.disabled).toBe(true);

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content`)
        .flush({ course_id: COURSE_ID, items: [] });
      fixture.detectChanges();

      expect(component.addPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));

    it('sets server error and resets pending when the POST fails', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      component.updateRef('a-ref');
      component.updateTitle('A Title');
      component.submitAddItem();
      fixture.detectChanges();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.addPending()).toBe(false);
      expect(component.addError()).toBe(
        'rplus.courseContentEditor.add_error_server',
      );
      expect(
        element.querySelector('[data-testid="content-editor-add-error"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('clears a prior addError on a subsequent successful submit', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      fixture.detectChanges();

      // Trigger a validation error first.
      component.submitAddItem();
      expect(component.addError()).not.toBeNull();

      // Now a valid submit should clear it.
      component.updateRef('valid-ref');
      component.updateTitle('Valid Title');
      component.submitAddItem();
      fixture.detectChanges();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content`)
        .flush({ course_id: COURSE_ID, items: [] });
      fixture.detectChanges();

      expect(component.addError()).toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('remove item — additional paths', () => {
    it('transitions to empty state when the last item is removed', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'only', kind: 'atom', position: 1 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.removeItem('only');
      fixture.detectChanges();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/only`)
        .flush({ course_id: COURSE_ID, items: [] });
      fixture.detectChanges();

      expect(component.isEmpty()).toBe(true);
      expect(
        element.querySelector('[data-testid="content-editor-empty"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('marks an item as removing and shows its spinner state', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'r1', kind: 'atom', position: 1 }),
        buildCourseContentItem({ item_id: 'r2', kind: 'video', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.removeItem('r1');
      fixture.detectChanges();

      expect(component.isRemovingItem('r1')).toBe(true);
      const removeBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="content-editor-remove-r1"]',
      );
      expect(removeBtn?.disabled).toBe(true);

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/r1`)
        .flush({ course_id: COURSE_ID, items: [items[1]!] });
      fixture.detectChanges();

      expect(component.isRemovingItem('r1')).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));

    it('clears removing state and keeps items on DELETE failure', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'r1', kind: 'atom', position: 1 }),
        buildCourseContentItem({ item_id: 'r2', kind: 'video', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.removeItem('r1');
      fixture.detectChanges();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/r1`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // Removing flag cleared, item still present.
      expect(component.isRemovingItem('r1')).toBe(false);
      const rows = element.querySelectorAll(
        '[data-testid^="content-editor-item-"][data-kind]',
      );
      expect(rows.length).toBe(2);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('reorder — additional paths', () => {
    it('applies optimistic local order and disables buttons while pending', fakeAsync(() => {
      const { fixture, element, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.moveItem('i1', 1);
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(true);
      // Optimistic local order already swapped i1/i2.
      expect(component.items().map((it) => it.item_id)).toEqual(['i2', 'i1']);
      // Every move button disabled while a reorder is in flight.
      const moveBtns = element.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="content-editor-move-"]',
      );
      expect(
        Array.from(moveBtns).every((b) => b.disabled),
      ).toBe(true);

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`)
        .flush({ course_id: COURSE_ID, items: [items[1]!, items[0]!] });
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));

    it('rolls back to server order when the reorder POST fails', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.moveItem('i1', 1);
      fixture.detectChanges();

      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      // Local override cleared -> falls back to server order i1,i2.
      expect(component.items().map((it) => it.item_id)).toEqual(['i1', 'i2']);
      httpMock.verify();
      fixture.destroy();
    }));

    it('moveItem is a no-op at the top boundary (no HTTP)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      // First item cannot move up.
      component.moveItem('i1', -1);
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      // No reorder request issued.
      httpMock.verify();
      fixture.destroy();
    }));

    it('moveItem is a no-op at the bottom boundary (no HTTP)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      // Last item cannot move down.
      component.moveItem('i2', 1);
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));

    it('moveItem ignores a second move while a reorder is pending', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
        buildCourseContentItem({ item_id: 'i3', position: 3 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      component.moveItem('i1', 1);
      fixture.detectChanges();
      expect(component.reorderPending()).toBe(true);

      // Second move should be ignored due to the reorderPending guard.
      component.moveItem('i3', -1);
      fixture.detectChanges();

      // Only ONE reorder request expected (the first move).
      const reorderReq = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      reorderReq.flush({ course_id: COURSE_ID, items });
      fixture.detectChanges();

      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('keyboard handler — non-trigger keys', () => {
    it('onItemKey ignores a plain ArrowDown (no Alt)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: false,
      });
      component.onItemKey(event, 'i1');
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      // No reorder request.
      httpMock.verify();
      fixture.destroy();
    }));

    it('onItemKey ignores Alt+ArrowRight (unhandled key)', fakeAsync(() => {
      const { fixture, httpMock, component } = setup();
      const items = [
        buildCourseContentItem({ item_id: 'i1', position: 1 }),
        buildCourseContentItem({ item_id: 'i2', position: 2 }),
      ];
      flushList(httpMock, { course_id: COURSE_ID, items });
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        altKey: true,
      });
      component.onItemKey(event, 'i1');
      fixture.detectChanges();

      expect(component.reorderPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('kind helpers + youtube rendering', () => {
    it('icon() returns the correct FontAwesome name per kind', () => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse());
      expect(component.icon('atom')).toBe('atom');
      expect(component.icon('video')).toBe('circle-play');
      expect(component.icon('youtube')).toBe('brands fa-youtube');
      expect(component.icon('document')).toBe('file-lines');
      expect(component.icon('live_classroom')).toBe('chalkboard-user');
      expect(component.icon('assessment')).toBe('clipboard-check');
      httpMock.verify();
      fixture.destroy();
    });

    it('label/placeholder helpers compose per-kind translation keys', () => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse());
      expect(component.kindLabelKey('atom')).toBe(
        'rplus.courseContentEditor.kind_atom',
      );
      expect(component.refLabelKey('video')).toBe(
        'rplus.courseContentEditor.ref_label_video',
      );
      expect(component.refPlaceholderKey('youtube')).toBe(
        'rplus.courseContentEditor.ref_placeholder_youtube',
      );
      httpMock.verify();
      fixture.destroy();
    });

    it('renders the fa-youtube brand icon for a youtube item', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(
        httpMock,
        buildCourseContentResponse({
          items: [
            buildCourseContentItem({
              item_id: 'yt',
              kind: 'youtube',
              ref: 'https://youtu.be/abc',
              title: 'A clip',
              position: 1,
            }),
          ],
        }),
      );
      fixture.detectChanges();
      const row = element.querySelector(
        '[data-testid="content-editor-item-yt"]',
      );
      expect(row?.querySelector('.fa-youtube')).not.toBeNull();
      // Kind badge renders the per-kind translation key.
      const badge = element.querySelector(
        '[data-testid="content-editor-item-kind-yt"]',
      );
      expect(badge?.textContent).toContain(
        'rplus.courseContentEditor.kind_youtube',
      );
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders the item ref and title as real data', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushList(
        httpMock,
        buildCourseContentResponse({
          items: [
            buildCourseContentItem({
              item_id: 'd1',
              kind: 'document',
              ref: 'https://docs.example.com/spec.pdf',
              title: 'The Spec Sheet',
              position: 1,
            }),
          ],
        }),
      );
      fixture.detectChanges();
      const row = element.querySelector(
        '[data-testid="content-editor-item-d1"]',
      );
      expect(row?.textContent).toContain('The Spec Sheet');
      expect(row?.textContent).toContain('https://docs.example.com/spec.pdf');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('load with a different courseId', () => {
    it('lists content for the provided courseId input', fakeAsync(() => {
      const otherId = '05000000-0000-7000-8000-0000000c9999';
      const { fixture, httpMock, component } = setup(otherId);
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${otherId}/content`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ course_id: otherId, items: [] });
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('media upload (L3 / CHO-1793)', () => {
    it('mints a signed URL, PUTs the file, and sets the form ref to the object_ref', fakeAsync(() => {
      const { component, httpMock, fixture } = setup();
      flushList(
        httpMock,
        buildCourseContentResponse({ items: [buildCourseContentItem()] }),
      );

      component.updateKind('video');
      expect(component.isUploadKind()).toBe(true);

      const file = new File(['bytes'], 'lecture.mp4', { type: 'video/mp4' });
      component.onFileSelected({
        target: { files: [file], value: '' },
      } as unknown as Event);

      const mint = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/upload-url`,
      );
      expect(mint.request.method).toBe('POST');
      expect(mint.request.body).toEqual({
        mime: 'video/mp4',
        size_bytes: file.size,
        filename: 'lecture.mp4',
      });
      mint.flush({
        upload_url: 'https://storage.googleapis.com/b/o?sig=1',
        object_ref: 'gs://b/tenants/t/courses/c/o.mp4',
        expires_at: '2026-06-19T16:00:00Z',
        max_size_bytes: 100,
      });

      const put = httpMock.expectOne('https://storage.googleapis.com/b/o?sig=1');
      expect(put.request.method).toBe('PUT');
      put.flush(null);

      expect(component.addForm().ref).toBe('gs://b/tenants/t/courses/c/o.mp4');
      expect(component.uploadedFileName()).toBe('lecture.mp4');
      expect(component.uploadPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));

    it('surfaces an upload error when the mint fails', fakeAsync(() => {
      const { component, httpMock, fixture } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [buildCourseContentItem()] }));
      component.updateKind('document');
      const file = new File(['x'], 'h.pdf', { type: 'application/pdf' });
      component.onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);
      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/upload-url`)
        .flush(null, { status: 503, statusText: 'unwired' });
      expect(component.uploadError()).toBeTruthy();
      expect(component.uploadPending()).toBe(false);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  // ── CHO-2346: name-search pickers replace the raw UUIDv7 ref field ────
  //
  // An instructor cannot know an atom_id. The raw ref input made the three
  // opaque-id kinds (atom / assessment / live_classroom) unusable, so courses
  // ended up with zero atoms, and chora-consumption builds a learner's
  // LearningPath from kind=atom items ONLY, so a 0-atom course can never
  // progress, never complete and never certificate. CHO-2134 already solved
  // this on the offering workspace; these pin the same contract here.
  describe('ref entity pickers (CHO-2346)', () => {
    it('renders a picker (not the raw ref input) for kind=atom', () => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      component.updateKind('atom');
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="content-editor-ref-picker"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="content-editor-ref-input"]'),
      ).toBeNull();
      httpMock.verify();
      fixture.destroy();
    });

    it('renders a picker for kind=assessment and kind=live_classroom', () => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));

      component.updateKind('assessment');
      fixture.detectChanges();
      expect(component.refPickerType()).toBe('testset');
      expect(
        element.querySelector('[data-testid="content-editor-ref-picker"]'),
      ).not.toBeNull();

      component.updateKind('live_classroom');
      fixture.detectChanges();
      expect(component.refPickerType()).toBe('live_quiz');
      expect(
        element.querySelector('[data-testid="content-editor-ref-picker"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    });

    it('keeps the free-text input for URL kinds and shows no picker', () => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));

      for (const kind of ['video', 'youtube', 'document'] as const) {
        component.updateKind(kind);
        fixture.detectChanges();
        expect(component.refPickerType()).toBeNull();
        expect(
          element.querySelector('[data-testid="content-editor-ref-input"]'),
        ).not.toBeNull();
        expect(
          element.querySelector('[data-testid="content-editor-ref-picker"]'),
        ).toBeNull();
      }
      httpMock.verify();
      fixture.destroy();
    });

    it('picking an entity sets the form ref to its opaque id', () => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      component.updateKind('atom');
      fixture.detectChanges();

      component.onRefPicked({ id: 'atom-9', label: 'Limits' });
      fixture.detectChanges();

      expect(component.addForm().ref).toBe('atom-9');
      expect(component.refPicked()).toEqual([{ id: 'atom-9', label: 'Limits' }]);
      httpMock.verify();
      fixture.destroy();
    });

    it('clears a picked ref when the kind changes (never posts an atom_id as a URL)', () => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));
      component.updateKind('atom');
      component.onRefPicked({ id: 'atom-9', label: 'Limits' });
      expect(component.addForm().ref).toBe('atom-9');

      component.updateKind('youtube');
      fixture.detectChanges();

      expect(component.addForm().ref).toBe('');
      expect(component.refPicked()).toEqual([]);
      httpMock.verify();
      fixture.destroy();
    });

    it('labels a picker kind by NAME, not by raw id, and renders it once', () => {
      const { fixture, element, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));

      component.updateKind('atom');
      fixture.detectChanges();
      expect(component.refLabelKey('atom')).toBe(
        'rplus.courseContentEditor.ref_label_pick_atom',
      );
      // The outer <label> is the ONLY label: the picker must not render a
      // second copy of it (that duplication shipped and was sighted live).
      const labelText = 'rplus.courseContentEditor.ref_label_pick_atom';
      const occurrences = (element.textContent ?? '').split(labelText).length - 1;
      expect(occurrences).toBe(1);

      // A URL kind keeps the plain per-kind label.
      component.updateKind('youtube');
      fixture.detectChanges();
      expect(component.refLabelKey('youtube')).toBe(
        'rplus.courseContentEditor.ref_label_youtube',
      );
      httpMock.verify();
      fixture.destroy();
    });

    it('exposes a distinct search port per picker kind', () => {
      const { fixture, httpMock, component } = setup();
      flushList(httpMock, buildCourseContentResponse({ items: [] }));

      component.updateKind('atom');
      const atomPort = component.refSearchPort();
      component.updateKind('assessment');
      const testsetPort = component.refSearchPort();
      component.updateKind('live_classroom');
      const liveQuizPort = component.refSearchPort();
      component.updateKind('youtube');

      expect(atomPort?.entityType).toBe('atom');
      expect(testsetPort?.entityType).toBe('testset');
      expect(liveQuizPort?.entityType).toBe('live_quiz');
      expect(component.refSearchPort()).toBeNull();
      httpMock.verify();
      fixture.destroy();
    });
  });
});
