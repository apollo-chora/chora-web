import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PublicPathViewComponent } from './public-path-view.component';
import { BffClientService } from '../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('PublicPathViewComponent', () => {
  let fixture: ComponentFixture<PublicPathViewComponent>;
  let component: PublicPathViewComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const pathData = {
    id: 'path-001',
    title: 'Go Mastery',
    description: 'A comprehensive path to master Go.',
    step_count: 12,
    estimated_duration_minutes: 180,
    completion_rate: 0.85,
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(pathData)) };

    await TestBed.configureTestingModule({
      imports: [PublicPathViewComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'path-001' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicPathViewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display path title and stats on success', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="path-title"]')?.textContent?.trim()).toBe('Go Mastery');
    expect(element.querySelector('[data-testid="path-stats"]')).toBeTruthy();
  });

  it('should format duration correctly', () => {
    fixture.detectChanges();
    expect(component.formatDuration(180)).toBe('3h');
    expect(component.formatDuration(90)).toBe('1h 30m');
    expect(component.formatDuration(45)).toBe('45m');
  });

  it('should show error when path not found', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Not found')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="path-error"]')).toBeTruthy();
  });
});
