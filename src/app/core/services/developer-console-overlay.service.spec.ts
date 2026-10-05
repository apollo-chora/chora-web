/**
 * Tests for DeveloperConsoleOverlayService.
 * Phase 57.2 (CHO-117).
 */
import { TestBed } from '@angular/core/testing';
import { vi, type Mock } from 'vitest';
import { DeveloperConsoleOverlayService } from './developer-console-overlay.service';
import { RbacService } from './rbac.service';

interface RbacMock {
  hasCapability: Mock;
  hasRole: Mock;
}

describe('DeveloperConsoleOverlayService', () => {
  let service: DeveloperConsoleOverlayService;
  let mockRbac: RbacMock;

  beforeEach(() => {
    mockRbac = {
      hasCapability: vi.fn().mockReturnValue(false),
      hasRole: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        DeveloperConsoleOverlayService,
        { provide: RbacService, useValue: mockRbac },
      ],
    });
    service = TestBed.inject(DeveloperConsoleOverlayService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start closed', () => {
    expect(service.isOpen()).toBe(false);
  });

  describe('toggle — role gating', () => {
    it('should NOT open for users without developer role (AC-4)', () => {
      mockRbac.hasRole.mockReturnValue(false);
      mockRbac.hasCapability.mockReturnValue(false);

      service.toggle();

      expect(service.isOpen()).toBe(false);
    });

    it('should open for super_admin (AC-1)', () => {
      mockRbac.hasRole.mockImplementation((role: string) => role === 'super_admin');

      service.toggle();

      expect(service.isOpen()).toBe(true);
    });

    it('should open for developer role', () => {
      mockRbac.hasRole.mockImplementation((role: string) => role === 'developer');

      service.toggle();

      expect(service.isOpen()).toBe(true);
    });

    it('should open for developer:console capability', () => {
      mockRbac.hasCapability.mockImplementation((cap: string) => cap === 'developer:console');

      service.toggle();

      expect(service.isOpen()).toBe(true);
    });
  });

  describe('toggle — open/close (AC-5)', () => {
    beforeEach(() => {
      mockRbac.hasRole.mockImplementation((role: string) => role === 'super_admin');
    });

    it('should toggle open then closed', () => {
      service.toggle();
      expect(service.isOpen()).toBe(true);

      service.toggle();
      expect(service.isOpen()).toBe(false);
    });
  });

  describe('close and open', () => {
    beforeEach(() => {
      mockRbac.hasRole.mockImplementation((role: string) => role === 'developer');
    });

    it('close() should set isOpen to false', () => {
      service.open();
      expect(service.isOpen()).toBe(true);

      service.close();
      expect(service.isOpen()).toBe(false);
    });

    it('open() should set isOpen to true when user has access', () => {
      service.open();
      expect(service.isOpen()).toBe(true);
    });

    it('open() should NOT set isOpen if user lacks access', () => {
      mockRbac.hasRole.mockReturnValue(false);
      mockRbac.hasCapability.mockReturnValue(false);

      service.open();
      expect(service.isOpen()).toBe(false);
    });
  });

  describe('keyboard handler', () => {
    beforeEach(() => {
      mockRbac.hasRole.mockImplementation((role: string) => role === 'super_admin');
    });

    it('should toggle on backtick key press', () => {
      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(true);
    });

    it('should NOT toggle when typing in an input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: '`',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
      document.body.removeChild(input);
    });

    // --- Augmented branch coverage (key === '`' FALSE arm + isInputFocused arms) ---

    it('should NOT toggle on a non-backtick key (key === "`" first && operand false)', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
    });

    it('should toggle on backtick when target is a non-input element (isInputFocused all-OR-false through a real HTMLElement)', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: div });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(true);
      document.body.removeChild(div);
    });

    it('should NOT toggle when typing in a textarea (textarea OR arm)', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: textarea });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
      document.body.removeChild(textarea);
    });

    it('should NOT toggle when typing in a select (select OR arm)', () => {
      const select = document.createElement('select');
      document.body.appendChild(select);

      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: select });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
      document.body.removeChild(select);
    });

    it('should NOT toggle when target is contenteditable (isContentEditable OR arm)', () => {
      const div = document.createElement('div');
      // jsdom does not compute layout, so force the contenteditable getter.
      Object.defineProperty(div, 'isContentEditable', { value: true });
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: div });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
      document.body.removeChild(div);
    });

    it('should toggle on backtick when the event target is null (not an HTMLElement → isInputFocused false)', () => {
      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: null });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(true);
    });

    it('should stop responding to backtick after ngOnDestroy (removeEventListener path)', () => {
      service.ngOnDestroy();

      const event = new KeyboardEvent('keydown', { key: '`', bubbles: true });
      Object.defineProperty(event, 'target', { value: null });
      document.dispatchEvent(event);

      expect(service.isOpen()).toBe(false);
    });
  });
});
