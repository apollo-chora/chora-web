import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SurfaceLandingComponent, SURFACES, SurfaceKey } from './surface-landing.component';

describe('SurfaceLandingComponent', () => {
  let fixture: ComponentFixture<SurfaceLandingComponent>;
  let component: SurfaceLandingComponent;
  let element: HTMLElement;

  function setup(surface: SurfaceKey): void {
    fixture = TestBed.createComponent(SurfaceLandingComponent);
    fixture.componentRef.setInput('surface', surface);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurfaceLandingComponent],
    }).compileComponents();
  });

  describe('surface metadata catalogue', () => {
    it('exposes all 5 CHORA surface keys', () => {
      expect(Object.keys(SURFACES).sort()).toEqual(
        ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'].sort(),
      );
    });

    it('letters spell C-H-O-R-A (regardless of key order)', () => {
      const letters = Object.values(SURFACES)
        .map((m) => m.letter)
        .sort();
      expect(letters).toEqual(['A', 'C', 'H', 'O', 'R']);
    });

    it.each<[SurfaceKey, string]>([
      ['aplus', 'A+'],
      ['cplus', 'C+'],
      ['hplus', 'H+'],
      ['oplus', 'O+'],
      ['rplus', 'R+'],
    ])('%s has shortName %s', (key, expected) => {
      expect(SURFACES[key].shortName).toBe(expected);
    });
  });

  describe('rendering', () => {
    it('creates with surface input set', () => {
      setup('aplus');
      expect(component).toBeTruthy();
    });

    it('renders the surface short name', () => {
      setup('cplus');
      const name = element.querySelector('[data-testid="surface-name"]');
      expect(name?.textContent?.trim()).toBe('C+');
    });

    it('renders the surface tagline', () => {
      setup('hplus');
      const tagline = element.querySelector('[data-testid="surface-tagline"]');
      expect(tagline?.textContent?.trim()).toBe('tenant operations hub');
    });

    it('renders the cyan-led C+ tagline (Stitch canon)', () => {
      setup('cplus');
      const tagline = element.querySelector('[data-testid="surface-tagline"]');
      expect(tagline?.textContent?.trim()).toBe('your curiosity, your circle');
    });

    it('renders the Stage 0 status note', () => {
      setup('oplus');
      const status = element.querySelector('[data-testid="surface-status"]');
      expect(status?.textContent).toContain('Stage 0');
      expect(status?.textContent).toContain('O+');
    });

    it('applies the surface-{key} accent class on the root', () => {
      setup('rplus');
      const root = element.querySelector('[data-testid="surface-landing-rplus"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('renders the single-letter brand badge', () => {
      setup('aplus');
      const badge = element.querySelector('.surface-landing__badge');
      expect(badge?.textContent?.trim()).toBe('A');
    });
  });

  describe('computed meta', () => {
    it('reflects the input surface', () => {
      setup('cplus');
      expect(component.meta().longName).toBe('Circle+');
    });

    it('recomputes when surface input changes', () => {
      setup('aplus');
      expect(component.meta().shortName).toBe('A+');

      fixture.componentRef.setInput('surface', 'rplus');
      fixture.detectChanges();

      expect(component.meta().shortName).toBe('R+');
    });
  });
});
