import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationPreviewComponent } from './translation-preview.component';
import type { TranslationResponse } from '../../services/content-translation.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildTranslation(overrides: Partial<TranslationResponse> = {}): TranslationResponse {
  return {
    content_id: 'atom-001',
    source_language: 'en',
    target_language: 'zh-CN',
    translated_content: 'Translated text in Chinese',
    confidence: 0.92,
    word_count: 150,
    governance: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranslationPreviewComponent', () => {
  let fixture: ComponentFixture<TranslationPreviewComponent>;
  let component: TranslationPreviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationPreviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationPreviewComponent);
    component = fixture.componentInstance;
  });

  function setTranslation(overrides: Partial<TranslationResponse> = {}): void {
    fixture.componentRef.setInput('translation', buildTranslation(overrides));
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders translated content', () => {
    setTranslation();
    expect(fixture.nativeElement.textContent).toContain('Translated text in Chinese');
  });

  // -----------------------------------------------------------------------
  // Confidence classes
  // -----------------------------------------------------------------------

  it('returns high confidence class for >= 0.8', () => {
    setTranslation({ confidence: 0.92 });
    expect(component.confidenceClass()).toBe('translation-preview__confidence--high');
  });

  it('returns medium confidence class for >= 0.5 and < 0.8', () => {
    setTranslation({ confidence: 0.65 });
    expect(component.confidenceClass()).toBe('translation-preview__confidence--medium');
  });

  it('returns low confidence class for < 0.5', () => {
    setTranslation({ confidence: 0.3 });
    expect(component.confidenceClass()).toBe('translation-preview__confidence--low');
  });

  // -----------------------------------------------------------------------
  // Format confidence
  // -----------------------------------------------------------------------

  it('formats confidence as percentage', () => {
    setTranslation({ confidence: 0.92 });
    expect(component.formatConfidence()).toBe('92%');
  });

  it('formats low confidence as percentage', () => {
    setTranslation({ confidence: 0.45 });
    expect(component.formatConfidence()).toBe('45%');
  });

  // -----------------------------------------------------------------------
  // Outputs
  // -----------------------------------------------------------------------

  it('emits accept with content_id', () => {
    setTranslation({ content_id: 'atom-999' });
    const spy = vi.fn();
    component.accept.subscribe(spy);
    component.onAccept();
    expect(spy).toHaveBeenCalledWith('atom-999');
  });

  it('emits reject with content_id', () => {
    setTranslation({ content_id: 'atom-888' });
    const spy = vi.fn();
    component.reject.subscribe(spy);
    component.onReject();
    expect(spy).toHaveBeenCalledWith('atom-888');
  });
});
