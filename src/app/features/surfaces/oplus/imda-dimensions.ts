/**
 * IMDA 4-dimension catalogue + governance type schema for the O+ surface.
 *
 * Canonical labels per ADR-141 (IMDA MGF v2 + AI Verify aligned):
 *   D1 → accountability
 *   D2 → transparency
 *   D3 → safety_and_robustness
 *   D4 → fairness_and_human_oversight
 *
 * The deprecated v1 labels (`internal_governance`, `risk_levels`,
 * `operations_management`, `stakeholder_interaction`) MUST NOT appear here.
 *
 * **Phase-D refactor (2026-05-26 — atomic-napping-spring plan):**
 * Mock posture, rubric, agents, governance, and A2A data have been moved
 * to the `GovernanceService` BFF flow (`/bff/oplus/{dashboard,dimensions,
 * agents,governance,a2a}`). This file now holds ONLY:
 *
 *   1. The static `IMDA_DIMENSIONS` catalogue — display titles, icons,
 *      accent classes, translation keys, AI Verify principle mapping.
 *      This catalogue is design-time + ADR-141 invariant; it never
 *      shifts at runtime.
 *
 *   2. Type aliases used across the O+ components + GovernanceService
 *      so component templates can narrow without re-deriving them.
 *
 *   3. The static `RACI_MATRIX` — intentionally hand-curated per the
 *      IMDA skill three-audience model.
 *
 * The former `SAFETY_RISK_CATEGORIES` 6-tile list was REMOVED on 2026-06-22
 * (synthetic-tinkering-fox plan): the decorative tiles carried no runtime
 * signal (no counts/evidence/legend; the BFF shipped no `safety_risks`
 * field). D3 Safety is covered by its own dimension panel's rubric rows.
 *
 * Plan anchor: D7 ("strip the hardcoded RUBRIC_ITEMS array (now sourced
 * from backend); leave only the schema/label translation keys").
 */

/** Canonical ADR-141 dimension label values. */
export type ImdaDimensionLabel =
  | 'accountability'
  | 'transparency'
  | 'safety_and_robustness'
  | 'fairness_and_human_oversight';

/** AI Verify principle reference (per IMDA MGF mapping). */
export interface AiVerifyPrinciple {
  readonly num: number;
  readonly name: string;
}

/** IMDA dimension descriptor — display + accent + AI Verify principles. */
export interface ImdaDimension {
  /** 1..4 — dimension number per ADR-141. */
  readonly num: 1 | 2 | 3 | 4;
  /** Canonical ADR-141 label (snake_case). */
  readonly label: ImdaDimensionLabel;
  /** Display title (title-case). */
  readonly title: string;
  /** FontAwesome 6 icon class without the `fa-solid` prefix. */
  readonly icon: string;
  /** Utility-class modifier — `dim-d1` / `dim-d2` / `dim-d3` / `dim-d4`. */
  readonly accentClass: 'dim-d1' | 'dim-d2' | 'dim-d3' | 'dim-d4';
  /** Translation key for the dimension description. */
  readonly descriptionKey: string;
  /** AI Verify principles this dimension covers. */
  readonly principles: readonly AiVerifyPrinciple[];
}

export const IMDA_DIMENSIONS: readonly ImdaDimension[] = [
  {
    num: 1,
    label: 'accountability',
    title: 'Accountability',
    icon: 'fa-clipboard-list',
    accentClass: 'dim-d1',
    descriptionKey: 'oplus.dashboard.d1_description',
    principles: [
      { num: 8, name: 'Data Governance' },
      { num: 9, name: 'Accountability' },
    ],
  },
  {
    num: 2,
    label: 'transparency',
    title: 'Transparency',
    icon: 'fa-eye',
    accentClass: 'dim-d2',
    descriptionKey: 'oplus.dashboard.d2_description',
    principles: [
      { num: 1, name: 'Transparency' },
      { num: 2, name: 'Explainability' },
    ],
  },
  {
    num: 3,
    label: 'safety_and_robustness',
    title: 'Safety and Robustness',
    icon: 'fa-shield-halved',
    accentClass: 'dim-d3',
    descriptionKey: 'oplus.dashboard.d3_description',
    principles: [
      { num: 3, name: 'Repeatability / Reproducibility' },
      { num: 4, name: 'Safety' },
      { num: 5, name: 'Security' },
      { num: 6, name: 'Robustness' },
    ],
  },
  {
    num: 4,
    label: 'fairness_and_human_oversight',
    title: 'Fairness and Human Oversight',
    icon: 'fa-users-gear',
    accentClass: 'dim-d4',
    descriptionKey: 'oplus.dashboard.d4_description',
    principles: [
      { num: 7, name: 'Fairness' },
      { num: 10, name: 'Human Agency and Oversight' },
      { num: 11, name: 'Inclusive Growth, Societal and Environmental Well-being' },
    ],
  },
] as const;

// ─── Shared status types ──────────────────────────────────────────────
// These mirror the canonical types in GovernanceService so component
// templates can narrow without an extra import. The single source of
// truth is GovernanceService — these aliases are convenience-only.

/** Traffic-light status per dimension. */
export type DimensionStatus = 'achieved' | 'partial' | 'attention' | 'pending';

/** Rubric item pass/partial/fail. */
export type RubricStatus = 'pass' | 'partial' | 'fail';

/** HITL approval status per ADR-141 D1 accountability. */
export type HitlStatus = 'pending' | 'approved' | 'rejected' | 'auto';

/** HITL autonomy level per `imda-governance-4-dimensions` skill. */
export type AutonomyLevel = 'HOOTL' | 'HOTL' | 'HITL-L0' | 'HITL-L1' | 'HITL-L2';

/** Governance view tab keys — Decision Traces / Human Oversight / Data Governance. */
export type GovernanceTab = 'decisions' | 'oversight' | 'data';

// ─── Static RACI matrix ───────────────────────────────────────────────
// Intentionally hand-curated per IMDA skill three-audience model + plan
// anchor §D5 ("RACI from a small static config + lineage rows from BFF").

export interface RaciEntry {
  readonly role: 'Responsible' | 'Accountable' | 'Consulted' | 'Informed';
  readonly title: string;
  readonly accent: 'd1' | 'd2' | 'd3' | 'd4';
  readonly items: readonly string[];
}

export const RACI_MATRIX: readonly RaciEntry[] = [
  {
    role: 'Responsible',
    title: 'Key Decision Makers',
    accent: 'd1',
    items: [
      'Assessors (Question + Report Review gates)',
      'Product Owner (risk acceptance)',
      'AI Governance Lead (policy)',
    ],
  },
  {
    role: 'Accountable',
    title: 'Product Teams',
    accent: 'd3',
    items: [
      'Agent crew developers (per-crew ownership)',
      'Backend services (12 services)',
      'ML/AI engineering (prompts, models)',
    ],
  },
  {
    role: 'Consulted',
    title: 'Cybersecurity Teams',
    accent: 'd2',
    items: [
      'Adversarial testing (DeepTeam)',
      'OWASP compliance (Promptfoo)',
      'Runtime safety (Cloud Model Armor)',
    ],
  },
  {
    role: 'Informed',
    title: 'Users',
    accent: 'd4',
    items: [
      'Learners (assessment takers)',
      'Tenant administrators',
      'External auditors',
    ],
  },
] as const;
