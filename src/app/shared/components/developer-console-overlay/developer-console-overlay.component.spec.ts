/**
 * Tests for DeveloperConsoleOverlayComponent.
 * Phase 57.2 (CHO-117).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, type Mock } from 'vitest';
import { DeveloperConsoleOverlayComponent } from './developer-console-overlay.component';
import { DeveloperConsoleOverlayService } from '../../../core/services/developer-console-overlay.service';
import { RbacService } from '../../../core/services/rbac.service';
import { signal } from '@angular/core';

interface RbacMock {
  hasCapability: Mock;
  hasRole: Mock;
}

interface OverlayServiceMock {
  isOpen: ReturnType<typeof signal<boolean>>;
  canAccess: ReturnType<typeof signal<boolean>>;
  close: Mock;
  open: Mock;
  toggle: Mock;
}

describe('DeveloperConsoleOverlayComponent', () => {
  let component: DeveloperConsoleOverlayComponent;
  let fixture: ComponentFixture<DeveloperConsoleOverlayComponent>;
  let mockOverlayService: OverlayServiceMock;
  let mockRbac: RbacMock;
  const isOpenSignal = signal(false);
  const canAccessSignal = signal(false);

  beforeEach(async () => {
    mockRbac = {
      hasCapability: vi.fn().mockReturnValue(false),
      hasRole: vi.fn().mockReturnValue(false),
    };

    mockOverlayService = {
      isOpen: isOpenSignal,
      canAccess: canAccessSignal,
      close: vi.fn(),
      open: vi.fn(),
      toggle: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DeveloperConsoleOverlayComponent],
      providers: [
        provideRouter([]),
        { provide: DeveloperConsoleOverlayService, useValue: mockOverlayService },
        { provide: RbacService, useValue: mockRbac },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeveloperConsoleOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should NOT render overlay when closed', () => {
    isOpenSignal.set(false);
    canAccessSignal.set(true);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.dev-overlay');
    expect(overlay).toBeNull();
  });

  it('should NOT render overlay when user lacks access', () => {
    isOpenSignal.set(true);
    canAccessSignal.set(false);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.dev-overlay');
    expect(overlay).toBeNull();
  });

  it('should render overlay when open and user has access (AC-1)', () => {
    isOpenSignal.set(true);
    canAccessSignal.set(true);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.dev-overlay');
    expect(overlay).toBeTruthy();
  });

  it('should have navigation links to developer console pages', () => {
    isOpenSignal.set(true);
    canAccessSignal.set(true);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('.dev-overlay__link');
    expect(links.length).toBe(5);
  });

  it('should have close button that calls close() (AC-5)', () => {
    isOpenSignal.set(true);
    canAccessSignal.set(true);
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.dev-overlay__close');
    expect(closeBtn).toBeTruthy();

    closeBtn.click();
    expect(mockOverlayService.close).toHaveBeenCalled();
  });

  it('should have role="dialog" for accessibility', () => {
    isOpenSignal.set(true);
    canAccessSignal.set(true);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.dev-overlay');
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-label')).toBe('Developer Console');
  });
});
