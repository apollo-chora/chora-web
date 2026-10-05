import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PublicAtomViewComponent } from './public-atom-view.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('PublicAtomViewComponent', () => {
  let fixture: ComponentFixture<PublicAtomViewComponent>;
  let component: PublicAtomViewComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const atomData = {
    id: 'atom-001',
    title: 'Photosynthesis Basics',
    atom_type: 'mcq',
    difficulty: 3,
    topic_breadcrumbs: ['Biology', 'Plants'],
    content_preview: 'Learn about the light-dependent reactions.',
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(atomData)) };

    await TestBed.configureTestingModule({
      imports: [PublicAtomViewComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'atom-001' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicAtomViewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display atom title and difficulty on success', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="atom-title"]')?.textContent?.trim()).toBe('Photosynthesis Basics');
    expect(element.querySelector('[data-testid="atom-difficulty"]')?.textContent?.trim()).toContain('3/5');
  });

  it('should show error when atom not found', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Not found')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="atom-error"]')).toBeTruthy();
  });
});
