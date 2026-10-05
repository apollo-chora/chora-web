/**
 * chora-file-dropzone.component.spec.ts — U1 (rubric drag-drop dropzone).
 *
 * Shared, presentational file-dropzone control: a drag-and-drop zone + native
 * file-picker + selected-file list with per-file remove. It owns NO service and
 * NO validation — purely presentation. The host wires {@link filesAdded} /
 * {@link fileRemoved} to its own state + validation (extension/size/total cap),
 * so the source-material AND rubric uploads in batch-authoring share one
 * implementation (the rubric upload gains drag-and-drop for free).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChoraFileDropzoneComponent } from './chora-file-dropzone.component';

function pdf(name = 'a.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

/** Fake DragEvent carrying files (jsdom has no real DataTransfer constructor). */
function dropEvent(files: File[]): DragEvent {
  return {
    preventDefault() {},
    dataTransfer: { files },
  } as unknown as DragEvent;
}

describe('ChoraFileDropzoneComponent', () => {
  let fixture: ComponentFixture<ChoraFileDropzoneComponent>;
  let component: ChoraFileDropzoneComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraFileDropzoneComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ChoraFileDropzoneComponent);
    component = fixture.componentInstance;
    // label provides the file input's accessible name (axe).
    fixture.componentRef.setInput('label', 'Source material');
    fixture.detectChanges();
  });

  it('renders the drop zone, file input, label, hint and formats', () => {
    fixture.componentRef.setInput('hint', 'PDF, DOCX, or images');
    fixture.componentRef.setInput('formats', 'PDF · DOCX · max 32MB');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="dropzone"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="input"]')).toBeTruthy();
    expect(el.textContent).toContain('Source material');
    expect(el.textContent).toContain('PDF, DOCX, or images');
    expect(el.textContent).toContain('PDF · DOCX · max 32MB');
  });

  it('toggles the dragging visual state on dragover / dragleave', () => {
    component.onDragOver({ preventDefault() {} } as unknown as DragEvent);
    expect(component.isDragging()).toBe(true);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="dropzone-root"]')
        ?.className,
    ).toContain('dragging');

    component.onDragLeave({ preventDefault() {} } as unknown as DragEvent);
    expect(component.isDragging()).toBe(false);
  });

  it('emits filesAdded with the dropped files and clears dragging on drop', () => {
    let emitted: File[] | undefined;
    component.filesAdded.subscribe((f) => (emitted = f));
    component.onDragOver({ preventDefault() {} } as unknown as DragEvent);
    component.onDrop(dropEvent([pdf('dropped.pdf')]));
    expect(emitted?.map((f) => f.name)).toEqual(['dropped.pdf']);
    expect(component.isDragging()).toBe(false);
  });

  it('emits filesAdded via a real drop event dispatched on the zone element', () => {
    let emitted: File[] | undefined;
    component.filesAdded.subscribe((f) => (emitted = f));
    const zone = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="dropzone"]',
    )!;
    const ev = new Event('drop', { bubbles: true }) as Event & {
      dataTransfer?: { files: File[] };
    };
    ev.dataTransfer = { files: [pdf('real-drop.pdf')] };
    zone.dispatchEvent(ev);
    expect(emitted?.map((f) => f.name)).toEqual(['real-drop.pdf']);
  });

  it('does not emit on a drop carrying no files', () => {
    let count = 0;
    component.filesAdded.subscribe(() => (count += 1));
    component.onDrop({ preventDefault() {} } as unknown as DragEvent);
    expect(count).toBe(0);
  });

  it('emits filesAdded from the file picker and resets the native input', () => {
    let emitted: File[] | undefined;
    component.filesAdded.subscribe((f) => (emitted = f));
    const target = { files: [pdf('picked.pdf')], value: 'C:\\fakepath\\picked.pdf' };
    component.onPicked({ target } as unknown as Event);
    expect(emitted?.map((f) => f.name)).toEqual(['picked.pdf']);
    // Reset so re-picking the same file fires (change) again.
    expect(target.value).toBe('');
  });

  it('renders the selected files with a per-file remove button and emits the index', () => {
    fixture.componentRef.setInput('files', [pdf('one.pdf'), pdf('two.pdf')]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="file-list"]')).toBeTruthy();
    expect(el.querySelectorAll('[data-testid^="file-remove-"]').length).toBe(2);
    expect(el.textContent).toContain('one.pdf');
    expect(el.textContent).toContain('two.pdf');

    let removed: number | undefined;
    component.fileRemoved.subscribe((i) => (removed = i));
    const rm = el.querySelector<HTMLButtonElement>(
      '[data-testid="file-remove-1"]',
    )!;
    rm.click();
    expect(removed).toBe(1);
  });

  it('renders each selected file as a removable badge chip inside the dropzone box', () => {
    fixture.componentRef.setInput('files', [pdf('alpha.pdf'), pdf('beta.pdf')]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const box = el.querySelector('[data-testid="dropzone-root"]')!;
    const chips = box.querySelectorAll<HTMLElement>('.file-dropzone__chip');
    // Files render as badge chips that live INSIDE the dashed box, not below it.
    expect(chips.length).toBe(2);
    expect(box.contains(chips[0])).toBe(true);
    expect(el.querySelector('[data-testid="file-chip-0"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="file-chip-1"]')).toBeTruthy();
    expect(chips[0].textContent).toContain('alpha.pdf');
    // Each chip carries its own remove ("x") control.
    expect(chips[0].querySelector('[data-testid="file-remove-0"]')).toBeTruthy();
    expect(chips[1].querySelector('[data-testid="file-remove-1"]')).toBeTruthy();
  });

  it('emits filesAdded from a real drop dispatched on the dropzone box (root is the drop target)', () => {
    let emitted: File[] | undefined;
    component.filesAdded.subscribe((f) => (emitted = f));
    const box = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="dropzone-root"]',
    )!;
    const ev = new Event('drop', { bubbles: true }) as Event & {
      dataTransfer?: { files: File[] };
    };
    ev.dataTransfer = { files: [pdf('on-box.pdf')] };
    box.dispatchEvent(ev);
    expect(emitted?.map((f) => f.name)).toEqual(['on-box.pdf']);
  });

  it('reflects the multiple input on the native file input', () => {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="input"]',
    )!;
    expect(input.multiple).toBe(false);
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();
    expect(input.multiple).toBe(true);
  });

  it('reflects the accept input on the native file input', () => {
    fixture.componentRef.setInput('accept', '.pdf,.png');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="input"]',
    )!;
    expect(input.accept).toBe('.pdf,.png');
  });

  it('disables the input + remove buttons and suppresses drop when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('files', [pdf('one.pdf')]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el.querySelector<HTMLInputElement>('[data-testid="input"]')!.disabled,
    ).toBe(true);
    expect(
      el.querySelector<HTMLButtonElement>('[data-testid="file-remove-0"]')!.disabled,
    ).toBe(true);

    let count = 0;
    component.filesAdded.subscribe(() => (count += 1));
    component.onDrop(dropEvent([pdf('blocked.pdf')]));
    expect(count).toBe(0);
  });

  it('stays inert on dragover when disabled (no dragging state)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    component.onDragOver({ preventDefault() {} } as unknown as DragEvent);
    expect(component.isDragging()).toBe(false);
  });

  it('does not emit fileRemoved when remove is invoked while disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    let count = 0;
    component.fileRemoved.subscribe(() => (count += 1));
    component.remove(0);
    expect(count).toBe(0);
  });

  it('does not emit from the picker when no files are present (null files)', () => {
    let count = 0;
    component.filesAdded.subscribe(() => (count += 1));
    component.onPicked({ target: { files: null, value: '' } } as unknown as Event);
    expect(count).toBe(0);
  });

  it('prefixes every data-testid with testIdPrefix for per-instance uniqueness', () => {
    fixture.componentRef.setInput('testIdPrefix', 'rubric-');
    fixture.componentRef.setInput('files', [pdf('one.pdf')]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="rubric-dropzone"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rubric-input"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rubric-file-remove-0"]')).toBeTruthy();
  });

  it('has no critical/serious axe violations', async () => {
    fixture.componentRef.setInput('hint', 'Upload your material');
    fixture.componentRef.setInput('files', [pdf('one.pdf')]);
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
  });
});
