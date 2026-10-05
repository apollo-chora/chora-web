import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type CplusCardElevation = 'flat' | 'raised';

/**
 * The card's ARIA role, chosen by the CONTAINER that holds it.
 *
 * `undefined` (default) leaves the native `<article>` role intact, which is what
 * `role="feed"` requires of its children. A card placed inside `role="list"`
 * must say `listitem`, because a list accepts no other child role.
 */
export type CplusCardRole = 'listitem' | 'article';

/**
 * CplusCard — the flat, unified card primitive for the C+ surface (ADR-196).
 *
 * Solid surface, 1px hairline border, soft neutral shadow, `--chora-radius-lg`
 * corners. Rendered as a semantic `<article>`. No hover-lift, no colored
 * side-stripe, no glow, no blur — the anti-slop contract.
 *
 * A11y: the card previously hard-coded `role="group"`, which OVERRODE the
 * `<article>` element's own implicit `article` role and made every card an
 * illegal child of the containers that hold it — `aria-required-children`
 * (critical) fired on C+ feed / connections / leaderboards alike. The role now
 * defaults to the native article and is overridable per container.
 *
 * Build on `--cplus-*` aliases (→ `--chora-*`), never polyglass.
 */
@Component({
  selector: 'chora-cplus-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cplus-card.component.html',
  styleUrl: './cplus-card.component.scss',
})
export class CplusCardComponent {
  /** Optional accessible title; when set, becomes the article's aria-label. */
  readonly title = input<string | undefined>(undefined);
  /** Visual elevation. `raised` adds the soft neutral shadow. */
  readonly elevation = input<CplusCardElevation>('raised');
  /**
   * ARIA role for the card, set by whatever container holds it. Defaults to the
   * native `<article>` role (correct inside `role="feed"`); pass `listitem`
   * inside a `role="list"`.
   */
  readonly cardRole = input<CplusCardRole | undefined>(undefined);
}
