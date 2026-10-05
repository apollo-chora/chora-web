/**
 * QuestionBankWorkbenchListComponent spec — the `/a/studio/question-banks` List page (A+).
 *
 * Real QuestionBanksService over HttpTestingController (no service mock per
 * feedback_no_stubs_real_wiring). Surface-isolated copy of the R+ list spec,
 * re-pointed at the A+ route (`/a/studio/question-banks/:id`).
 *
 * Coverage:
 *   - mounts → GET /me/question-banks (loading) → renders a card per bank
 *     (name link to the A+ detail route, visibility badge, question count, tags)
 *   - honest empty-state when there are no banks
 *   - loud error + retry
 *   - open Create dialog → POST /question-banks (snake_case body, parsed tags)
 *     → closes + refreshes the list + success toast
 *   - validation blocks submit (no name) with a field error + NO POST
 *   - a 400 surfaces a loud banner (draft preserved)
 *   - axe a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { QuestionBankWorkbenchListComponent } from './question-bank-workbench-list.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

const LIST_URL = `${environment.bffBaseUrl}/api/v1/me/question-banks`;
const CREATE_URL = `${environment.bffBaseUrl}/api/v1/question-banks`;

const BANK = {
  question_bank_id: 'qb1',
  tenant_id: 't1',
  owner_gcid: 'g1',
  name: 'Algebra Pool',
  description: 'Reusable algebra questions',
  visibility: 'PRIVATE',
  tags: ['math', 'algebra'],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  items: [
    { question_id: 'q1', position: 0, added_at: '2026-06-01T01:00:00Z' },
    { question_id: 'q2', position: 1, added_at: '2026-06-01T02:00:00Z' },
  ],
};

function setup(): {
  fixture: ComponentFixture<QuestionBankWorkbenchListComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [QuestionBankWorkbenchListComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(QuestionBankWorkbenchListComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

describe('QuestionBankWorkbenchListComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* already verified in-body */
    }
  });

  it('GETs /me/question-banks on mount and renders a card per bank', () => {
    const { fixture, httpMock, element } = setup();
    const req = httpMock.expectOne(LIST_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [BANK], total: 1 });
    fixture.detectChanges();

    const card = element.querySelector('[data-testid="qb-card-qb1"]');
    expect(card).not.toBeNull();
    // name → link to the A+ detail route
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="qb-card-link-qb1"]');
    expect(link?.getAttribute('href')).toBe('/a/studio/question-banks/qb1');
    expect(link?.textContent).toContain('Algebra Pool');
    // visibility badge present
    expect(element.querySelector('[data-testid="qb-card-visibility-qb1"]')).not.toBeNull();
    // question count derived from items.length (2)
    expect(element.querySelector('[data-testid="qb-card-count-qb1"]')?.textContent).toContain('2');
    // tags rendered
    const text = element.textContent ?? '';
    expect(text).toContain('math');
    expect(text).toContain('algebra');
    httpMock.verify();
  });

  it('shows an honest empty-state when there are no banks', () => {
    const { fixture, httpMock, element } = setup();
    httpMock.expectOne(LIST_URL).flush({ items: [], total: 0 });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="qb-list-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="qb-list"]')).toBeNull();
    httpMock.verify();
  });

  it('shows a loud error + retry when the list fetch fails, and retries', () => {
    const { fixture, httpMock, element } = setup();
    httpMock.expectOne(LIST_URL).flush('boom', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const err = element.querySelector('[data-testid="qb-list-error"]');
    expect(err?.getAttribute('role')).toBe('alert');
    element.querySelector<HTMLButtonElement>('[data-testid="qb-list-retry"]')!.click();
    httpMock.expectOne(LIST_URL).flush({ items: [BANK], total: 1 });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="qb-list"]')).not.toBeNull();
    httpMock.verify();
  });

  it('does NOT expose an assemble action (assembly is R+ delivery, not A+ authoring)', () => {
    const { fixture, httpMock, element } = setup();
    httpMock.expectOne(LIST_URL).flush({ items: [BANK], total: 1 });
    fixture.detectChanges();
    // No assemble toggle/CTA anywhere on the A+ list.
    expect(element.querySelector('[data-testid="qb-assemble-toggle"]')).toBeNull();
    expect((element.textContent ?? '').toLowerCase()).not.toContain('assemble');
    httpMock.verify();
  });

  describe('create', () => {
    function loaded(): {
      fixture: ComponentFixture<QuestionBankWorkbenchListComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const built = setup();
      built.httpMock.expectOne(LIST_URL).flush({ items: [], total: 0 });
      built.fixture.detectChanges();
      return built;
    }

    it('opens the Create dialog from the New button', () => {
      const { fixture, element, httpMock } = loaded();
      expect(element.querySelector('[data-testid="qb-create-form"]')).toBeNull();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-create-form"]')).not.toBeNull();
      httpMock.verify();
    });

    it('POSTs the snake_case body (parsed tags) then closes + refreshes + toasts', () => {
      const { fixture, element, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();

      const c = fixture.componentInstance;
      c.name.set('New Pool');
      c.description.set('A new pool');
      c.visibility.set('TENANT_INTERNAL');
      c.tagsRaw.set('math, algebra ,'); // trailing/empty tokens dropped
      c.submit();

      const post = httpMock.expectOne(CREATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        name: 'New Pool',
        description: 'A new pool',
        visibility: 'TENANT_INTERNAL',
        tags: ['math', 'algebra'],
      });
      post.flush(
        { ...BANK, question_bank_id: 'qb9', name: 'New Pool' },
        { status: 201, statusText: 'Created' },
      );
      fixture.detectChanges();

      // Dialog closed + list refreshed (second GET) + a success toast queued.
      expect(element.querySelector('[data-testid="qb-create-form"]')).toBeNull();
      httpMock
        .expectOne(LIST_URL)
        .flush({ items: [{ ...BANK, question_bank_id: 'qb9', name: 'New Pool' }], total: 1 });
      fixture.detectChanges();
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('success');
      httpMock.verify();
    });

    it('blocks submit + shows a field error when the name is empty (no POST)', () => {
      const { fixture, element, httpMock } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      fixture.componentInstance.submit();
      fixture.detectChanges();
      expect(fixture.componentInstance.attempted()).toBe(true);
      expect(element.querySelector('[data-testid="qb-create-error-name"]')).not.toBeNull();
      // afterEach verify() asserts no POST fired.
      httpMock.verify();
    });

    it('surfaces a loud banner on a 400 (draft preserved)', () => {
      const { fixture, element, httpMock } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.name.set('Dup Pool');
      c.submit();
      httpMock
        .expectOne(CREATE_URL)
        .flush({ error: 'name already exists' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="qb-create-error"]');
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('name already exists');
      // Draft preserved + dialog still open.
      expect(c.name()).toBe('Dup Pool');
      expect(element.querySelector('[data-testid="qb-create-form"]')).not.toBeNull();
      httpMock.verify();
    });

    it('drives name + tags from typed DOM events', () => {
      const { fixture, element, httpMock } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const name = element.querySelector<HTMLInputElement>('[data-testid="qb-create-name"]')!;
      name.value = 'Typed Pool';
      name.dispatchEvent(new Event('input'));
      expect(c.name()).toBe('Typed Pool');

      const tags = element.querySelector<HTMLInputElement>('[data-testid="qb-create-tags"]')!;
      tags.value = 'a,b';
      tags.dispatchEvent(new Event('input'));
      expect(c.tagsRaw()).toBe('a,b');
      httpMock.verify();
    });

    it('drives description + visibility from typed DOM events', () => {
      const { fixture, element, httpMock } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const desc = element.querySelector<HTMLTextAreaElement>(
        '[data-testid="qb-create-description"]',
      )!;
      desc.value = 'A pool';
      desc.dispatchEvent(new Event('input'));
      expect(c.description()).toBe('A pool');

      const vis = element.querySelector<HTMLSelectElement>('[data-testid="qb-create-visibility"]')!;
      vis.value = 'TENANT_INTERNAL';
      vis.dispatchEvent(new Event('change'));
      expect(c.visibility()).toBe('TENANT_INTERNAL');
      httpMock.verify();
    });

    // Regression: exercise the REAL submit wiring (button → native form submit →
    // onSubmit → submit), not just submit(). A bare native submit would reload
    // the page — this clicks the actual button and asserts the POST goes out.
    it('POSTs when the submit BUTTON is clicked (form wiring, not just submit())', () => {
      const { fixture, element, httpMock } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      fixture.detectChanges();
      fixture.componentInstance.name.set('Clicked Pool');
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-create-submit"]')!.click();

      const post = httpMock.expectOne(CREATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toMatchObject({ name: 'Clicked Pool', tags: [] });
      post.flush({ ...BANK, question_bank_id: 'qb9' }, { status: 201, statusText: 'Created' });
      fixture.detectChanges();
      httpMock.expectOne(LIST_URL).flush({ items: [], total: 0 });
      httpMock.verify();
    });
  });

  describe('create error-shape surfacing', () => {
    function submitCreate(): {
      fixture: ComponentFixture<QuestionBankWorkbenchListComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const built = setup();
      built.httpMock.expectOne(LIST_URL).flush({ items: [], total: 0 });
      built.fixture.detectChanges();
      built.element.querySelector<HTMLButtonElement>('[data-testid="qb-new"]')!.click();
      built.fixture.detectChanges();
      built.fixture.componentInstance.name.set('Pool');
      built.fixture.componentInstance.submit();
      return built;
    }

    it('surfaces a nested { message } envelope', () => {
      const { fixture, httpMock, element } = submitCreate();
      httpMock
        .expectOne(CREATE_URL)
        .flush({ message: 'inner message form' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-create-error"]')?.textContent).toContain(
        'inner message form',
      );
      httpMock.verify();
    });

    it('surfaces a plain-string error body', () => {
      const { fixture, httpMock, element } = submitCreate();
      httpMock
        .expectOne(CREATE_URL)
        .flush('bare text error', { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-create-error"]')?.textContent).toContain(
        'bare text error',
      );
      httpMock.verify();
    });

    it('falls back to the HttpErrorResponse message on an empty 500 body', () => {
      const { fixture, httpMock, element } = submitCreate();
      httpMock.expectOne(CREATE_URL).flush('', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="qb-create-error"]');
      expect(banner).not.toBeNull();
      expect((banner?.textContent ?? '').length).toBeGreaterThan(0);
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations (loaded list)', async () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(LIST_URL).flush({ items: [BANK], total: 1 });
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });
});
