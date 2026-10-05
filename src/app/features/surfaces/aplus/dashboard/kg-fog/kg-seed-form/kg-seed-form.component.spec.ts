import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { KgSeedFormComponent } from './kg-seed-form.component';
import { KgFogService } from '../kg-fog.service';
import { TranslateService } from '../../../../../../core/services/translate.service';
import type {
  ClusterCreateRequest,
  ClusterCreateResponse,
} from '../kg-fog.model';
import { buildClusterCreateResponse } from '../../../../../../testing/builders/buildKgCluster';

/**
 * KgSeedFormComponent — reusable "seed a curiosity topic" form (ADR-204 §10).
 *
 * Extracted from the (now-retired) dashboard explorations panel so the map
 * hero's empty state can reuse the exact same seed input + create + error
 * mapping. Pure presentational seam: it owns the `createCluster` call and
 * emits `(created)` on success; the parent decides what to do with the
 * new cluster (append to the preview / navigate / refresh).
 */

// ── MockKgFogService ───────────────────────────────────────────────────────
class MockKgFogService {
  lastCreateRequest: ClusterCreateRequest | null = null;
  createCalls = 0;
  createResult: ClusterCreateResponse = buildClusterCreateResponse();
  createError: unknown = null;

  createCluster(request: ClusterCreateRequest): Observable<ClusterCreateResponse> {
    this.createCalls += 1;
    this.lastCreateRequest = request;
    if (this.createError) return throwError(() => this.createError);
    return of(this.createResult);
  }
}

function setup(): {
  fixture: ComponentFixture<KgSeedFormComponent>;
  element: HTMLElement;
  kg: MockKgFogService;
  created: ClusterCreateResponse[];
} {
  const kg = new MockKgFogService();
  TestBed.configureTestingModule({
    imports: [KgSeedFormComponent],
    providers: [TranslateService, { provide: KgFogService, useValue: kg }],
  });
  const fixture = TestBed.createComponent(KgSeedFormComponent);
  const created: ClusterCreateResponse[] = [];
  fixture.componentInstance.created.subscribe((r) => created.push(r));
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, kg, created };
}

function typeTopic(fixture: ComponentFixture<KgSeedFormComponent>, value: string): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="kg-seed-input"]',
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('KgSeedFormComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders a labelled seed input and a submit CTA', () => {
    const { element } = setup();
    expect(element.querySelector('[data-testid="kg-seed-input"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="kg-seed-cta"]')).not.toBeNull();
    // a11y: the input must be labelled (visually-hidden <label for>).
    const input = element.querySelector('[data-testid="kg-seed-input"]') as HTMLInputElement;
    const label = element.querySelector(`label[for="${input.id}"]`);
    expect(label).not.toBeNull();
  });

  it('disables the CTA when the topic is empty, enables it once typed', () => {
    const { fixture, element } = setup();
    const cta = element.querySelector('[data-testid="kg-seed-cta"]') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    typeTopic(fixture, 'agile estimation');
    expect(cta.disabled).toBe(false);
  });

  it('submitting calls createCluster with the trimmed topic and emits (created)', () => {
    const { fixture, kg, created } = setup();
    typeTopic(fixture, '  machine learning  ');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();

    expect(kg.createCalls).toBe(1);
    expect(kg.lastCreateRequest).toEqual({ seedTopic: 'machine learning' });
    expect(created.length).toBe(1);
    expect(created[0].clusterId).toBe(kg.createResult.clusterId);
  });

  it('clears the input after a successful seed', () => {
    const { fixture, element } = setup();
    typeTopic(fixture, 'kanban');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();
    const input = element.querySelector('[data-testid="kg-seed-input"]') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(fixture.componentInstance.seedTopic()).toBe('');
  });

  it('does not call createCluster for a blank topic', () => {
    const { fixture, kg } = setup();
    typeTopic(fixture, '   ');
    fixture.componentInstance.startExploration();
    expect(kg.createCalls).toBe(0);
  });

  it('renders a cap-reached error (409) without emitting created', () => {
    const { fixture, element, kg, created } = setup();
    kg.createError = { status: 409 };
    typeTopic(fixture, 'too many');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="kg-seed-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(created.length).toBe(0);
    expect(fixture.componentInstance.seedError()?.kind).toBe('cap_reached');
  });

  it('maps a 502 FOG_INSUFFICIENT_CATALOGUE to the remediable fog error', () => {
    const { fixture, kg } = setup();
    kg.createError = { status: 502, error: { code: 'FOG_INSUFFICIENT_CATALOGUE' } };
    typeTopic(fixture, 'obscure topic');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();
    expect(fixture.componentInstance.seedError()?.kind).toBe('fog_insufficient_catalogue');
  });

  it('clears a prior error as soon as the learner edits the topic', () => {
    const { fixture, kg } = setup();
    kg.createError = { status: 402 };
    typeTopic(fixture, 'needs mana');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();
    expect(fixture.componentInstance.seedError()?.kind).toBe('insufficient_mana');

    typeTopic(fixture, 'needs mana!');
    expect(fixture.componentInstance.seedError()).toBeNull();
  });

  it('rejects an over-long topic (>128 chars) via canSeed', () => {
    const { fixture } = setup();
    typeTopic(fixture, 'x'.repeat(129));
    expect(fixture.componentInstance.canSeed()).toBe(false);
  });

  it('uses the capMax input when mapping the cap-reached error message', () => {
    const { fixture, kg } = setup();
    fixture.componentRef.setInput('capMax', 5);
    kg.createError = { status: 409 };
    typeTopic(fixture, 'cap');
    fixture.componentInstance.startExploration();
    fixture.detectChanges();
    const err = fixture.componentInstance.seedError();
    expect(err?.kind).toBe('cap_reached');
    if (err?.kind === 'cap_reached') expect(err.capMax).toBe(5);
  });
});
