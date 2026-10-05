import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestionBatchGeneratorComponent } from './question-batch-generator.component';
import { QuestionBatchPlan } from './question-batch-generator.model';
import { TranslateService } from '../../../core/services/translate.service';

class StubTranslate {
  instant(key: string): string {
    return key;
  }
}

describe('QuestionBatchGeneratorComponent', () => {
  let fixture: ComponentFixture<QuestionBatchGeneratorComponent>;
  let component: QuestionBatchGeneratorComponent;
  let ref: ComponentRef<QuestionBatchGeneratorComponent>;
  let emitted: QuestionBatchPlan[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionBatchGeneratorComponent],
      providers: [{ provide: TranslateService, useClass: StubTranslate }],
    }).compileComponents();
    fixture = TestBed.createComponent(QuestionBatchGeneratorComponent);
    component = fixture.componentInstance;
    ref = fixture.componentRef;
    emitted = [];
    component.planChange.subscribe((p) => emitted.push(p));
    fixture.detectChanges();
  });

  it('emits a valid default plan (one MCQ row of 5, images off)', () => {
    const last = emitted[emitted.length - 1];
    expect(last.type_plan).toEqual([
      { question_type: 'mcq', count: 5, max_images: 0 },
    ]);
    expect(last.total).toBe(5);
    expect(last.allow_images).toBe(false);
    expect(last.valid).toBe(true);
  });

  it('adds a second type and sums the total', () => {
    component.addRow(); // adds the next unused type (oe)
    component.setRowCount(1, 2);
    fixture.detectChanges();
    expect(component.total()).toBe(7);
    const last = emitted[emitted.length - 1];
    expect(last.type_plan.map((q) => q.question_type)).toEqual(['mcq', 'oe']);
    expect(last.total).toBe(7);
    expect(last.valid).toBe(true);
  });

  it('caps the total at maxTotal (invalid above the ceiling)', () => {
    ref.setInput('maxTotal', 10);
    component.setRowCount(0, 11);
    fixture.detectChanges();
    expect(component.valid()).toBe(false);
    expect(emitted[emitted.length - 1].valid).toBe(false);
  });

  it('zeroes per-type images when the master toggle is off', () => {
    component.toggleAllowImages(false);
    component.setRowMaxImages(0, 3);
    fixture.detectChanges();
    // max_images on the row is tracked but the EMITTED plan zeroes it (toggle off).
    expect(emitted[emitted.length - 1].type_plan[0].max_images).toBe(0);
  });

  it('emits per-type image caps when the master toggle is on', () => {
    component.toggleAllowImages(true);
    component.setRowMaxImages(0, 3);
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.allow_images).toBe(true);
    expect(last.type_plan[0].max_images).toBe(3);
  });

  it('clamps max_images to the row count', () => {
    component.toggleAllowImages(true);
    component.setRowCount(0, 4);
    component.setRowMaxImages(0, 9); // > count → clamped to 4
    fixture.detectChanges();
    expect(emitted[emitted.length - 1].type_plan[0].max_images).toBe(4);
  });

  it('clamps a sub-1 count up to 1', () => {
    component.setRowCount(0, 0);
    fixture.detectChanges();
    expect(component.rows()[0].count).toBe(1);
  });

  it('removes a row and re-derives availability', () => {
    component.addRow();
    expect(component.rows().length).toBe(2);
    expect(component.canAddRow()).toBe(false); // both types used
    component.removeRow(1);
    expect(component.rows().length).toBe(1);
    expect(component.canAddRow()).toBe(true);
  });

  // CHO-1825 2b — deterministic per-type image toggles. Independent of the
  // AI-decide cap: every question of a toggled type MUST carry that image.
  it('forces a stem image on a type row when toggled on', () => {
    component.toggleRowImageStem(0, true);
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.type_plan[0].image_for_stem).toBe(true);
    expect(last.type_plan[0].image_for_answer).toBeUndefined();
  });

  it('forces both stem and answer images on a row', () => {
    component.toggleRowImageStem(0, true);
    component.toggleRowImageAnswer(0, true);
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.type_plan[0].image_for_stem).toBe(true);
    expect(last.type_plan[0].image_for_answer).toBe(true);
  });

  it('forced image flags are independent of the AI-images master toggle', () => {
    // The master "Allow AI images" toggle is OFF, yet a forced stem image must
    // still emit — the deterministic path does not depend on the AI-decide cap.
    component.toggleAllowImages(false);
    component.toggleRowImageStem(0, true);
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.allow_images).toBe(false);
    expect(last.type_plan[0].max_images).toBe(0);
    expect(last.type_plan[0].image_for_stem).toBe(true);
  });

  it('clears a forced image flag when unchecked', () => {
    component.toggleRowImageStem(0, true);
    component.toggleRowImageStem(0, false);
    fixture.detectChanges();
    expect(emitted[emitted.length - 1].type_plan[0].image_for_stem).toBeUndefined();
  });

  it('tracks forced flags per row independently', () => {
    component.addRow(); // oe row at index 1
    component.toggleRowImageStem(0, true); // mcq → stem
    component.toggleRowImageAnswer(1, true); // oe → answer
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.type_plan[0].image_for_stem).toBe(true);
    expect(last.type_plan[0].image_for_answer).toBeUndefined();
    expect(last.type_plan[1].image_for_answer).toBe(true);
    expect(last.type_plan[1].image_for_stem).toBeUndefined();
  });
});
