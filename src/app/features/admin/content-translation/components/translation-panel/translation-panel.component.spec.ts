import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { TranslationPanelComponent } from './translation-panel.component';
import { ContentTranslationService } from '../../services/content-translation.service';
import type {
  TranslationState,
  BatchState,
  TranslationResponse,
  BatchTranslationResponse,
} from '../../services/content-translation.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildTranslationResponse(): TranslationResponse {
  return {
    content_id: 'atom-001',
    source_language: 'en',
    target_language: 'zh-CN',
    translated_content: 'Translated text',
    confidence: 0.92,
    word_count: 150,
    governance: {},
  };
}

function buildBatchResponse(): BatchTranslationResponse {
  return {
    job_id: 'batch-001',
    status: 'in_progress',
    results: [
      { content_id: 'atom-001', status: 'completed', translated_content: 'Done', confidence: 0.9 },
      { content_id: 'atom-002', status: 'queued' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const translationState = signal<TranslationState>({ status: 'idle' });
const batchState = signal<BatchState>({ status: 'idle' });
const translationResult = signal<TranslationResponse | null>(null);
const batchResult = signal<BatchTranslationResponse | null>(null);

const mockTranslationService = {
  translationState: translationState.asReadonly(),
  batchState: batchState.asReadonly(),
  translationResult: translationResult.asReadonly(),
  batchResult: batchResult.asReadonly(),
  translate: vi.fn().mockReturnValue(of(buildTranslationResponse())),
  batchTranslate: vi.fn().mockReturnValue(of(buildBatchResponse())),
  resetTranslation: vi.fn(),
  resetBatch: vi.fn(),
};

const mockToast = { show: vi.fn() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TranslationPanelComponent', () => {
  let fixture: ComponentFixture<TranslationPanelComponent>;
  let component: TranslationPanelComponent;


  beforeEach(async () => {
    vi.clearAllMocks();
    translationState.set({ status: 'idle' });
    batchState.set({ status: 'idle' });
    translationResult.set(null);
    batchResult.set(null);

    await TestBed.configureTestingModule({
      imports: [TranslationPanelComponent],
      providers: [
        { provide: ContentTranslationService, useValue: mockTranslationService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with empty content id', () => {
    expect(component.contentId()).toBe('');
  });

  it('defaults source language to en', () => {
    expect(component.sourceLanguage()).toBe('en');
  });

  it('defaults target language to zh-CN', () => {
    expect(component.targetLanguage()).toBe('zh-CN');
  });

  // -----------------------------------------------------------------------
  // Input handlers
  // -----------------------------------------------------------------------

  it('updates contentId on input', () => {
    const event = { target: { value: 'atom-123' } } as unknown as Event;
    component.onContentIdInput(event);
    expect(component.contentId()).toBe('atom-123');
  });

  it('updates source language on change', () => {
    const event = { target: { value: 'zh-CN' } } as unknown as Event;
    component.onSourceLanguageChange(event);
    expect(component.sourceLanguage()).toBe('zh-CN');
  });

  it('updates target language on change', () => {
    const event = { target: { value: 'ta-IN' } } as unknown as Event;
    component.onTargetLanguageChange(event);
    expect(component.targetLanguage()).toBe('ta-IN');
  });

  // -----------------------------------------------------------------------
  // Translate
  // -----------------------------------------------------------------------

  it('calls translate service with correct params', () => {
    component.contentId.set('atom-001');
    component.translate();
    expect(mockTranslationService.translate).toHaveBeenCalledWith({
      content_id: 'atom-001',
      source_language: 'en',
      target_language: 'zh-CN',
    });
  });

  it('does not call translate when content id is empty', () => {
    component.contentId.set('');
    component.translate();
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
  });

  it('does not call translate when content id is whitespace only', () => {
    component.contentId.set('   ');
    component.translate();
    expect(mockTranslationService.translate).not.toHaveBeenCalled();
  });

  it('shows success toast on translation result', () => {
    component.contentId.set('atom-001');
    component.translate();
    expect(mockToast.show).toHaveBeenCalledWith('admin.translation.translate_success', 'success');
  });

  // -----------------------------------------------------------------------
  // Accept / Reject
  // -----------------------------------------------------------------------

  it('shows accepted toast and resets on accept', () => {
    component.onAcceptTranslation('atom-001');
    expect(mockToast.show).toHaveBeenCalledWith('admin.translation.accepted', 'success');
    expect(mockTranslationService.resetTranslation).toHaveBeenCalled();
  });

  it('shows rejected toast and resets on reject', () => {
    component.onRejectTranslation('atom-001');
    expect(mockToast.show).toHaveBeenCalledWith('admin.translation.rejected', 'info');
    expect(mockTranslationService.resetTranslation).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Batch translate
  // -----------------------------------------------------------------------

  it('updates batch content ids on input', () => {
    const event = { target: { value: 'atom-001\natom-002' } } as unknown as Event;
    component.onBatchContentIdsInput(event);
    expect(component.batchContentIds()).toBe('atom-001\natom-002');
  });

  it('calls batchTranslate with parsed content ids', () => {
    component.batchContentIds.set('atom-001\natom-002\natom-003');
    component.batchTranslate();
    expect(mockTranslationService.batchTranslate).toHaveBeenCalledWith({
      content_ids: ['atom-001', 'atom-002', 'atom-003'],
      source_language: 'en',
      target_language: 'zh-CN',
    });
  });

  it('filters empty lines from batch ids', () => {
    component.batchContentIds.set('atom-001\n\natom-002\n  \natom-003');
    component.batchTranslate();
    expect(mockTranslationService.batchTranslate).toHaveBeenCalledWith({
      content_ids: ['atom-001', 'atom-002', 'atom-003'],
      source_language: 'en',
      target_language: 'zh-CN',
    });
  });

  it('does not call batch translate when no ids', () => {
    component.batchContentIds.set('');
    component.batchTranslate();
    expect(mockTranslationService.batchTranslate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('unsubscribes on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
