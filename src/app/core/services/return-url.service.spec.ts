import { TestBed } from '@angular/core/testing';
import { ReturnUrlService } from './return-url.service';

describe('ReturnUrlService', () => {
  let service: ReturnUrlService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReturnUrlService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should capture and expose return URL', () => {
    service.capture('/dashboard/atoms');
    expect(service.returnUrl()).toBe('/dashboard/atoms');
  });

  it('should persist to sessionStorage', () => {
    service.capture('/learning/path/1');
    expect(sessionStorage.getItem('chora_return_url')).toBe('/learning/path/1');
  });

  it('should consume and clear return URL', () => {
    service.capture('/settings');
    const url = service.consume();
    expect(url).toBe('/settings');
    expect(service.returnUrl()).toBeNull();
    expect(sessionStorage.getItem('chora_return_url')).toBeNull();
  });

  it('should ignore /login as return URL', () => {
    service.capture('/login');
    expect(service.returnUrl()).toBeNull();
  });

  it('should ignore /register as return URL', () => {
    service.capture('/register');
    expect(service.returnUrl()).toBeNull();
  });

  it('should return null when nothing captured', () => {
    expect(service.consume()).toBeNull();
  });
});
