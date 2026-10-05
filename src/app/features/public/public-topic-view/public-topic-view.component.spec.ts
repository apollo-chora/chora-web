import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PublicTopicViewComponent } from './public-topic-view.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('PublicTopicViewComponent', () => {
  let fixture: ComponentFixture<PublicTopicViewComponent>;
  let component: PublicTopicViewComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const topicData = {
    id: 'topic-001',
    name: 'Organic Chemistry',
    description: 'Introduction to carbon-based compounds.',
    atom_count: 48,
    difficulty_distribution: [
      { level: 1, count: 12 },
      { level: 2, count: 18 },
      { level: 3, count: 18 },
    ],
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(topicData)) };

    await TestBed.configureTestingModule({
      imports: [PublicTopicViewComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'topic-001' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicTopicViewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display topic name and atom count on success', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="topic-name"]')?.textContent?.trim()).toBe('Organic Chemistry');
    expect(element.querySelector('[data-testid="topic-stats"]')).toBeTruthy();
  });

  it('should show error when topic not found', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Not found')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="topic-error"]')).toBeTruthy();
  });
});
