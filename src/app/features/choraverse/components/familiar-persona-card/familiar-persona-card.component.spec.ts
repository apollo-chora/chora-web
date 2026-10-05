import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { FamiliarSpecies } from '../../models/familiar.model';
import type { PersonaSnapshot } from '../../models/familiar-chat.model';
import { FamiliarPersonaCardComponent } from './familiar-persona-card.component';

const PERSONA_URL = `${environment.bffBaseUrl}/api/v1/familiar/persona`;

function makePersona(overrides: Partial<PersonaSnapshot> = {}): PersonaSnapshot {
  return {
    archetype: FamiliarSpecies.Owl,
    level: 42,
    stats: {
      curiosity: 80,
      encouragement: 65,
      humor: 50,
      detail: 30,
      formality: 10,
    },
    current_skin_name: 'Galaxy Owl',
    ...overrides,
  };
}

describe('FamiliarPersonaCardComponent', () => {
  let component: FamiliarPersonaCardComponent;
  let fixture: ComponentFixture<FamiliarPersonaCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarPersonaCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarPersonaCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="familiar-persona-card"]');
    expect(el).toBeTruthy();
  });

  it('should return ? for archetypeInitial when no persona loaded', () => {
    expect(component.archetypeInitial()).toBe('?');
  });

  it('should return empty traits when no persona loaded', () => {
    expect(component.traits()).toEqual([]);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---- Augmented coverage ----

  describe('lifecycle / HTTP wiring', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('should request the persona endpoint on init (GET)', () => {
      const req = httpMock.expectOne(PERSONA_URL);
      expect(req.request.method).toBe('GET');
      req.flush(makePersona());
    });

    it('should enter loading state and render the loading element before the response resolves', () => {
      expect(component.personaState().status).toBe('loading');
      const loadingEl = fixture.nativeElement.querySelector('[data-testid="persona-loading"]');
      expect(loadingEl).toBeTruthy();

      httpMock.expectOne(PERSONA_URL).flush(makePersona());
    });

    it('should not render error or persona content while loading', () => {
      const errorEl = fixture.nativeElement.querySelector('[data-testid="persona-error"]');
      const archetypeEl = fixture.nativeElement.querySelector('[data-testid="persona-archetype"]');
      expect(errorEl).toBeNull();
      expect(archetypeEl).toBeNull();

      httpMock.expectOne(PERSONA_URL).flush(makePersona());
    });

    it('should clean up subscriptions on destroy without throwing', () => {
      httpMock.expectOne(PERSONA_URL).flush(makePersona());
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  describe('success state', () => {
    let httpMock: HttpTestingController;

    function flushPersona(p: PersonaSnapshot): void {
      httpMock.expectOne(PERSONA_URL).flush(p);
      fixture.detectChanges();
    }

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('should expose the loaded persona via the computed signal', () => {
      const persona = makePersona();
      flushPersona(persona);

      expect(component.personaState().status).toBe('success');
      expect(component.persona()).toEqual(persona);
    });

    it('should render archetype, skin, level and trait rows after success', () => {
      flushPersona(makePersona());
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="persona-loading"]')).toBeNull();
      expect(el.querySelector('[data-testid="persona-error"]')).toBeNull();

      expect(el.querySelector('[data-testid="persona-archetype"]')?.textContent).toContain('owl');
      expect(el.querySelector('[data-testid="persona-skin"]')?.textContent).toContain('Galaxy Owl');
      expect(el.querySelector('[data-testid="persona-level"]')?.textContent).toContain('42');

      const traits = el.querySelector('[data-testid="persona-traits"]');
      expect(traits).toBeTruthy();
      // 5 trait rows, one per stat
      expect(el.querySelectorAll('.familiar-persona-card__trait').length).toBe(5);
    });

    it('should compute archetypeInitial from the loaded archetype (uppercased)', () => {
      flushPersona(makePersona({ archetype: FamiliarSpecies.Dragon }));
      expect(component.archetypeInitial()).toBe('D');
      const iconEl = fixture.nativeElement.querySelector('[data-testid="persona-icon"]');
      expect(iconEl?.textContent?.trim()).toBe('D');
    });

    it('should build the five traits in canonical order from stats', () => {
      flushPersona(makePersona());
      expect(component.traits()).toEqual([
        { key: 'curiosity', value: 80 },
        { key: 'encouragement', value: 65 },
        { key: 'humor', value: 50 },
        { key: 'detail', value: 30 },
        { key: 'formality', value: 10 },
      ]);
    });

    it('should render each trait value in the template', () => {
      flushPersona(makePersona());
      const traitValues = Array.from(
        fixture.nativeElement.querySelectorAll('.familiar-persona-card__trait-value'),
      ).map((n) => (n as HTMLElement).textContent?.trim());
      expect(traitValues).toEqual(['80', '65', '50', '30', '10']);
    });

    it('should fall back to the default skin i18n key when current_skin_name is null', () => {
      flushPersona(makePersona({ current_skin_name: null }));
      const skinEl = fixture.nativeElement.querySelector('[data-testid="persona-skin"]');
      // Translate pipe returns the raw key in tests
      expect(skinEl?.textContent?.trim()).toBe('choraverse.familiar_persona.default_skin');
    });

    it('should set the level progressbar aria-valuenow and fill width from level', () => {
      flushPersona(makePersona({ level: 73 }));
      const bar = fixture.nativeElement.querySelector('[data-testid="persona-level-bar"]');
      expect(bar?.getAttribute('aria-valuenow')).toBe('73');
      const fill = fixture.nativeElement.querySelector(
        '.familiar-persona-card__level-fill',
      ) as HTMLElement;
      expect(fill.style.width).toBe('73%');
    });

    it('should emit per-trait progressbar testids and aria values', () => {
      flushPersona(makePersona());
      const curiosityBar = fixture.nativeElement.querySelector(
        '[data-testid="trait-bar-curiosity"]',
      );
      expect(curiosityBar).toBeTruthy();
      expect(curiosityBar?.getAttribute('aria-valuenow')).toBe('80');
      expect(curiosityBar?.getAttribute('aria-label')).toBe('curiosity');

      const formalityBar = fixture.nativeElement.querySelector(
        '[data-testid="trait-bar-formality"]',
      );
      expect(formalityBar?.getAttribute('aria-valuenow')).toBe('10');
    });

    it('should label the icon with the archetype', () => {
      flushPersona(makePersona({ archetype: FamiliarSpecies.Phoenix }));
      const icon = fixture.nativeElement.querySelector('[data-testid="persona-icon"]');
      expect(icon?.getAttribute('aria-label')).toBe('phoenix');
    });
  });

  describe('error state', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('should enter error state and render the error element on a 500 response', () => {
      httpMock.expectOne(PERSONA_URL).flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.personaState().status).toBe('error');
      const errorEl = fixture.nativeElement.querySelector('[data-testid="persona-error"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.getAttribute('role')).toBe('alert');
    });

    it('should not render persona content on a 404 error and keep computed null', () => {
      httpMock.expectOne(PERSONA_URL).flush('missing', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.persona()).toBeNull();
      expect(component.traits()).toEqual([]);
      expect(component.archetypeInitial()).toBe('?');
      expect(fixture.nativeElement.querySelector('[data-testid="persona-archetype"]')).toBeNull();
    });
  });
});
