import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BatchTranslateQueueComponent } from './batch-translate-queue.component';
import type { BatchTranslationResponse, BatchTranslationResult } from '../../services/content-translation.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildBatch(overrides: Partial<BatchTranslationResponse> = {}): BatchTranslationResponse {
  return {
    job_id: 'batch-001',
    status: 'in_progress',
    results: [
      { content_id: 'atom-001', status: 'completed', translated_content: 'Done 1', confidence: 0.9 },
      { content_id: 'atom-002', status: 'completed', translated_content: 'Done 2', confidence: 0.85 },
      { content_id: 'atom-003', status: 'in_progress' },
      { content_id: 'atom-004', status: 'queued' },
      { content_id: 'atom-005', status: 'failed', error: 'Content too long' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchTranslateQueueComponent', () => {
  let fixture: ComponentFixture<BatchTranslateQueueComponent>;
  let component: BatchTranslateQueueComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BatchTranslateQueueComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BatchTranslateQueueComponent);
    component = fixture.componentInstance;
  });

  function setBatch(overrides: Partial<BatchTranslationResponse> = {}): void {
    fixture.componentRef.setInput('batch', buildBatch(overrides));
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Computed values
  // -----------------------------------------------------------------------

  it('calculates completedCount correctly', () => {
    setBatch();
    expect(component.completedCount()).toBe(2);
  });

  it('calculates totalCount correctly', () => {
    setBatch();
    expect(component.totalCount()).toBe(5);
  });

  it('calculates progressPercent correctly', () => {
    setBatch();
    expect(component.progressPercent()).toBe(40); // 2/5 = 40%
  });

  it('returns 0 progress for empty results', () => {
    setBatch({ results: [] });
    expect(component.progressPercent()).toBe(0);
  });

  it('returns 100 when all completed', () => {
    setBatch({
      results: [
        { content_id: 'a', status: 'completed', translated_content: 'X', confidence: 0.9 },
        { content_id: 'b', status: 'completed', translated_content: 'Y', confidence: 0.8 },
      ],
    });
    expect(component.progressPercent()).toBe(100);
  });

  // -----------------------------------------------------------------------
  // Status helpers
  // -----------------------------------------------------------------------

  it('returns correct statusClass for completed', () => {
    setBatch();
    const result: BatchTranslationResult = { content_id: 'a', status: 'completed' };
    expect(component.statusClass(result)).toBe('batch-translate-queue__item-status--completed');
  });

  it('returns correct statusClass for failed', () => {
    setBatch();
    const result: BatchTranslationResult = { content_id: 'a', status: 'failed', error: 'err' };
    expect(component.statusClass(result)).toBe('batch-translate-queue__item-status--failed');
  });

  it('returns correct statusClass for queued', () => {
    setBatch();
    const result: BatchTranslationResult = { content_id: 'a', status: 'queued' };
    expect(component.statusClass(result)).toBe('batch-translate-queue__item-status--queued');
  });

  it('returns translation key for statusLabel', () => {
    setBatch();
    expect(component.statusLabel('completed')).toBe('admin.translation.batch_status_completed');
    expect(component.statusLabel('failed')).toBe('admin.translation.batch_status_failed');
  });
});
