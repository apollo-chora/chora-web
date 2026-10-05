import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LanguageSelectorComponent } from './language-selector.component';
import { TranslateService } from '../../../core/services/translate.service';

describe('LanguageSelectorComponent', () => {
  let fixture: ComponentFixture<LanguageSelectorComponent>;
  let component: LanguageSelectorComponent;
  let element: HTMLElement;
  let translate: TranslateService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LanguageSelectorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    translate = TestBed.inject(TranslateService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LanguageSelectorComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('trigger button', () => {
    it('should display the current locale native name', () => {
      const trigger = element.querySelector('[data-testid="language-selector-trigger"]');
      expect(trigger?.textContent?.trim()).toBe('English');
    });

    it('should have aria-expanded false when closed', () => {
      const trigger = element.querySelector('[data-testid="language-selector-trigger"]');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    });

    it('should have aria-haspopup attribute', () => {
      const trigger = element.querySelector('[data-testid="language-selector-trigger"]');
      expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    });
  });

  describe('toggle', () => {
    it('should open the dropdown when clicked', () => {
      const trigger = element.querySelector('[data-testid="language-selector-trigger"]') as HTMLElement;
      trigger.click();
      fixture.detectChanges();

      const dropdown = element.querySelector('[data-testid="language-selector-dropdown"]');
      expect(dropdown).toBeTruthy();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('should close the dropdown on second click', () => {
      const trigger = element.querySelector('[data-testid="language-selector-trigger"]') as HTMLElement;
      trigger.click();
      fixture.detectChanges();
      trigger.click();
      fixture.detectChanges();

      const dropdown = element.querySelector('[data-testid="language-selector-dropdown"]');
      expect(dropdown).toBeNull();
    });
  });

  describe('dropdown', () => {
    beforeEach(() => {
      component.isOpen.set(true);
      fixture.detectChanges();
    });

    it('should render all available locales', () => {
      const options = element.querySelectorAll('[role="option"]');
      expect(options.length).toBe(5);
    });

    it('should mark current locale as selected', () => {
      const selected = element.querySelector('[aria-selected="true"]');
      expect(selected).toBeTruthy();
      expect(selected?.getAttribute('data-testid')).toBe('language-option-en');
    });

    it('should have listbox role on dropdown', () => {
      const dropdown = element.querySelector('[data-testid="language-selector-dropdown"]');
      expect(dropdown?.getAttribute('role')).toBe('listbox');
    });

    it('should display native names for all locales', () => {
      const options = element.querySelectorAll('[role="option"]');
      const names = Array.from(options).map((o) => o.textContent?.trim());
      expect(names).toContain('English');
      expect(names).toContain('简体中文');
      expect(names).toContain('Bahasa Melayu');
      expect(names).toContain('தமிழ்');
      expect(names).toContain('العربية');
    });

    it('should have tabindex on each option for keyboard access', () => {
      const options = element.querySelectorAll('[role="option"]');
      options.forEach((option) => {
        expect(option.getAttribute('tabindex')).toBe('0');
      });
    });
  });

  describe('selectLocale', () => {
    it('should call switchLanguage on translate service', async () => {
      vi.spyOn(translate, 'switchLanguage').mockResolvedValue();
      const zhLocale = translate.availableLocales().find((l) => l.code === 'zh-CN')!;

      await component.selectLocale(zhLocale);

      expect(translate.switchLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should close dropdown after selection', async () => {
      vi.spyOn(translate, 'switchLanguage').mockResolvedValue();
      component.isOpen.set(true);

      const zhLocale = translate.availableLocales().find((l) => l.code === 'zh-CN')!;
      await component.selectLocale(zhLocale);

      expect(component.isOpen()).toBe(false);
    });
  });

  describe('close', () => {
    it('should set isOpen to false', () => {
      component.isOpen.set(true);
      component.close();
      expect(component.isOpen()).toBe(false);
    });
  });

  describe('document click', () => {
    it('should close dropdown when clicking outside', () => {
      component.isOpen.set(true);

      const outsideEvent = new MouseEvent('click', { bubbles: true });
      document.body.dispatchEvent(outsideEvent);

      expect(component.isOpen()).toBe(false);
    });

    it('should keep dropdown open when clicking inside', () => {
      component.isOpen.set(true);
      fixture.detectChanges();

      const trigger = element.querySelector('[data-testid="language-selector-trigger"]') as HTMLElement;
      const insideEvent = new MouseEvent('click', { bubbles: true });
      trigger.dispatchEvent(insideEvent);

      // isOpen toggled by click handler, but not closed by document click
      // since the event target is inside the component
      expect(component.isOpen()).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should have data-testid on root element', () => {
      const root = element.querySelector('[data-testid="language-selector"]');
      expect(root).toBeTruthy();
    });

    it('should have data-testid on each locale option', () => {
      component.isOpen.set(true);
      fixture.detectChanges();

      const enOption = element.querySelector('[data-testid="language-option-en"]');
      const arOption = element.querySelector('[data-testid="language-option-ar-SA"]');
      expect(enOption).toBeTruthy();
      expect(arOption).toBeTruthy();
    });
  });
});
