/**
 * SessionCreationComponent — Training session builder with atom browser,
 * drag-drop agenda reordering, and per-atom delivery notes.
 *
 * Route: /admin/training/create
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import {
  TrainingAdminService,
  type AtomSearchResult,
} from '../../services/training-admin.service';

interface AgendaEntry {
  atom_id: string;
  atom_title: string;
  atom_type: string;
  order: number;
  delivery_notes: string;
  duration_minutes: number;
}

@Component({
  selector: 'chora-session-creation',
  standalone: true,
  imports: [FormsModule, TranslatePipe, CdkDrag, CdkDropList],
  templateUrl: './session-creation.component.html',
  styleUrl: './session-creation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionCreationComponent {
  private readonly router = inject(Router);
  private readonly trainingService = inject(TrainingAdminService);

  // --- Form fields ---
  readonly title = signal('');
  readonly description = signal('');
  readonly scheduledAt = signal('');
  readonly durationMinutes = signal(60);
  readonly maxParticipants = signal(30);
  readonly venueId = signal('');

  // --- Atom search ---
  readonly searchQuery = signal('');
  readonly atomResults = this.trainingService.atomResults;
  readonly atomSearchState = this.trainingService.atomSearchState;

  // --- Agenda ---
  readonly agenda = signal<AgendaEntry[]>([]);

  // --- State ---
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');

  readonly canSubmit = computed(
    () =>
      this.title().trim().length > 0 &&
      this.scheduledAt().length > 0 &&
      this.agenda().length > 0 &&
      !this.isSubmitting(),
  );

  readonly totalDuration = computed(() =>
    this.agenda().reduce((sum, item) => sum + item.duration_minutes, 0),
  );

  private subscriptions = new Subscription();

  searchAtoms(): void {
    const query = this.searchQuery().trim();
    if (query.length < 2) return;

    this.subscriptions.add(
      this.trainingService.searchAtoms(query).subscribe(),
    );
  }

  addAtomToAgenda(atom: AtomSearchResult): void {
    const existing = this.agenda().find((a) => a.atom_id === atom.id);
    if (existing) return;

    const entry: AgendaEntry = {
      atom_id: atom.id,
      atom_title: atom.title,
      atom_type: atom.type,
      order: this.agenda().length + 1,
      delivery_notes: '',
      duration_minutes: 15,
    };

    this.agenda.update((items) => [...items, entry]);
  }

  removeFromAgenda(atomId: string): void {
    this.agenda.update((items) =>
      items
        .filter((a) => a.atom_id !== atomId)
        .map((a, idx) => ({ ...a, order: idx + 1 })),
    );
  }

  onAgendaDrop(event: CdkDragDrop<AgendaEntry[]>): void {
    this.agenda.update((items) => {
      const updated = [...items];
      moveItemInArray(updated, event.previousIndex, event.currentIndex);
      return updated.map((a, idx) => ({ ...a, order: idx + 1 }));
    });
  }

  updateDeliveryNotes(atomId: string, notes: string): void {
    this.agenda.update((items) =>
      items.map((a) => (a.atom_id === atomId ? { ...a, delivery_notes: notes } : a)),
    );
  }

  updateDuration(atomId: string, minutes: number): void {
    this.agenda.update((items) =>
      items.map((a) =>
        a.atom_id === atomId ? { ...a, duration_minutes: minutes } : a,
      ),
    );
  }

  submitSession(): void {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);
    this.submitError.set('');

    const agendaItems = this.agenda().map((a) => ({
      atom_id: a.atom_id,
      order: a.order,
      delivery_notes: a.delivery_notes,
      duration_minutes: a.duration_minutes,
    }));

    this.subscriptions.add(
      this.trainingService
        .createSession({
          title: this.title().trim(),
          description: this.description().trim(),
          scheduled_at: this.scheduledAt(),
          duration_minutes: this.durationMinutes(),
          agenda: agendaItems,
          max_participants: this.maxParticipants(),
          venue_id: this.venueId() || undefined,
        })
        .subscribe({
          next: (session) => {
            this.isSubmitting.set(false);
            if (session) {
              void this.router.navigate(['/admin/training']);
            }
          },
          error: (err: Error) => {
            this.isSubmitting.set(false);
            this.submitError.set(err.message);
          },
        }),
    );
  }

  isAtomInAgenda(atomId: string): boolean {
    return this.agenda().some((a) => a.atom_id === atomId);
  }
}
