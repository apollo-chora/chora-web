/**
 * EmailTemplateEditorComponent — Two-panel template editor with variable toolbar and preview.
 *
 * Route: /admin/communication/email-templates
 *
 * Left panel: template list (selectable).
 * Right panel: editor (subject, body_html) + variable toolbar + preview.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { CommunicationService } from '../../services/communication.service';
import type { EmailTemplate, TemplateVariable } from '../../models/communication.model';

@Component({
  selector: 'chora-email-template-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './email-template-editor.component.html',
  styleUrl: './email-template-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailTemplateEditorComponent implements OnInit, OnDestroy {
  private readonly communicationService = inject(CommunicationService);
  private readonly toast = inject(ToastService);

  @ViewChild('bodyTextarea') bodyTextarea!: ElementRef<HTMLTextAreaElement>;

  // --- State ---
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly templates = signal<EmailTemplate[]>([]);
  readonly selectedTemplateId = signal<string | null>(null);
  readonly editSubject = signal('');
  readonly editBodyHtml = signal('');
  readonly showPreview = signal(false);

  // --- Computed ---
  readonly selectedTemplate = computed(() => {
    const id = this.selectedTemplateId();
    if (!id) return null;
    return this.templates().find((t) => t.id === id) ?? null;
  });

  readonly selectedVariables = computed(() => {
    const tpl = this.selectedTemplate();
    return tpl?.variables ?? [];
  });

  readonly previewHtml = computed(() => {
    let html = this.editBodyHtml();
    for (const v of this.selectedVariables()) {
      const pattern = new RegExp(`\\{\\{${v.name}\\}\\}`, 'g');
      html = html.replace(pattern, v.example_value);
    }
    return html;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.templates().length === 0,
  );

  readonly hasChanges = computed(() => {
    const tpl = this.selectedTemplate();
    if (!tpl) return false;
    return tpl.subject !== this.editSubject() || tpl.body_html !== this.editBodyHtml();
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadTemplates(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.communicationService.loadEmailTemplates().subscribe({
        next: (templates) => {
          if (templates) {
            this.templates.set(templates);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.communication.templates_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  selectTemplate(id: string): void {
    this.selectedTemplateId.set(id);
    const tpl = this.templates().find((t) => t.id === id);
    if (tpl) {
      this.editSubject.set(tpl.subject);
      this.editBodyHtml.set(tpl.body_html);
      this.showPreview.set(false);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedTemplateId() === id;
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  onSubjectChange(value: string): void {
    this.editSubject.set(value);
  }

  onBodyChange(value: string): void {
    this.editBodyHtml.set(value);
  }

  insertVariable(variable: TemplateVariable): void {
    const textarea = this.bodyTextarea?.nativeElement;
    if (!textarea) return;

    const tag = `{{${variable.name}}}`;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = this.editBodyHtml();

    const newValue = current.substring(0, start) + tag + current.substring(end);
    this.editBodyHtml.set(newValue);

    // Restore cursor position after the inserted tag
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + tag.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  togglePreview(): void {
    this.showPreview.set(!this.showPreview());
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  saveTemplate(): void {
    const tpl = this.selectedTemplate();
    if (!tpl || !this.hasChanges()) return;

    this.saving.set(true);

    this.subscriptions.add(
      this.communicationService
        .updateEmailTemplate(tpl.id, {
          subject: this.editSubject(),
          body_html: this.editBodyHtml(),
        })
        .subscribe({
          next: (updated) => {
            this.saving.set(false);
            if (updated) {
              const updatedTemplates = this.templates().map((t) =>
                t.id === tpl.id ? updated : t,
              );
              this.templates.set(updatedTemplates);
              this.editSubject.set(updated.subject);
              this.editBodyHtml.set(updated.body_html);
              this.toast.show('admin.communication.template_saved', 'success');
            } else {
              this.toast.show('admin.communication.template_save_error', 'error');
            }
          },
          error: () => {
            this.saving.set(false);
            this.toast.show('admin.communication.template_save_error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
