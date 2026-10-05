import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PublicContentPreviewComponent } from './public-content-preview.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('PublicContentPreviewComponent', () => {
  let fixture: ComponentFixture<PublicContentPreviewComponent>;
  let component: PublicContentPreviewComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const contentData = {
    id: 'content-001',
    content_type: 'topic' as const,
    title: 'Algebra Fundamentals',
    preview_text: 'Master the basics of algebraic equations.',
    slug: 'algebra-fundamentals',
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(contentData)) };

    await TestBed.configureTestingModule({
      imports: [PublicContentPreviewComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'algebra-fundamentals' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicContentPreviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display content title and type on success', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="content-title"]')?.textContent?.trim()).toBe('Algebra Fundamentals');
    expect(element.querySelector('[data-testid="content-type-indicator"]')?.textContent?.trim()).toBe('Topic');
  });

  it('should show error when content not found', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Not found')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="content-error"]')).toBeTruthy();
  });

  // ---- Augmented branch coverage ----

  describe('ngOnInit slug guard', () => {
    // Drives the `if (!slug)` TRUE arm: when the route has no :slug param the
    // component sets an error state and returns early WITHOUT calling bff.get.
    function buildWithSlug(slug: string | null): {
      bff: { get: ReturnType<typeof vi.fn> };
      fixture: ComponentFixture<PublicContentPreviewComponent>;
      element: HTMLElement;
      component: PublicContentPreviewComponent;
    } {
      const bff = { get: vi.fn().mockReturnValue(of(contentData)) };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PublicContentPreviewComponent],
        providers: [
          provideRouter([]),
          { provide: BffClientService, useValue: bff },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => slug } } },
          },
        ],
      });
      const f = TestBed.createComponent(PublicContentPreviewComponent);
      return { bff, fixture: f, element: f.nativeElement, component: f.componentInstance };
    }

    it('should error and skip the BFF call when slug is null', () => {
      const ctx = buildWithSlug(null);
      ctx.fixture.detectChanges();

      expect(ctx.bff.get).not.toHaveBeenCalled();
      expect(ctx.component.state().status).toBe('error');
      expect(ctx.element.querySelector('[data-testid="content-error"]')).toBeTruthy();
      expect(
        ctx.element.querySelector('[data-testid="content-error"] p')?.textContent?.trim(),
      ).toBe('No content slug provided');
    });

    it('should error and skip the BFF call when slug is an empty string', () => {
      const ctx = buildWithSlug('');
      ctx.fixture.detectChanges();

      expect(ctx.bff.get).not.toHaveBeenCalled();
      expect(ctx.component.errorMessage()).toBe('No content slug provided');
    });
  });

  describe('computed signals — falsy arms', () => {
    // Non-success state: `content()` -> null (ternary falsy), so
    // `contentTypeLabel()` -> '' (its falsy arm). errorMessage() success -> ''.
    it('should expose null content and empty type label before resolution (idle/error)', () => {
      bffMock.get.mockReturnValue(throwError(() => new Error('boom')));
      fixture.detectChanges();

      // status is now 'error' -> content() falsy arm -> null
      expect(component.content()).toBeNull();
      // contentTypeLabel falsy arm -> ''
      expect(component.contentTypeLabel()).toBe('');
      // errorMessage truthy arm -> the message
      expect(component.errorMessage()).toBe('This content could not be found.');
    });

    it('should expose empty errorMessage on success (errorMessage falsy arm)', () => {
      fixture.detectChanges();

      // success state -> errorMessage ternary falsy arm -> ''
      expect(component.errorMessage()).toBe('');
      // content() truthy arm
      expect(component.content()).toEqual(contentData);
    });
  });

  describe('content type label lookup', () => {
    function buildWithType(content_type: 'atom' | 'path'): HTMLElement {
      const bff = {
        get: vi.fn().mockReturnValue(of({ ...contentData, content_type })),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PublicContentPreviewComponent],
        providers: [
          provideRouter([]),
          { provide: BffClientService, useValue: bff },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => 'some-slug' } } },
          },
        ],
      });
      const f = TestBed.createComponent(PublicContentPreviewComponent);
      f.detectChanges();
      return f.nativeElement;
    }

    it('should map content_type "atom" to "Learning Atom"', () => {
      const el = buildWithType('atom');
      expect(
        el.querySelector('[data-testid="content-type-indicator"]')?.textContent?.trim(),
      ).toBe('Learning Atom');
    });

    it('should map content_type "path" to "Learning Path"', () => {
      const el = buildWithType('path');
      expect(
        el.querySelector('[data-testid="content-type-indicator"]')?.textContent?.trim(),
      ).toBe('Learning Path');
    });
  });

  describe('lifecycle', () => {
    it('should unsubscribe on destroy without throwing', () => {
      fixture.detectChanges();
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
