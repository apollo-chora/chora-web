/**
 * Certifications model — R+ /r/certifications surface (R+ buildout M12).
 *
 * Maps the chora-delivery GET /api/v1/certifications wire shape into the
 * typed FE model the R+ Certifications screen renders. Backend response
 * shape (per services/chora-delivery/internal/adapter/http/
 * certifications_list_handler.go + handlers.go::certDTO):
 *
 *  {
 *    items: [
 *      {
 *        id: string,
 *        tenant_id: string,
 *        learner_gcid: string,
 *        course_id: string,
 *        accomplishments: string[],
 *        hash: string,
 *        issued_at: ISO8601 string,
 *      }, ...
 *    ]
 *  }
 *
 * The Certification aggregate is APPEND-ONLY (per
 * .claude/rules/ddd-enforcement.md §4 — AtomRevision pattern applied to
 * credentials). The "revoke" CTA the screen exposes is a soft state-flag
 * issued via a separate event; the FE represents revocation as a derived
 * `status` field on the model so the component layer can render an
 * `Active` / `Revoked` badge without inventing a backend field that does
 * not yet exist. When the backend ships a revoked_at column the mapper
 * picks it up — until then every freshly listed cert is `Active`.
 */

export type CertificationStatus = 'Active' | 'Revoked';

export interface Certification {
  /** Certificate UUIDv7 — opaque stable id. */
  readonly id: string;
  /** Owning tenant id (always = current tenant — RLS-enforced). */
  readonly tenantId: string;
  /** Learner GCID the credential is issued to. */
  readonly learnerGcid: string;
  /** Source course id that triggered the issue. */
  readonly courseId: string;
  /** Free-form accomplishment list (e.g., `["atom-1:passed", "exam:passed"]`). */
  readonly accomplishments: readonly string[];
  /** SHA-256 hex hash over (gcid|course_id|accomplishments) — integrity check. */
  readonly hash: string;
  /** RFC-3339 issue timestamp. */
  readonly issuedAt: string;
  /** Derived display status — defaults to Active when no revoked_at exists. */
  readonly status: CertificationStatus;
}

export interface CertificationList {
  /** Tenant display name (header pill — pulled from TenantContextService). */
  readonly tenantName: string;
  /** Total count for the badge. */
  readonly totalCertifications: number;
  /** Certification rows for the table. */
  readonly items: readonly Certification[];
}

/**
 * Returns the badge variant class for the given status. Glassmorphism
 * design system: badge-success (Active) / badge-neutral (Revoked).
 */
export function statusBadgeVariant(
  status: CertificationStatus,
): 'badge-success' | 'badge-neutral' {
  switch (status) {
    case 'Active':
      return 'badge-success';
    case 'Revoked':
      return 'badge-neutral';
  }
}
