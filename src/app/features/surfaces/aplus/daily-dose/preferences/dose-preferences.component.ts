/**
 * DosePreferencesComponent (CHO-2045 / ADR-224) — the A+ "which maps feed my
 * daily dose" roster. Composes the maps Atlas (MapsService) with the sparse
 * excluded set (DosePreferencesService) into a full include/exclude switch per
 * map, with keyword search, All/In/Out filter tabs and pagination so it scales
 * to a learner with many maps. Toggling a switch PUTs the preference (optimistic).
 *
 * Default: every map is included — only exclusions are stored, so a fresh learner
 * sees every map "in dose".
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';

import { MapsService } from '../../my-knowledge/maps.service';
import { DosePreferencesService } from './dose-preferences.service';
import type { DoseFilter, DosePrefRow } from './dose-preferences.model';

const PAGE_SIZE = 12;

@Component({
  selector: 'chora-aplus-dose-preferences',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dose-preferences.component.html',
  styleUrl: './dose-preferences.component.scss',
})
export class DosePreferencesComponent {
  private readonly maps = inject(MapsService);
  private readonly prefs = inject(DosePreferencesService);

  readonly mapsState = this.maps.state;
  readonly prefsStatus = this.prefs.status;

  readonly query = signal('');
  readonly filter = signal<DoseFilter>('all');
  readonly page = signal(0);
  readonly pageSize = PAGE_SIZE;

  /** The map whose toggle is mid-flight (disables the row + shows a spinner). */
  readonly savingId = signal<string | null>(null);
  /** i18n key for an inline save error, or null. */
  readonly saveError = signal<string | null>(null);

  /** Every map + its current dose-included state (default true — excluded set is sparse). */
  readonly roster = computed<readonly DosePrefRow[]>(() => {
    const excluded = this.prefs.excluded();
    return this.maps.maps().map((m) => ({
      goalId: m.goalId,
      title: m.title?.trim() ?? '',
      included: !excluded.has(m.goalId),
    }));
  });

  readonly excludedCount = computed(
    () => this.roster().filter((r) => !r.included).length,
  );

  /** Search (title) + filter (all/in/out) applied to the full roster. */
  readonly filtered = computed<readonly DosePrefRow[]>(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filter();
    return this.roster().filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) {
        return false;
      }
      if (f === 'in' && !r.included) {
        return false;
      }
      if (f === 'out' && r.included) {
        return false;
      }
      return true;
    });
  });

  readonly total = computed(() => this.filtered().length);
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  readonly pageStart = computed(() => this.page() * this.pageSize);
  readonly paged = computed<readonly DosePrefRow[]>(() =>
    this.filtered().slice(this.pageStart(), this.pageStart() + this.pageSize),
  );

  constructor() {
    this.maps.load();
    this.prefs.load();
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.page.set(0);
  }

  setFilter(f: DoseFilter): void {
    this.filter.set(f);
    this.page.set(0);
  }

  prevPage(): void {
    this.page.update((p) => Math.max(0, p - 1));
  }

  nextPage(): void {
    this.page.update((p) => Math.min(this.pageCount() - 1, p + 1));
  }

  toggle(row: DosePrefRow): void {
    if (this.savingId()) {
      return; // one in-flight save at a time
    }
    this.savingId.set(row.goalId);
    this.saveError.set(null);
    this.prefs.setIncluded(row.goalId, !row.included).subscribe({
      next: () => this.savingId.set(null),
      error: () => {
        this.savingId.set(null);
        this.saveError.set('aplus.dosePrefs.saveError');
      },
    });
  }

  retry(): void {
    this.maps.load();
    this.prefs.load();
  }
}
