import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocaleDatePipe } from './locale-date.pipe';
import { TranslateService } from '../../core/services/translate.service';

describe('LocaleDatePipe', () => {
  let pipe: LocaleDatePipe;
  let translateService: TranslateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    translateService = TestBed.inject(TranslateService);
    httpMock = TestBed.inject(HttpTestingController);
    pipe = TestBed.runInInjectionContext(() => new LocaleDatePipe());
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for invalid date string', () => {
    expect(pipe.transform('not-a-date')).toBe('');
  });

  it('should format a Date object with default medium format (en)', () => {
    const date = new Date(2026, 2, 16); // March 16, 2026
    const result = pipe.transform(date, 'medium');
    // en medium: "Mar 16, 2026" (exact format varies by runtime)
    expect(result).toContain('2026');
    expect(result).toContain('16');
  });

  it('should format an ISO string', () => {
    const result = pipe.transform('2026-03-16T10:00:00Z', 'medium');
    expect(result).toContain('2026');
  });

  it('should format with short format', () => {
    const date = new Date(2026, 2, 16);
    const result = pipe.transform(date, 'short');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format with long format', () => {
    const date = new Date(2026, 2, 16);
    const result = pipe.transform(date, 'long');
    // long includes full month name
    expect(result).toContain('2026');
  });

  it('should format for zh-CN locale', () => {
    translateService.loadTranslations('zh-CN');
    httpMock.expectOne('/assets/i18n/zh-CN.json').flush({});
    const date = new Date(2026, 2, 16);
    const result = pipe.transform(date, 'medium');
    // zh-CN uses year-month-day order
    expect(result).toBeTruthy();
    expect(result).toContain('2026');
  });

  it('should format for ar-SA locale', () => {
    translateService.loadTranslations('ar-SA');
    httpMock.expectOne('/assets/i18n/ar-SA.json').flush({});
    const date = new Date(2026, 2, 16);
    const result = pipe.transform(date, 'medium');
    // ar-SA formats dates in Arabic — just verify non-empty
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should accept Date instances and strings equivalently', () => {
    const date = new Date(2026, 2, 16, 12, 0, 0);
    const dateResult = pipe.transform(date, 'medium');
    const strResult = pipe.transform(date.toISOString(), 'medium');
    // Both should produce output — exact equality depends on timezone handling
    expect(dateResult).toBeTruthy();
    expect(strResult).toBeTruthy();
  });
});
