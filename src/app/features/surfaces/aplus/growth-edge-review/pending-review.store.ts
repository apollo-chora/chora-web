import { Injectable } from '@angular/core';

/**
 * localStorage key for the single Growth-Edge diagnosis parked at the HITL
 * review interrupt and awaiting the learner (CHO-2337). One key, not a list:
 * the backend exposes no "list pending reviews" endpoint, so the FE remembers
 * only the most recent park and self-heals it against `GET /uploads/{id}`.
 */
export const PENDING_REVIEW_STORAGE_KEY = 'chora.aplus.pendingWeaknessReview';

/**
 * PendingReviewStore — a tiny localStorage wrapper that remembers the one
 * diagnosis upload parked at `AWAITING_REVIEW` (ADR-205). The only in-app link
 * to the review page is an ephemeral CTA in the map drawer; closing the drawer
 * destroys it and re-opening does not restore it, stranding the learner. This
 * store survives navigation so `/a/knowledge` can re-offer the review through a
 * persistent banner, and the review page clears it once the review resolves.
 *
 * Storage access is guarded end to end: SSR has no `localStorage`, and a
 * private-browsing mode can throw on read or write. Every method fails soft
 * (never throws) — a diagnosis flow is never broken by an unavailable store; at
 * worst the banner is simply absent.
 */
@Injectable({ providedIn: 'root' })
export class PendingReviewStore {
  /** Remember the upload parked at the review interrupt. */
  set(uploadId: string): void {
    try {
      localStorage.setItem(PENDING_REVIEW_STORAGE_KEY, uploadId);
    } catch {
      // SSR (no localStorage) or storage disabled/full — the banner is a
      // nicety, never load-bearing, so a failure here is intentionally silent.
    }
  }

  /** The parked upload id, or `null` when none is stored / storage is absent. */
  get(): string | null {
    try {
      return localStorage.getItem(PENDING_REVIEW_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Forget the parked review (resumed, resolved, or self-healed as stale). */
  clear(): void {
    try {
      localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    } catch {
      // Nothing to forget if storage is unreachable — fail soft.
    }
  }
}
