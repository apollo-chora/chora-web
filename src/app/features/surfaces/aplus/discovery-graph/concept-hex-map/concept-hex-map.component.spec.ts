import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ConceptHexMapComponent } from './concept-hex-map.component';
import type { ConceptFisheye, ConceptNeighborView } from '../concept-fisheye';

function neighbor(overrides: Partial<ConceptNeighborView> = {}): ConceptNeighborView {
  return {
    conceptId: 'p',
    title: 'Numbers',
    atomCount: 1,
    position: 'N',
    relation: 'parent',
    edgeId: 'e1',
    edgeClass: 'hierarchy',
    ...overrides,
  };
}

function makeFisheye(overrides: Partial<ConceptFisheye> = {}): ConceptFisheye {
  return {
    focal: { conceptId: 'f', title: 'Fractions', atomCount: 3 },
    neighbors: [
      neighbor(),
      neighbor({
        conceptId: 'c',
        title: 'Decimals',
        atomCount: 2,
        position: 'NE',
        relation: 'child',
      }),
    ],
    overflow: [],
    isRoot: false,
    ...overrides,
  };
}

describe('ConceptHexMapComponent', () => {
  let fixture: ComponentFixture<ConceptHexMapComponent>;
  let component: ConceptHexMapComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConceptHexMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ConceptHexMapComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('fisheye', makeFisheye());
    fixture.detectChanges();
  });

  it('creates and exposes the root test id', () => {
    expect(component).toBeTruthy();
    expect(element.querySelector('[data-testid="concept-hex-map"]')).toBeTruthy();
  });

  it('renders the focal title + atom count', () => {
    const title = element.querySelector('[data-testid="concept-hex-focal-title"]');
    const count = element.querySelector('[data-testid="concept-hex-focal-atomcount"]');
    expect(title?.textContent).toContain('Fractions');
    expect(count?.textContent).toContain('3');
  });

  it('renders one hex per neighbour keyed by position', () => {
    expect(element.querySelector('[data-testid="concept-hex-neighbor-N"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="concept-hex-neighbor-NE"]')).toBeTruthy();
  });

  it('emits recenter with the tapped neighbour', () => {
    let emitted: ConceptNeighborView | undefined;
    component.recenter.subscribe((n) => (emitted = n));

    element.querySelector<HTMLButtonElement>('[data-testid="concept-hex-neighbor-N"]')?.click();

    expect(emitted?.conceptId).toBe('p');
  });

  it('recenter falls back to an immediate emit + no pan when geometry is absent', () => {
    // jsdom has no layout, so the recenter pan delta is 0 — the tap must still
    // emit synchronously and leave no dangling grid transform (the eased pan is
    // browser-only; behaviour here is unchanged from before the animation).
    let emitted: ConceptNeighborView | undefined;
    component.recenter.subscribe((n) => (emitted = n));

    component.onRecenter(neighbor());

    expect(emitted?.conceptId).toBe('p');
    expect(component.panTransform()).toBe('');
  });

  it('emits focalSelect when the focal cell is tapped (opens its detail)', () => {
    let fired = 0;
    component.focalSelect.subscribe(() => (fired += 1));

    const focal = element.querySelector<HTMLButtonElement>('[data-testid="concept-hex-focal"]');
    expect(focal?.tagName).toBe('BUTTON');
    focal?.click();

    expect(fired).toBe(1);
  });

  it('does not emit recenter while loading (disabled)', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let emitted = false;
    component.recenter.subscribe(() => (emitted = true));

    // onRecenter() also guards internally, in addition to the disabled attr.
    component.onRecenter(neighbor());

    expect(emitted).toBe(false);
  });

  it('emits makeRoot when the control is pressed and focal is not the root', () => {
    let fired = false;
    component.makeRoot.subscribe(() => (fired = true));

    element.querySelector<HTMLButtonElement>('[data-testid="concept-hex-make-root"]')?.click();

    expect(fired).toBe(true);
  });

  it('disables the make-root control and shows the root pill when isRoot', () => {
    fixture.componentRef.setInput('fisheye', makeFisheye({ isRoot: true }));
    fixture.detectChanges();

    const btn = element.querySelector<HTMLButtonElement>('[data-testid="concept-hex-make-root"]');
    expect(btn?.disabled).toBe(true);
    expect(element.querySelector('[data-testid="concept-hex-root-pill"]')).toBeTruthy();

    let fired = false;
    component.makeRoot.subscribe(() => (fired = true));
    component.onMakeRoot();
    expect(fired).toBe(false);
  });

  it('shows the lonely-focal hint when there are no neighbours', () => {
    fixture.componentRef.setInput('fisheye', makeFisheye({ neighbors: [] }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="concept-hex-lonely"]')).toBeTruthy();
  });

  it('maps each relation to its i18n key', () => {
    expect(component.relationKey('parent')).toBe('aplus.discovery.rel_parent');
    expect(component.relationKey('child')).toBe('aplus.discovery.rel_child');
    expect(component.relationKey('lateral')).toBe('aplus.discovery.rel_lateral');
  });

  it('has no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
