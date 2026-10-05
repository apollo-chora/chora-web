/**
 * H+ S6, the go-live check at `/h/go-live`.
 *
 * Replaces `GoLiveChecklistComponent`, which called five gateway paths that
 * were never claimed and so could only ever 404. Its `payment` test could
 * show a tick or a cross and nothing else, which is the defect this screen
 * exists to not repeat: billing is permanently uncheckable, so any verdict
 * about it would be invented.
 *
 * Same report as S1, different question. S1 asks what is set up; S6 asks what
 * stands between this instance and launch. Both render the server's verdicts
 * verbatim from the same `ReadinessService`, because two screens that
 * disagreed about one instance would leave an operator with no way to tell
 * which was lying.
 *
 * The framing is a TALLY, never a boolean this component decides:
 *
 *  - `passCount` and `checkableCount` count `ok` and `ok + attention`. Unknown
 *    rows are excluded from BOTH, so the denominator is the number of checks
 *    that could actually run. Folding unknown into passes would vouch for a
 *    row nobody looked at; folding it into failures would tell an operator to
 *    go fix something they cannot even inspect.
 *  - `allClear` requires nothing blocking AND nothing unchecked. When every
 *    checkable row passes but something could not be checked, the screen says
 *    exactly that instead, and names what it cannot vouch for.
 *
 * Every tally here is a count of statuses the server already decided. There is
 * no function in this file that derives a row's status.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ReadinessService } from './readiness.service';
import type { ReadinessRow } from './readiness.model';

@Component({
  selector: 'chora-h-go-live-check',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './go-live-check.component.html',
  styleUrl: './go-live-check.component.scss',
})
export class GoLiveCheckComponent implements OnInit {
  private readonly readiness = inject(ReadinessService);

  readonly state = this.readiness.state;

  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  private readonly rows = computed<readonly ReadinessRow[]>(() => {
    const s = this.state();
    return s.status === 'success' ? s.report.rows : [];
  });

  /** Rows standing between this instance and launch, in the server's order. */
  readonly blockers = computed<readonly ReadinessRow[]>(() =>
    this.rows().filter((r) => r.status === 'attention'),
  );

  /** Rows that pass, in the server's order. */
  readonly cleared = computed<readonly ReadinessRow[]>(() =>
    this.rows().filter((r) => r.status === 'ok'),
  );

  /**
   * Rows nobody could check. Listed separately and never scored, because
   * "we did not look" is a different fact from "this is fine" and from
   * "this is broken".
   */
  readonly uncheckable = computed<readonly ReadinessRow[]>(() =>
    this.rows().filter((r) => r.status === 'unknown'),
  );

  readonly passCount = computed<number>(() => this.cleared().length);

  /** The denominator: checks that could actually run. Excludes unknown. */
  readonly checkableCount = computed<number>(
    () => this.cleared().length + this.blockers().length,
  );

  readonly unknownCount = computed<number>(() => this.uncheckable().length);

  /**
   * True only when nothing blocks AND nothing went unchecked. An instance
   * with a permanently uncheckable row can never reach this state, which is
   * correct: the screen has no basis to say it is ready.
   */
  readonly allClear = computed<boolean>(
    () =>
      this.rows().length > 0 &&
      this.blockers().length === 0 &&
      this.uncheckable().length === 0,
  );

  /** Nothing blocking, but something could not be checked. */
  readonly clearExceptUnchecked = computed<boolean>(
    () =>
      this.rows().length > 0 &&
      this.blockers().length === 0 &&
      this.uncheckable().length > 0,
  );

  readonly nextAction = computed<string>(() => {
    const s = this.state();
    return s.status === 'success' ? (s.report.next_action ?? '') : '';
  });

  readonly partial = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'success' && s.report.partial;
  });

  readonly failedParts = computed<readonly string[]>(() => {
    const s = this.state();
    if (s.status !== 'success' || !s.report.part_errors) return [];
    return Object.keys(s.report.part_errors);
  });

  ngOnInit(): void {
    this.readiness.load();
  }

  /** See the S1 sibling: a count is a pointer, so zero must still render. */
  hasCount(row: ReadinessRow): boolean {
    return row.count !== undefined;
  }

  retry(): void {
    this.readiness.load();
  }
}
