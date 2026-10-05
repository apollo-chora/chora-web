import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CplusBreadcrumbComponent, CplusBreadcrumbItem } from '../cplus-breadcrumb/cplus-breadcrumb.component';

/**
 * CplusPageHeader — the unified page header (ADR-196).
 *
 * `<header role="banner">` carrying a flat (non-gradient) `<h1>` title, an
 * optional description, an optional breadcrumb, and an actions slot for
 * page-level controls. Every C+ page composes this so the title/breadcrumb/
 * spacing are identical across the surface.
 */
@Component({
  selector: 'chora-cplus-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CplusBreadcrumbComponent],
  templateUrl: './cplus-page-header.component.html',
  styleUrl: './cplus-page-header.component.scss',
})
export class CplusPageHeaderComponent {
  /** Page title (rendered as a flat <h1>, never gradient-clipped). */
  readonly title = input.required<string>();
  /** Optional supporting description. */
  readonly description = input<string | undefined>(undefined);
  /** Optional breadcrumb trail; omitted when not provided. */
  readonly breadcrumb = input<CplusBreadcrumbItem[] | undefined>(undefined);
}
