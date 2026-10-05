/**
 * FamiliarGrowthLogComponent: `/a/companion/:familiarId/growth-log`.
 *
 * Append-only EXP ledger per ADR-149 §"EXP economy". Renders the
 * `chora_consumption.familiar_growth_events` rows as a paginated
 * timeline. Per-row: source + EXP delta + stage transition (if any) +
 * daily-cap-hit indicator.
 *
 * Pagination via opaque nextPageToken (BE returns; FE just propagates).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import type { GrowthEventRecord } from '../../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-aplus-familiar-growth-log',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-growth-log.component.html',
  styleUrl: './familiar-growth-log.component.scss',
})
export class FamiliarGrowthLogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly growth = inject(FamiliarGrowthService);

  readonly familiarId = signal<string>(
    this.route.snapshot.paramMap.get('familiarId') ?? '',
  );

  /** Accumulated events (across pages). */
  private readonly accumulated = signal<readonly GrowthEventRecord[]>([]);

  /** Next page token; '' when no more pages. */
  readonly nextPageToken = signal<string>('');
  readonly loadingMore = signal<boolean>(false);

  private readonly firstPage = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.growth.getGrowthEvents(params.get('familiarId') ?? ''),
      ),
    ),
    { initialValue: { events: [], nextPageToken: '' } },
  );

  readonly events = computed<readonly GrowthEventRecord[]>(() => {
    const initial = this.firstPage();
    return [...initial.events, ...this.accumulated()];
  });

  readonly hasNextPage = computed<boolean>(() => {
    return !!(this.nextPageToken() || this.firstPage().nextPageToken);
  });

  loadMore(): void {
    if (this.loadingMore() || !this.hasNextPage()) return;
    this.loadingMore.set(true);
    const token = this.nextPageToken() || this.firstPage().nextPageToken;
    this.growth.getGrowthEvents(this.familiarId(), token).subscribe({
      next: (page) => {
        this.accumulated.update((cur) => [...cur, ...page.events]);
        this.nextPageToken.set(page.nextPageToken);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  sourceLabel(source: string): string {
    return `aplus.familiar_growth_log.source_${source.replace(/\./g, '_')}`;
  }
}
