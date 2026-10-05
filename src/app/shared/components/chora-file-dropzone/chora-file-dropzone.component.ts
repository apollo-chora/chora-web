/**
 * ChoraFileDropzoneComponent — shared, presentational file-upload dropzone
 * (U1, rubric drag-drop).
 *
 * A drag-and-drop zone + native file-picker + a list of the currently-selected
 * files with a per-file remove button. It owns NO service and NO validation —
 * purely presentation. The host wires {@link filesAdded} (newly picked/dropped
 * File[]) and {@link fileRemoved} (the index to drop) to its own state +
 * validation (extension / size / total-cap), so the source-material AND rubric
 * uploads in batch-authoring share one implementation — the rubric upload gains
 * drag-and-drop for free.
 *
 * Instance-specific copy (`label` / `hint` / `formats`) arrives already
 * translated from the host; the component's own chrome (the remove-file
 * aria-label) uses its own `file_dropzone.*` i18n namespace, mirroring
 * chora-image-regen-control.
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-file-dropzone',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './chora-file-dropzone.component.html',
  styleUrl: './chora-file-dropzone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoraFileDropzoneComponent {
  /** Big zone title (already translated by the host). */
  readonly label = input<string>('');
  /** Supporting description under the title (already translated). */
  readonly hint = input<string>('');
  /** Optional accepted-formats line (already translated). */
  readonly formats = input<string>('');
  /** Native `accept` attribute, e.g. ".pdf,.docx,.png". */
  readonly accept = input<string>('');
  /** Whether the picker accepts multiple files. */
  readonly multiple = input<boolean>(false);
  /** Current selection (host-owned state — this component is stateless). */
  readonly files = input<readonly File[]>([]);
  /** Disables the picker, drop target and remove buttons. */
  readonly disabled = input<boolean>(false);
  /** Prefix for per-instance data-testids (host passes a unique value). */
  readonly testIdPrefix = input<string>('');

  /** Emits the newly picked / dropped files (host merges + validates). */
  readonly filesAdded = output<File[]>();
  /** Emits the index of the file the author asked to remove. */
  readonly fileRemoved = output<number>();

  /** Drag-over visual state for the drop target. */
  readonly isDragging = signal<boolean>(false);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.disabled()) return;
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (this.disabled()) return;
    const dropped = event.dataTransfer?.files
      ? Array.from(event.dataTransfer.files)
      : [];
    if (dropped.length > 0) {
      this.filesAdded.emit(dropped);
    }
  }

  onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files ? Array.from(input.files) : [];
    if (picked.length > 0) {
      this.filesAdded.emit(picked);
    }
    // Reset so (a) re-picking the same file fires (change) again and (b) each
    // picker open starts empty — accumulation lives in the host's state.
    input.value = '';
  }

  remove(index: number): void {
    if (this.disabled()) return;
    this.fileRemoved.emit(index);
  }
}
