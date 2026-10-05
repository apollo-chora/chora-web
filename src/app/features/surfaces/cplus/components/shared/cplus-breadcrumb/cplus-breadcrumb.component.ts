import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface CplusBreadcrumbItem {
  /** Visible label. */
  label: string;
  /** Link path; `null` marks the current (last) page — rendered as plain text. */
  path: string | null;
}

/**
 * CplusBreadcrumb — flat `<nav aria-label="Breadcrumb">` (ADR-196).
 *
 * Cuts the "where am I" ambiguity of the old per-page nested sidebar. The
 * final crumb carries `aria-current="page"`; intermediate crumbs are links.
 * Separators are CSS-generated (aria-hidden) so they are not announced.
 */
@Component({
  selector: 'chora-cplus-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cplus-breadcrumb.component.html',
  styleUrl: './cplus-breadcrumb.component.scss',
})
export class CplusBreadcrumbComponent {
  readonly items = input.required<CplusBreadcrumbItem[]>();

  /** The index of the current page crumb (last item with null path, else last). */
  readonly currentIndex = computed<number>(() => {
    const list = this.items();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].path === null) return i;
    }
    return list.length - 1;
  });
}
