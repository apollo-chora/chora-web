import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';
import { MAX_VISIBLE_TOASTS } from './toast.model';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    service.dismissAll();
    vi.useRealTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty toasts', () => {
    expect(service.toasts()).toEqual([]);
  });

  describe('show', () => {
    it('should add a success toast', () => {
      service.show('Success!', 'success');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].message).toBe('Success!');
      expect(toasts[0].type).toBe('success');
    });

    it('should add an error toast', () => {
      service.show('Error occurred', 'error');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('error');
    });

    it('should add a warning toast', () => {
      service.show('Warning!', 'warning');

      const toasts = service.toasts();
      expect(toasts[0].type).toBe('warning');
    });

    it('should add an info toast', () => {
      service.show('Info message', 'info');

      const toasts = service.toasts();
      expect(toasts[0].type).toBe('info');
    });

    it('should return toast ID', () => {
      const id = service.show('Test', 'info');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should generate unique IDs', () => {
      const id1 = service.show('First', 'info');
      const id2 = service.show('Second', 'info');
      expect(id1).not.toBe(id2);
    });

    it('should use default duration for success (5000ms)', () => {
      service.show('Success!', 'success');
      expect(service.toasts()[0].duration).toBe(5000);
    });

    it('should use default duration for info (5000ms)', () => {
      service.show('Info', 'info');
      expect(service.toasts()[0].duration).toBe(5000);
    });

    it('should use default duration for error (8000ms)', () => {
      service.show('Error', 'error');
      expect(service.toasts()[0].duration).toBe(8000);
    });

    it('should use default duration for warning (8000ms)', () => {
      service.show('Warning', 'warning');
      expect(service.toasts()[0].duration).toBe(8000);
    });

    it('should allow custom duration', () => {
      service.show('Custom', 'info', 3000);
      expect(service.toasts()[0].duration).toBe(3000);
    });

    it('should stack multiple toasts', () => {
      service.show('First', 'info');
      service.show('Second', 'success');
      service.show('Third', 'error');

      expect(service.toasts().length).toBe(3);
    });

    it('should enforce max 5 visible toasts (FIFO)', () => {
      for (let i = 0; i < 7; i++) {
        service.show(`Toast ${i}`, 'info');
      }

      const toasts = service.toasts();
      expect(toasts.length).toBe(MAX_VISIBLE_TOASTS);
      // Oldest should have been removed — remaining are 2,3,4,5,6
      expect(toasts[0].message).toBe('Toast 2');
      expect(toasts[4].message).toBe('Toast 6');
    });
  });

  describe('dismiss', () => {
    it('should remove a specific toast by ID', () => {
      const id = service.show('To dismiss', 'info');
      service.show('To keep', 'success');

      service.dismiss(id);

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].message).toBe('To keep');
    });

    it('should handle dismissing non-existent ID gracefully', () => {
      service.show('Existing', 'info');
      service.dismiss('non-existent-id');
      expect(service.toasts().length).toBe(1);
    });
  });

  describe('dismissAll', () => {
    it('should remove all toasts', () => {
      service.show('First', 'info');
      service.show('Second', 'error');
      service.show('Third', 'warning');

      service.dismissAll();

      expect(service.toasts().length).toBe(0);
    });

    it('should handle dismissAll when no toasts exist', () => {
      service.dismissAll();
      expect(service.toasts().length).toBe(0);
    });
  });

  describe('auto-dismiss', () => {
    it('should auto-dismiss success toast after default duration', () => {
      service.show('Auto dismiss', 'success');
      expect(service.toasts().length).toBe(1);

      vi.advanceTimersByTime(5000);
      expect(service.toasts().length).toBe(0);
    });

    it('should auto-dismiss error toast after default duration', () => {
      service.show('Error auto dismiss', 'error');
      expect(service.toasts().length).toBe(1);

      vi.advanceTimersByTime(8000);
      expect(service.toasts().length).toBe(0);
    });

    it('should auto-dismiss with custom duration', () => {
      service.show('Custom duration', 'info', 2000);
      expect(service.toasts().length).toBe(1);

      vi.advanceTimersByTime(1999);
      expect(service.toasts().length).toBe(1);

      vi.advanceTimersByTime(1);
      expect(service.toasts().length).toBe(0);
    });

    it('should not auto-dismiss before duration expires', () => {
      service.show('Not yet', 'success');

      vi.advanceTimersByTime(4999);
      expect(service.toasts().length).toBe(1);

      vi.advanceTimersByTime(1);
      expect(service.toasts().length).toBe(0);
    });

    it('should cancel auto-dismiss timer on manual dismiss', () => {
      const id = service.show('Manual dismiss', 'success');
      service.dismiss(id);
      expect(service.toasts().length).toBe(0);

      // Timer firing after manual dismiss should not cause issues
      vi.advanceTimersByTime(5000);
      expect(service.toasts().length).toBe(0);
    });

    it('should cancel all auto-dismiss timers on dismissAll', () => {
      service.show('Toast 1', 'success');
      service.show('Toast 2', 'error');

      service.dismissAll();
      expect(service.toasts().length).toBe(0);

      // Timers should be cleared
      vi.advanceTimersByTime(10000);
      expect(service.toasts().length).toBe(0);
    });
  });
});
