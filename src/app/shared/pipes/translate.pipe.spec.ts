import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { TranslatePipe } from './translate.pipe';
import { TranslateService } from '../../core/services/translate.service';

/**
 * TranslatePipe is the app's real i18n pipe (standalone, selector `translate`)
 * backed by the root signal-based TranslateService. It must forward optional
 * interpolation params so `{{ token }}` placeholders resolve — dose-preferences
 * (CHO-2045) depends on this for its summary / pager / toggle-aria copy.
 */
class TranslateServiceStub {
  lastKey?: string;
  lastParams?: Record<string, string | number>;
  instant(key: string, params?: Record<string, string | number>): string {
    this.lastKey = key;
    this.lastParams = params;
    // Minimal interpolation stand-in so the pipe contract is observable.
    if (!params) return key;
    return `${key}:${JSON.stringify(params)}`;
  }
}

describe('TranslatePipe', () => {
  let pipe: TranslatePipe;
  let svc: TranslateServiceStub;

  beforeEach(() => {
    svc = new TranslateServiceStub();
    TestBed.configureTestingModule({
      providers: [{ provide: TranslateService, useValue: svc }],
    });
    pipe = TestBed.runInInjectionContext(() => new TranslatePipe());
  });

  it('delegates a bare key to the service', () => {
    expect(pipe.transform('a.b')).toBe('a.b');
    expect(svc.lastKey).toBe('a.b');
    expect(svc.lastParams).toBeUndefined();
  });

  it('forwards interpolation params to the service', () => {
    const out = pipe.transform('summary', { total: 5, excluded: 1 });
    expect(svc.lastParams).toEqual({ total: 5, excluded: 1 });
    expect(out).toContain('total');
  });
});
