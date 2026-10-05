/**
 * H+ S1, instance readiness at `/h/ready`.
 *
 * Answers one question for an operator standing in front of a fresh instance:
 * what is left to do. Eight rows, every row on every load, and the next action
 * named.
 *
 * The screen does NOT think. Every verdict on it was decided by the gateway
 * readiness aggregator and is printed verbatim. There is no function in this
 * component that turns a count into a status, and adding one is the change
 * that breaks it: S6 renders the same report with different framing, so a
 * client-side rule here could make the two screens disagree about one
 * instance, with nothing to say which was right.
 *
 * Three consequences worth stating, because each is a place the obvious
 * implementation is wrong:
 *
 *  1. `unknown` is not a second red. It is a check that could not run, it
 *     carries its reason, and it is styled as an answer rather than a fault.
 *     The billing row is permanently unknown by design.
 *  2. The needs-work tally counts `attention` rows only. Counting unknowns
 *     would tell an operator to go fix something no one can look at.
 *  3. A count is a pointer on the wire. Absent means the row counts nothing,
 *     zero means it counted and found none, and the template must not render
 *     one as the other, so it tests for `undefined` rather than falsiness.
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
  selector: 'chora-h-instance-readiness',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instance-readiness.component.html',
  styleUrl: './instance-readiness.component.scss',
})
export class InstanceReadinessComponent implements OnInit {
  private readonly readiness = inject(ReadinessService);

  readonly state = this.readiness.state;

  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Rows in the server's order. Never sorted, never filtered. */
  readonly rows = computed<readonly ReadinessRow[]>(() => {
    const s = this.state();
    return s.status === 'success' ? s.report.rows : [];
  });

  /** The server's next action, or empty when it named none. */
  readonly nextAction = computed<string>(() => {
    const s = this.state();
    return s.status === 'success' ? (s.report.next_action ?? '') : '';
  });

  /**
   * How many rows need work. A tally of what the server already decided, not
   * a re-derivation of any verdict: `unknown` rows are excluded because an
   * operator cannot act on an answer nobody has.
   */
  readonly needsWorkCount = computed<number>(
    () => this.rows().filter((r) => r.status === 'attention').length,
  );

  readonly partial = computed<boolean>(() => {
    const s = this.state();
    return s.status === 'success' && s.report.partial;
  });

  /** Names of the parts that failed, for the degraded banner. */
  readonly failedParts = computed<readonly string[]>(() => {
    const s = this.state();
    if (s.status !== 'success' || !s.report.part_errors) return [];
    return Object.keys(s.report.part_errors);
  });

  private readonly knownGaps = computed<Readonly<Record<string, string>>>(() => {
    const s = this.state();
    return s.status === 'success' ? (s.report.known_gaps ?? {}) : {};
  });

  ngOnInit(): void {
    this.readiness.load();
  }

  /** The declared limit of this row's answer, or empty when none. */
  knownGapFor(key: string): string {
    return this.knownGaps()[key] ?? '';
  }

  /**
   * True only when the row carried a count. `count === 0` is a real answer
   * and must render; a falsy check here would hide it.
   */
  hasCount(row: ReadinessRow): boolean {
    return row.count !== undefined;
  }

  retry(): void {
    this.readiness.load();
  }
}
