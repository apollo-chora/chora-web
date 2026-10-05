import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../../../../environments/environment';
import { MyKnowledgeComponent } from './my-knowledge.component';
import type { MapCard } from './maps.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PENDING_REVIEW_STORAGE_KEY } from '../growth-edge-review/pending-review.store';

const BFF = environment.bffBaseUrl;
const MAPS = `${BFF}/api/v1/me/maps`;
const CONCEPTS = `${BFF}/api/v1/me/concept-graph/concepts`;
const GOALS = `${BFF}/api/v1/me/goals`;
const CLUSTERS = `${BFF}/api/v1/me/knowledge-graph/clusters`;
const UPLOADS = `${BFF}/api/v1/me/growth-edges/uploads`;
const UPLOAD = (id: string): string => `${UPLOADS}/${id}`;

function card(over: Partial<MapCard> = {}): MapCard {
  return {
    goalId: 'goal-1',
    title: 'Scrum',
    northStarNote: 'Agile & teams',
    rootConceptId: 'c-1',
    kind: 'curiosity',
    status: 'active',
    conceptCount: 12,
    shakyCount: 3,
    masteredCount: 2,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('MyKnowledgeComponent', () => {
  let fixture: ComponentFixture<MyKnowledgeComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  const mockConfirmDialog = { confirm: vi.fn() };

  beforeEach(async () => {
    // No parked review by default, so the banner poll stays dormant and the
    // existing tests fire no extra uploads request (CHO-2337).
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    mockConfirmDialog.confirm.mockReset().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [MyKnowledgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyKnowledgeComponent);
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // ngOnInit fires the ADR-223 legacy-clusters probe fail-soft; drain any
    // un-flushed one so tests that don't assert on it needn't handle it.
    httpMock.match(CLUSTERS).forEach((r) => !r.cancelled && r.flush({ data: { clusters: [] } }));
    httpMock.verify();
  });

  it('renders a legacy fog cluster with a convert action (ADR-223)', () => {
    fixture.detectChanges(); // ngOnInit → GET maps + GET clusters
    httpMock.expectOne(MAPS).flush({ items: [] });
    httpMock
      .expectOne(CLUSTERS)
      .flush({ data: { clusters: [{ clusterId: 'k-1', seedTopic: 'agile' }] } });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-legacy-card-k-1"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="mk-convert-k-1"]')).toBeTruthy();
    expect(element.textContent).toContain('agile');
  });

  it('converts a legacy cluster: POST convert then reloads (ADR-223)', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    httpMock
      .expectOne(CLUSTERS)
      .flush({ data: { clusters: [{ clusterId: 'k-1', seedTopic: 'agile' }] } });
    fixture.detectChanges();

    (element.querySelector('[data-testid="mk-convert-k-1"]') as HTMLButtonElement).click();

    httpMock.expectOne(`${CLUSTERS}/k-1/convert`).flush({ data: { goalId: 'goal-new' } });
    // success → reloads the atlas (maps + clusters)
    httpMock.expectOne(MAPS).flush({ items: [] });
    httpMock.expectOne(CLUSTERS).flush({ data: { clusters: [] } });
  });

  it('shows loading, then renders a card per map with the correct terrain', () => {
    fixture.detectChanges(); // ngOnInit → GET maps
    expect(element.querySelector('[data-testid="mk-loading"]')).toBeTruthy();

    httpMock
      .expectOne(MAPS)
      .flush({ items: [card(), card({ goalId: 'goal-2', title: 'Biology' })] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-card-goal-1"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="mk-card-goal-2"]')).toBeTruthy();

    const c1 = element.querySelector('[data-testid="mk-card-goal-1"]')!;
    // shakyCount 3 > 0 ⇒ shaky band; masteredCount 2 > 0 ⇒ mastered band
    expect(c1.querySelector('[data-terrain="shaky"]')).toBeTruthy();
    expect(c1.querySelector('[data-terrain="mastered"]')).toBeTruthy();
    // Continue routes into the interim L1
    const cont = c1.querySelector<HTMLAnchorElement>('[data-testid="mk-continue-goal-1"]');
    expect(cont?.getAttribute('href')).toContain('/a/knowledge/goal-1');
  });

  it('shows the solid band and no mastered band when both counts are zero', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card({ shakyCount: 0, masteredCount: 0 })] });
    fixture.detectChanges();

    const c = element.querySelector('[data-testid="mk-card-goal-1"]')!;
    expect(c.querySelector('[data-terrain="solid"]')).toBeTruthy();
    expect(c.querySelector('[data-terrain="shaky"]')).toBeFalsy();
    expect(c.querySelector('[data-terrain="mastered"]')).toBeFalsy();
  });

  it('falls back to the untitled label when title and note are blank', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card({ title: '', northStarNote: '' })] });
    fixture.detectChanges();

    const title = element.querySelector('[data-testid="mk-card-goal-1"] .mk-card__title');
    expect(title?.textContent?.trim()).toBe('aplus.knowledge.untitled_map');
  });

  it('renders the empty state when there are no maps', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-empty"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="mk-grid"]')).toBeFalsy();
  });

  it('fails loud on a load error and retries', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-error"]')).toBeTruthy();
    element.querySelector<HTMLButtonElement>('[data-testid="mk-retry"]')?.click();
    httpMock.expectOne(MAPS).flush({ items: [] });
  });

  it('creates a new map via the 2-step create, then refreshes the atlas', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    fixture.detectChanges();

    // open the inline form (empty-state CTA) and name the map
    element.querySelector<HTMLButtonElement>('[data-testid="mk-empty-cta"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.form.controls.name.setValue('Story Points');
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="mk-new-map-submit"]')?.click();

    // 1. mint the root concept
    const conceptReq = httpMock.expectOne(CONCEPTS);
    expect(conceptReq.request.body).toEqual({ title: 'Story Points' });
    conceptReq.flush({
      conceptId: 'concept-7',
      title: 'Story Points',
      atomRefs: [],
      provenance: 'learner_authored',
      createdAt: '2026-07-02T00:00:00Z',
    });

    // 2. create the goal carrying the new root concept id
    const goalReq = httpMock.expectOne(GOALS);
    expect(goalReq.request.body).toEqual({
      kind: 'curiosity',
      rootConceptId: 'concept-7',
      northStarNote: 'Story Points',
    });
    goalReq.flush({
      goalId: 'goal-7',
      kind: 'curiosity',
      conceptSet: [],
      status: 'active',
      northStarNote: 'Story Points',
      createdAt: '2026-07-02T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
    });

    // success → reset + refresh GET maps
    httpMock.expectOne(MAPS).flush({ items: [card({ goalId: 'goal-7', title: 'Story Points' })] });
    fixture.detectChanges();

    expect(fixture.componentInstance.creating()).toBe(false);
    expect(fixture.componentInstance.formOpen()).toBe(false);
    expect(element.querySelector('[data-testid="mk-card-goal-7"]')).toBeTruthy();
  });

  it('shows an inline create error and does not fire the goal request', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="mk-empty-cta"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.form.controls.name.setValue('Boom');
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="mk-new-map-submit"]')?.click();

    httpMock.expectOne(CONCEPTS).flush('nope', { status: 500, statusText: 'Server Error' });
    httpMock.expectNone(GOALS);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-new-map-error"]')).toBeTruthy();
    expect(fixture.componentInstance.creating()).toBe(false);
  });

  it('does not submit when the name is blank (required)', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="mk-empty-cta"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.form.controls.name.setValue('   ');
    fixture.componentInstance.submit();

    httpMock.expectNone(CONCEPTS);
  });

  it('cancel closes and resets the new-map form', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [] });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="mk-empty-cta"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.form.controls.name.setValue('Draft');
    expect(element.querySelector('[data-testid="mk-new-map-form"]')).toBeTruthy();

    element.querySelector<HTMLButtonElement>('[data-testid="mk-new-map-cancel"]')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.formOpen()).toBe(false);
    expect(fixture.componentInstance.form.controls.name.value).toBe('');
    expect(element.querySelector('[data-testid="mk-new-map-form"]')).toBeFalsy();
  });

  it('renders a top-right remove trigger per map card', () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card()] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-delete-goal-1"]')).toBeTruthy();
  });

  it('confirming the modal DELETEs the goal, reloads the atlas + toasts removed', async () => {
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    fixture.detectChanges();
    httpMock
      .expectOne(MAPS)
      .flush({ items: [card(), card({ goalId: 'goal-2', title: 'Biology' })] });
    fixture.detectChanges();

    await fixture.componentInstance.promptDeleteMap('goal-1');
    expect(mockConfirmDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger' }),
    );
    httpMock
      .expectOne((r) => r.url === `${GOALS}/goal-1` && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(MAPS).flush({ items: [card({ goalId: 'goal-2', title: 'Biology' })] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="mk-card-goal-1"]')).toBeFalsy();
    expect(element.querySelector('[data-testid="mk-card-goal-2"]')).toBeTruthy();
    expect(toastSpy).toHaveBeenCalledWith('aplus.knowledge.map_removed', 'success');
  });

  it('declining the modal fires no DELETE', async () => {
    mockConfirmDialog.confirm.mockResolvedValueOnce(false);
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card()] });
    fixture.detectChanges();

    await fixture.componentInstance.promptDeleteMap('goal-1');
    httpMock.expectNone((r) => r.method === 'DELETE');
  });

  it('a delete failure toasts an error and keeps the card (fail-loud)', async () => {
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card()] });
    fixture.detectChanges();

    await fixture.componentInstance.promptDeleteMap('goal-1');
    httpMock
      .expectOne((r) => r.url === `${GOALS}/goal-1` && r.method === 'DELETE')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith('aplus.knowledge.map_delete_error', 'error');
    expect(element.querySelector('[data-testid="mk-card-goal-1"]')).toBeTruthy();
    expect(fixture.componentInstance.deletingId()).toBeNull();
  });

  // ── Persistent resume-review banner (CHO-2337) ──────────────────────────
  // A diagnosis parked at AWAITING_REVIEW is only linked from an ephemeral
  // in-drawer CTA; once closed the learner is stranded. On /a/knowledge the
  // shell re-offers it via a banner, self-healed against GET /uploads/{id}.
  describe('pending review banner (CHO-2337)', () => {
    it('renders a persistent resume-review banner when the parked review is AWAITING_REVIEW', () => {
      localStorage.setItem(PENDING_REVIEW_STORAGE_KEY, 'up-77');
      fixture.detectChanges(); // ngOnInit → GET maps + clusters + uploads/up-77
      httpMock.expectOne(MAPS).flush({ items: [] });
      httpMock
        .expectOne(UPLOAD('up-77'))
        .flush({ upload_id: 'up-77', status: 'AWAITING_REVIEW' });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="pending-review-banner"]'),
      ).toBeTruthy();
      const resume = element.querySelector<HTMLAnchorElement>(
        '[data-testid="pending-review-resume"]',
      );
      expect(resume?.getAttribute('href')).toBe('/a/growth-edges/review/up-77');
    });

    it('self-heals: no banner and clears the store when the review is already COMPLETED', () => {
      localStorage.setItem(PENDING_REVIEW_STORAGE_KEY, 'up-done');
      fixture.detectChanges();
      httpMock.expectOne(MAPS).flush({ items: [] });
      httpMock.expectOne(UPLOAD('up-done')).flush({
        upload_id: 'up-done',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['e1'],
      });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="pending-review-banner"]'),
      ).toBeFalsy();
      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBeNull();
    });

    it('keeps the stored id but hides the banner on a transient poll error', () => {
      localStorage.setItem(PENDING_REVIEW_STORAGE_KEY, 'up-flaky');
      fixture.detectChanges();
      httpMock.expectOne(MAPS).flush({ items: [] });
      httpMock
        .expectOne(UPLOAD('up-flaky'))
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="pending-review-banner"]'),
      ).toBeFalsy();
      // Not a verdict: the id survives so the next visit retries.
      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBe('up-flaky');
    });

    it('does not poll and shows no banner when there is no parked review', () => {
      fixture.detectChanges();
      httpMock.expectOne(MAPS).flush({ items: [] });
      httpMock.expectNone((r) => r.url.startsWith(UPLOADS));
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="pending-review-banner"]'),
      ).toBeFalsy();
    });
  });

  it('has zero critical/serious WCAG violations on the success grid', async () => {
    fixture.detectChanges();
    httpMock.expectOne(MAPS).flush({ items: [card()] });
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
