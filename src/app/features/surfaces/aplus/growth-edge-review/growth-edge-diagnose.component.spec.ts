import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { GrowthEdgeDiagnoseComponent } from './growth-edge-diagnose.component';
import { WeaknessReviewService } from './weakness-review.service';
import {
  StructuredClues,
  WeaknessUploadJob,
  WeaknessUploadKind,
} from './weakness-review.models';
import { TranslateService } from '../../../../core/services/translate.service';

class StubTranslateService {
  instant(key: string): string {
    return key;
  }
}

function makeServiceMock(upload$?: Observable<WeaknessUploadJob>) {
  return {
    // Typed to the real WeaknessReviewService.upload signature so that
    // `.mock.calls[0]` carries the [file, kind, clues] tuple (an untyped
    // `vi.fn()` infers a zero-arg call → `[]`, which `tsc -b` rejects).
    upload: vi.fn<
      (
        file: File,
        kind: WeaknessUploadKind,
        clues: StructuredClues,
      ) => Observable<WeaknessUploadJob>
    >(() => upload$ ?? of({ upload_id: 'u1', status: 'QUEUED' })),
    pollUpload: vi.fn(),
    resume: vi.fn(),
  };
}

async function mount(upload$?: Observable<WeaknessUploadJob>): Promise<{
  fixture: ComponentFixture<GrowthEdgeDiagnoseComponent>;
  component: GrowthEdgeDiagnoseComponent;
  svc: ReturnType<typeof makeServiceMock>;
  router: Router;
}> {
  const svc = makeServiceMock(upload$);
  await TestBed.configureTestingModule({
    imports: [GrowthEdgeDiagnoseComponent],
    providers: [
      provideRouter([]),
      { provide: WeaknessReviewService, useValue: svc },
      { provide: TranslateService, useClass: StubTranslateService },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GrowthEdgeDiagnoseComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, component, svc, router };
}

function fileEvent(name: string, sizeBytes = 10): Event {
  const f = new File([new Uint8Array(sizeBytes)], name);
  return { target: { files: [f] } } as unknown as Event;
}

describe('GrowthEdgeDiagnoseComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('starts with a reactive form defaulting to a marked_test upload', async () => {
    const { component } = await mount();
    expect(component.form.value.upload_kind).toBe('marked_test');
    expect(component.canSubmit()).toBe(false); // no file yet
  });

  it('rejects an unsupported file type and an oversize file', async () => {
    const { component } = await mount();
    component.onFileSelected(fileEvent('virus.exe'));
    expect(component.file()).toBeNull();
    expect(component.fileError()).toBe('aplus.growth_edge_review.diag_error_type');

    component.onFileSelected(fileEvent('huge.pdf', 33 * 1024 * 1024));
    expect(component.file()).toBeNull();
    expect(component.fileError()).toBe('aplus.growth_edge_review.diag_error_size');
  });

  it('accepts a valid file and clears the error', async () => {
    const { component } = await mount();
    component.onFileSelected(fileEvent('past-test.png'));
    expect(component.file()?.name).toBe('past-test.png');
    expect(component.fileError()).toBeNull();
    expect(component.canSubmit()).toBe(true);
  });

  it('source_material requires a one-tap upload-rights consent (D8)', async () => {
    const { component } = await mount();
    component.onFileSelected(fileEvent('textbook.pdf'));
    component.form.patchValue({ upload_kind: 'source_material' });
    expect(component.canSubmit()).toBe(false); // consent not given
    component.form.patchValue({ source_material_consent: true });
    expect(component.canSubmit()).toBe(true);
  });

  it('caps the optional clarification note (bounded — not a prompt)', async () => {
    const { component } = await mount();
    component.form.patchValue({ note: 'x'.repeat(281) });
    expect(component.form.controls.note.invalid).toBe(true);
    component.form.patchValue({ note: 'rushed the last page' });
    expect(component.form.controls.note.valid).toBe(true);
  });

  it('uploads with the file + kind + structured clues, then routes to review', async () => {
    const { component, svc, router } = await mount();
    component.onFileSelected(fileEvent('past-test.png'));
    component.form.patchValue({
      upload_kind: 'notes',
      subject: 'math',
      level: 'primary',
      confidence: 'low',
      note: 'rushed it',
    });
    component.submit();

    expect(svc.upload).toHaveBeenCalledTimes(1);
    const [file, kind, clues] = svc.upload.mock.calls[0] as [
      File,
      WeaknessUploadKind,
      StructuredClues,
    ];
    expect(file).toBeInstanceOf(File);
    expect(kind).toBe('notes');
    expect(clues).toEqual({
      subject: 'math',
      level: 'primary',
      confidence: 'low',
      note: 'rushed it',
    });
    expect(router.navigate).toHaveBeenCalledWith([
      '/a/growth-edges/review',
      'u1',
    ]);
  });

  it('does not upload without a file', async () => {
    const { component, svc } = await mount();
    component.submit();
    expect(svc.upload).not.toHaveBeenCalled();
  });

  it('fail-loud: an upload error surfaces the failed phase (no silent swallow)', async () => {
    const { component, svc, router } = await mount(throwError(() => ({ status: 503 })));
    component.onFileSelected(fileEvent('past-test.png'));
    component.submit();
    expect(svc.upload).toHaveBeenCalled();
    expect(component.uploadPhase()).toBe('failed');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
