/**
 * FamiliarMapComponent — the Familiar-per-map surface (ADR-212 WS-3,
 * deliverable 4). Acquire a Familiar for a map theme, list the learner's
 * map↔Familiar bindings, and view the selected Familiar's memory +
 * explainability via the embedded memory panel.
 *
 * Acquire defaults to `mode: 'dev_hatched'` so the flow works without Stripe
 * in dev. Fail-loud: bindings/memory load failures render honest error
 * states; acquire failure toasts an error (no fabricated success).
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { FamiliarMapService } from '../familiar-map.service';
import { GoalService } from '../../dashboard/goal/goal.service';
import type { GoalDTO } from '../../dashboard/goal/goal.model';
import { FamiliarMapMemoryPanelComponent } from './familiar-map-memory-panel.component';
import type {
  FamiliarBinding,
  FamiliarBindingsState,
  FamiliarMemoryState,
} from '../familiar-map.model';

@Component({
  selector: 'chora-familiar-map',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    FamiliarMapMemoryPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-map.component.html',
  styleUrl: './familiar-map.component.scss',
})
export class FamiliarMapComponent implements OnInit {
  private readonly svc = inject(FamiliarMapService);
  private readonly goalSvc = inject(GoalService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** The learner's goals — a MAP is a Goal (ADR-214); each is an acquire target. */
  readonly goals = this.goalSvc.goals;

  private readonly _bindings = signal<FamiliarBindingsState>({
    status: 'loading',
  });
  readonly bindings = this._bindings.asReadonly();

  private readonly _memory = signal<FamiliarMemoryState>({ status: 'idle' });
  readonly memory = this._memory.asReadonly();

  readonly selectedFamiliarId = signal<string>('');
  readonly acquiring = signal<boolean>(false);

  readonly bindingsList = computed<readonly FamiliarBinding[]>(() => {
    const s = this._bindings();
    return s.status === 'success' ? s.bindings : [];
  });

  readonly acquireForm = this.fb.nonNullable.group({
    goalId: ['', [Validators.required]],
    familiarName: [''],
  });

  ngOnInit(): void {
    this.goalSvc.load();
    this.loadBindings();
  }

  /** Human label for a map (goal) option — its north-star note, else its kind. */
  goalLabel(goal: GoalDTO): string {
    const note = goal.northStarNote.trim();
    return note.length > 0 ? note : goal.kind;
  }

  loadBindings(): void {
    this._bindings.set({ status: 'loading' });
    this.svc.listBindings().subscribe({
      next: (res) => {
        this._bindings.set({ status: 'success', bindings: res.items });
        const first = res.items[0];
        if (first && !this.selectedFamiliarId()) {
          this.selectBinding(first.familiarId);
        }
      },
      error: () =>
        this._bindings.set({
          status: 'error',
          error: 'aplus.discovery.familiar.bindings_error',
        }),
    });
  }

  acquire(): void {
    if (this.acquireForm.invalid || this.acquiring()) {
      this.acquireForm.markAllAsTouched();
      return;
    }
    this.acquiring.set(true);
    const { goalId, familiarName } = this.acquireForm.getRawValue();
    const name = familiarName.trim();
    this.svc
      .acquire({
        goalId,
        ...(name ? { familiarName: name } : {}),
        mode: 'dev_hatched',
      })
      .subscribe({
        next: (acquired) => {
          this.toast.show('aplus.discovery.familiar.acquired', 'success');
          this.acquireForm.reset({ goalId: '', familiarName: '' });
          this.acquiring.set(false);
          this.selectedFamiliarId.set(acquired.familiarId);
          this.loadMemory(acquired.familiarId);
          this.loadBindings();
        },
        error: () => {
          this.toast.show('aplus.discovery.familiar.acquire_error', 'error');
          this.acquiring.set(false);
        },
      });
  }

  selectBinding(familiarId: string): void {
    this.selectedFamiliarId.set(familiarId);
    this.loadMemory(familiarId);
  }

  private loadMemory(familiarId: string): void {
    this._memory.set({ status: 'loading' });
    this.svc.getMemory(familiarId).subscribe({
      next: (memory) => this._memory.set({ status: 'success', memory }),
      error: () =>
        this._memory.set({
          status: 'error',
          error: 'aplus.discovery.familiar.memory_error',
        }),
    });
  }
}
