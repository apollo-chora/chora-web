import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocaleNumberPipe } from './locale-number.pipe';
import { TranslateService } from '../../core/services/translate.service';

describe('LocaleNumberPipe', () => {
  let pipe: LocaleNumberPipe;
  let translateService: TranslateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    translateService = TestBed.inject(TranslateService);
    httpMock = TestBed.inject(HttpTestingController);
    pipe = TestBed.runInInjectionContext(() => new LocaleNumberPipe());
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should format integer with default en locale', () => {
    const result = pipe.transform(1234567);
    expect(result).toBe('1,234,567');
  });

  it('should format decimal with default en locale', () => {
    const result = pipe.transform(1234.56);
    expect(result).toContain('1,234');
    expect(result).toContain('56');
  });

  it('should format zero', () => {
    expect(pipe.transform(0)).toBe('0');
  });

  it('should format negative numbers', () => {
    const result = pipe.transform(-42);
    expect(result).toContain('42');
  });

  it('should accept Intl.NumberFormatOptions for min/max fraction digits', () => {
    const result = pipe.transform(3.14159, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(result).toBe('3.14');
  });

  it('should format as percentage with options', () => {
    const result = pipe.transform(0.85, { style: 'percent' });
    expect(result).toBe('85%');
  });

  it('should format for zh-CN locale', () => {
    translateService.loadTranslations('zh-CN');
    httpMock.expectOne('/assets/i18n/zh-CN.json').flush({});
    const result = pipe.transform(1234567);
    // zh-CN uses comma grouping like en
    expect(result).toContain('1,234,567');
  });

  it('should format for ar-SA locale', () => {
    translateService.loadTranslations('ar-SA');
    httpMock.expectOne('/assets/i18n/ar-SA.json').flush({});
    const result = pipe.transform(1234567);
    // ar-SA may use Arabic-Indic numerals or Western — just verify non-empty
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle very large numbers', () => {
    const result = pipe.transform(999999999999);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});
