import { TestBed, /* fakeAsync/tick removed for zoneless */ } from '@angular/core/testing';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmDialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start hidden', () => {
    expect(service.state().visible).toBe(false);
  });

  it('should show dialog when confirm is called', () => {
    service.confirm({ title: 'Delete?', message: 'Are you sure?' });

    expect(service.state().visible).toBe(true);
    expect(service.state().options.title).toBe('Delete?');
    expect(service.state().options.message).toBe('Are you sure?');
  });

  it('should use default confirm text', () => {
    service.confirm({ title: 'T', message: 'M' });
    expect(service.state().options.confirmText).toBe('confirm_dialog.confirm');
  });

  it('should use default cancel text', () => {
    service.confirm({ title: 'T', message: 'M' });
    expect(service.state().options.cancelText).toBe('confirm_dialog.cancel');
  });

  it('should use default info variant', () => {
    service.confirm({ title: 'T', message: 'M' });
    expect(service.state().options.variant).toBe('info');
  });

  it('should use custom confirm text', () => {
    service.confirm({ title: 'T', message: 'M', confirmText: 'Yes, delete' });
    expect(service.state().options.confirmText).toBe('Yes, delete');
  });

  it('should use custom cancel text', () => {
    service.confirm({ title: 'T', message: 'M', cancelText: 'Nope' });
    expect(service.state().options.cancelText).toBe('Nope');
  });

  it('should use custom variant', () => {
    service.confirm({ title: 'T', message: 'M', variant: 'danger' });
    expect(service.state().options.variant).toBe('danger');
  });

  it('should resolve true when _resolve(true) is called', async () => {
    const promise = service.confirm({ title: 'T', message: 'M' });

    service._resolve(true);
    const result = await promise;

    expect(result).toBe(true);
    expect(service.state().visible).toBe(false);
  });

  it('should resolve false when _resolve(false) is called', async () => {
    const promise = service.confirm({ title: 'T', message: 'M' });

    service._resolve(false);
    const result = await promise;

    expect(result).toBe(false);
    expect(service.state().visible).toBe(false);
  });

  it('should hide dialog after resolving', async () => {
    service.confirm({ title: 'T', message: 'M' });
    expect(service.state().visible).toBe(true);

    service._resolve(true);
    await Promise.resolve();

    expect(service.state().visible).toBe(false);
    expect(service.state().resolve).toBeNull();
  });

  it('should handle _resolve when no dialog is active', () => {
    // Should not throw
    expect(() => service._resolve(true)).not.toThrow();
  });

  it('should replace current dialog with new confirm call', async () => {
    let firstResult: boolean | undefined;

    service.confirm({ title: 'First', message: 'M1' }).then((v) => {
      firstResult = v;
    });

    // Second call replaces the first — first promise's resolve is lost
    const secondPromise = service.confirm({ title: 'Second', message: 'M2' });

    expect(service.state().options.title).toBe('Second');

    service._resolve(true);
    const secondResult = await secondPromise;

    expect(secondResult).toBe(true);
    // First result never resolved since it was replaced
    expect(firstResult).toBeUndefined();
  });
});
