import { Injectable, signal } from '@angular/core';

/**
 * App-shell layout coordination. Lets deep route components request the main
 * navigation sidebar collapse (e.g. wide authoring surfaces that need the full
 * page width) without reaching into MainLayoutComponent directly.
 *
 * `collapseRequest`:
 *   - `true`  → force the sidebar collapsed
 *   - `false` → force it expanded
 *   - `null`  → no request; the shell falls back to its responsive default
 *              (and the user's manual toggle applies)
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly collapseRequest = signal<boolean | null>(null);

  /** A route asks the nav to collapse/expand; pass null on leave to restore. */
  requestSidebarCollapsed(value: boolean | null): void {
    this.collapseRequest.set(value);
  }
}
