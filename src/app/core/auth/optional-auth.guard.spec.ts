import { TestBed } from '@angular/core/testing';
import { optionalAuthGuard } from './optional-auth.guard';

describe('optionalAuthGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should always allow navigation', () => {
    const result = TestBed.runInInjectionContext(() =>
      optionalAuthGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });
});
