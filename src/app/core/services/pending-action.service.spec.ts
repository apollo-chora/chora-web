import { TestBed } from '@angular/core/testing';
import { PendingActionService } from './pending-action.service';

describe('PendingActionService', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function createService(): PendingActionService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(PendingActionService);
  }

  it('should be created', () => {
    expect(createService()).toBeTruthy();
  });

  it('should capture and expose a pending action', () => {
    const service = createService();
    service.capture({ type: 'referral', code: 'ABC123', capturedAt: Date.now() });
    expect(service.action()?.code).toBe('ABC123');
    expect(service.action()?.type).toBe('referral');
  });

  it('should persist to sessionStorage', () => {
    const service = createService();
    service.capture({ type: 'invite', code: 'INV-1', capturedAt: Date.now() });
    const stored = sessionStorage.getItem('chora_pending_action');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).code).toBe('INV-1');
  });

  it('should consume and clear action', () => {
    const service = createService();
    service.capture({ type: 'enroll', code: 'E1', capturedAt: Date.now() });
    const action = service.consume();
    expect(action?.code).toBe('E1');
    expect(service.action()).toBeNull();
    expect(sessionStorage.getItem('chora_pending_action')).toBeNull();
  });

  it('should return null when nothing captured', () => {
    const service = createService();
    expect(service.consume()).toBeNull();
  });

  it('should discard expired actions from storage', () => {
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    sessionStorage.setItem(
      'chora_pending_action',
      JSON.stringify({ type: 'referral', code: 'OLD', capturedAt: expired }),
    );
    const service = createService();
    expect(service.action()).toBeNull();
  });

  it('should restore valid actions from storage', () => {
    sessionStorage.setItem(
      'chora_pending_action',
      JSON.stringify({ type: 'invite', code: 'VALID', capturedAt: Date.now() }),
    );
    const service = createService();
    expect(service.action()?.code).toBe('VALID');
  });
});
