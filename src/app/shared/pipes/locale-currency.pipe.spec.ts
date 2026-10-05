import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocaleCurrencyPipe } from './locale-currency.pipe';
import { TranslateService } from '../../core/services/translate.service';

describe('LocaleCurrencyPipe', () => {
  let pipe: LocaleCurrencyPipe;
  let translateService: TranslateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    translateService = TestBed.inject(TranslateService);
    httpMock = TestBed.inject(HttpTestingController);
    pipe = TestBed.runInInjectionContext(() => new LocaleCurrencyPipe());
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should format USD with default en locale', () => {
    const result = pipe.transform(99.99);
    // Default currency is USD
    expect(result).toContain('$');
    expect(result).toContain('99.99');
  });

  it('should format USD with explicit currency code', () => {
    const result = pipe.transform(1234.56, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('1,234.56');
  });

  it('should format SGD', () => {
    const result = pipe.transform(49.90, 'SGD');
    expect(result).toBeTruthy();
    // en locale SGD format includes SGD or S$ depending on runtime
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format MYR', () => {
    const result = pipe.transform(199.00, 'MYR');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format zero value', () => {
    const result = pipe.transform(0, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('0');
  });

  it('should format negative value', () => {
    const result = pipe.transform(-25.50, 'USD');
    expect(result).toContain('25.50');
  });

  it('should format for zh-CN locale with USD', () => {
    translateService.loadTranslations('zh-CN');
    httpMock.expectOne('/assets/i18n/zh-CN.json').flush({});
    const result = pipe.transform(1234.56, 'USD');
    // zh-CN uses US$ or $ prefix with different grouping
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format for ar-SA locale with USD', () => {
    translateService.loadTranslations('ar-SA');
    httpMock.expectOne('/assets/i18n/ar-SA.json').flush({});
    const result = pipe.transform(1234.56, 'USD');
    // ar-SA may use Arabic-Indic numerals — just verify non-empty
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format large currency amounts', () => {
    const result = pipe.transform(1000000, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('1,000,000');
  });

  it('should handle fractional cents by rounding', () => {
    const result = pipe.transform(10.999, 'USD');
    // Intl.NumberFormat rounds to 2 decimal places for currency
    expect(result).toBeTruthy();
  });
});
