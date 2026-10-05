/**
 * AtomEditorSplitPaneComponent — Split-pane rich editor with live preview.
 *
 * Route: /admin/content/atoms/:id/edit-split
 *
 * Features:
 *   - Editor on left, preview on right (desktop >= 1280px), stacked on tablet
 *   - Live LaTeX rendering placeholder (KaTeX integration point)
 *   - Code syntax highlighting via <pre><code> blocks
 *   - Markdown-like formatting support
 *   - Atom metadata editing (type, difficulty, tags)
 *   - Loading, error, and empty states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  input,
  signal,
  computed,
  effect,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

type EditorState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; error: { code: string; message: string } };

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; error: string };

interface AtomData {
  id: string;
  atom_type: string;
  difficulty: number;
  tags: string[];
  content: Record<string, unknown>;
}

@Component({
  selector: 'chora-atom-editor-split-pane',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './atom-editor-split-pane.component.html',
  styleUrl: './atom-editor-split-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomEditorSplitPaneComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  /** Route param: atom id */
  readonly id = input.required<string>();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly editorState = signal<EditorState>({ status: 'idle' });
  readonly saveState = signal<SaveState>({ status: 'idle' });
  readonly atomData = signal<AtomData | null>(null);

  /** Raw editor content (stem / main body) */
  readonly editorContent = signal('');

  /** Active editor tab */
  readonly activeTab = signal<'edit' | 'preview'>('edit');

  /** Preview HTML (rendered from editor content) */
  readonly previewHtml = computed(() => {
    return this.renderPreview(this.editorContent());
  });

  /** Whether content has been modified since last save */
  readonly isDirty = signal(false);

  private subscriptions = new Subscription();

  constructor() {
    // Mark dirty when content changes
    effect(() => {
      this.editorContent();
      // Skip initial
      if (this.editorState().status === 'success') {
        this.isDirty.set(true);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadAtom();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private loadAtom(): void {
    this.editorState.set({ status: 'loading' });

    this.subscriptions.add(
      this.bff.get<AtomData>(
        `/api/v1/admin/atoms/${this.id()}`,
      ).subscribe({
        next: (data) => {
          this.atomData.set(data);
          const stem = typeof data.content['stem'] === 'string'
            ? data.content['stem'] as string
            : JSON.stringify(data.content, null, 2);
          this.editorContent.set(stem);
          this.editorState.set({ status: 'success' });
          this.isDirty.set(false);
        },
        error: (err: Error) => {
          this.editorState.set({
            status: 'error',
            error: { code: 'ATOM_LOAD_FAILED', message: err.message },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------------

  onContentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.editorContent.set(target.value);
  }

  setActiveTab(tab: 'edit' | 'preview'): void {
    this.activeTab.set(tab);
  }

  onSave(): void {
    const atom = this.atomData();
    if (!atom) return;

    this.saveState.set({ status: 'saving' });

    const updatedContent = { ...atom.content, stem: this.editorContent() };

    this.subscriptions.add(
      this.bff.put<AtomData>(
        `/api/v1/admin/atoms/${this.id()}`,
        { content: updatedContent },
      ).subscribe({
        next: () => {
          this.saveState.set({ status: 'saved' });
          this.isDirty.set(false);
          this.toast.show('admin.editor.save-success', 'success');
        },
        error: (err: Error) => {
          this.saveState.set({ status: 'error', error: err.message });
          this.toast.show('admin.editor.save-error', 'error');
        },
      }),
    );
  }

  onInsertLatex(): void {
    const current = this.editorContent();
    this.editorContent.set(current + '\n$$\n\\text{LaTeX expression}\n$$\n');
  }

  onInsertCode(): void {
    const current = this.editorContent();
    this.editorContent.set(current + '\n```\n// code here\n```\n');
  }

  // ---------------------------------------------------------------------------
  // Preview rendering
  // ---------------------------------------------------------------------------

  /**
   * Converts raw editor text to preview HTML.
   * Handles:
   *   - LaTeX blocks ($$..$$) -> placeholder rendering
   *   - Code blocks (```...```) -> <pre><code> with syntax highlighting
   *   - Paragraphs
   */
  private renderPreview(text: string): string {
    if (!text) return '';

    let html = this.escapeHtml(text);

    // LaTeX blocks: $$ ... $$
    html = html.replace(
      /\$\$([\s\S]*?)\$\$/g,
      '<div class="atom-editor-split-pane__latex-block" role="img" aria-label="LaTeX formula"><code>$1</code></div>',
    );

    // Inline LaTeX: $ ... $
    html = html.replace(
      /\$([^$]+)\$/g,
      '<span class="atom-editor-split-pane__latex-inline" role="img" aria-label="LaTeX"><code>$1</code></span>',
    );

    // Code blocks: ``` ... ```
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre class="atom-editor-split-pane__code-block"><code>$2</code></pre>',
    );

    // Line breaks to paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;

    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
