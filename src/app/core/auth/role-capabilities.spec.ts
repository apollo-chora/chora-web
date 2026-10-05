/**
 * role-capabilities.spec.ts — CHO-1824 P5.1.
 *
 * The R+ assessment-authoring route is gated by `roleGuard('assessment:author')`.
 * That capability must be granted to the teaching/admin roles and withheld from
 * learners + read-only auditors. Tests the static role→capability map that seeds
 * RbacService (the FE gating source until the mint endpoint emits capabilities).
 */
import { ROLE_BADGES } from '../../features/surfaces/aplus/dashboard/dashboard.component';
import { ROLE_CAPABILITIES, capabilitiesForRoles } from './role-capabilities';

describe('capabilitiesForRoles — assessment:author (P5.1)', () => {
  it('grants assessment:author to the instructor role', () => {
    expect(capabilitiesForRoles(['instructor'])).toContain('assessment:author');
  });

  it('grants assessment:author to admin / owner / platform operator', () => {
    expect(capabilitiesForRoles(['admin'])).toContain('assessment:author');
    expect(capabilitiesForRoles(['ADMIN'])).toContain('assessment:author');
    expect(capabilitiesForRoles(['owner'])).toContain('assessment:author');
    expect(capabilitiesForRoles(['OWNER'])).toContain('assessment:author');
    expect(capabilitiesForRoles(['PLATFORM_OPERATOR'])).toContain('assessment:author');
  });

  it('withholds assessment:author from learners and auditors', () => {
    expect(capabilitiesForRoles(['learner'])).not.toContain('assessment:author');
    expect(capabilitiesForRoles(['auditor'])).not.toContain('assessment:author');
    expect(capabilitiesForRoles(['AUDITOR'])).not.toContain('assessment:author');
  });

  it('keeps existing capabilities intact (additive change)', () => {
    // Regression guard: adding assessment:author must not drop tenant caps.
    expect(capabilitiesForRoles(['admin'])).toContain('tenant:manage');
    expect(capabilitiesForRoles(['auditor'])).toContain('tenant:view_payments');
  });
});

describe('capabilitiesForRoles — PROCTOR (ADR-191, exam content-embargo)', () => {
  const PROCTOR_LOGISTICS = [
    'exam:sitting_check_in',
    'exam:sitting_open',
    'exam:sitting_close',
    'exam:roster_view',
    'exam:incident_file',
  ];

  it('grants the PROCTOR role its logistics capabilities only', () => {
    const caps = capabilitiesForRoles(['PROCTOR']);
    for (const c of PROCTOR_LOGISTICS) {
      expect(caps).toContain(c);
    }
  });

  it('withholds assessment:author from PROCTOR (embargo-aware)', () => {
    // A proctor administers a sitting but MUST NOT author or read content
    // (ADR-191 D1 — "sees the people, not the paper").
    expect(capabilitiesForRoles(['PROCTOR'])).not.toContain('assessment:author');
  });

  it('withholds tenant admin capabilities from PROCTOR', () => {
    const caps = capabilitiesForRoles(['PROCTOR']);
    expect(caps).not.toContain('tenant:manage');
    expect(caps).not.toContain('tenant:view_payments');
  });

  it('does not accidentally grant proctor caps to unrelated roles', () => {
    const caps = capabilitiesForRoles(['instructor']);
    expect(caps).not.toContain('exam:sitting_open');
  });
});

describe('capabilitiesForRoles - every badged role resolves', () => {
  // The A+ dashboard renders a badge for each of these roles, which asserts to
  // the user that they hold it. A badged role with zero capabilities is a lie:
  // the badge shows, then every guard locks them out. Derived from the
  // dashboard's own ROLE_BADGES, never hand-copied, because a hand-copied list
  // is the exact drift this test exists to catch.
  const badgedRoles = ROLE_BADGES.map((b) => b.key);

  // A loop over an empty list passes vacuously and would hide the very drift
  // under test, so pin the shape of what we derived.
  it('derives a non-trivial role list from the dashboard badges', () => {
    // CHO-2340: the A+ dashboard badges ONLY the tenant-membership roles that
    // H+ Members shows (learner / author / instructor / admin / auditor). The
    // JWT-only, non-membership labels (training_admin / tenant_admin /
    // platform_operator) are deliberately NOT badged, so they must not appear
    // in the derived list. The invariant below (every badged role resolves to
    // >= 1 capability) still holds for the membership set.
    expect(badgedRoles).toContain('author');
    expect(badgedRoles).toContain('admin');
    expect(badgedRoles).toContain('auditor');
    expect(badgedRoles).not.toContain('training_admin');
    expect(badgedRoles).not.toContain('tenant_admin');
    expect(badgedRoles).not.toContain('platform_operator');
    expect(badgedRoles.length).toBeGreaterThanOrEqual(5);
  });

  for (const role of ROLE_BADGES.map((b) => b.key).filter((k) => k !== 'learner')) {
    it(`grants at least one capability to the badged role "${role}"`, () => {
      expect(capabilitiesForRoles([role])).not.toEqual([]);
    });
  }

  it('grants nothing to learner (the floor role, badge is identity only)', () => {
    expect(capabilitiesForRoles(['learner'])).toEqual([]);
  });
});

describe('capabilitiesForRoles - course:author is admin-only', () => {
  // Owner ruling: A+ is where a learner browses courses; R+ is where an ADMIN
  // creates and maintains them. Course authoring is an admin capability.
  const COURSE_ADMIN_ROLES = [
    'TENANT_ADMIN',
    'ADMIN',
    'admin',
    'owner',
    'OWNER',
    'PLATFORM_OPERATOR',
    'training_admin',
    'tenant_admin',
    'platform_operator',
  ];

  for (const role of COURSE_ADMIN_ROLES) {
    it(`grants course:author to "${role}"`, () => {
      expect(capabilitiesForRoles([role])).toContain('course:author');
    });
  }

  it('withholds course:author from instructor (teaches a course, does not own it)', () => {
    expect(capabilitiesForRoles(['instructor'])).not.toContain('course:author');
  });

  it('withholds course:author from author (authors content, not courses)', () => {
    expect(capabilitiesForRoles(['author'])).not.toContain('course:author');
  });

  it('withholds course:author from learner and the read-only auditors', () => {
    expect(capabilitiesForRoles(['learner'])).not.toContain('course:author');
    expect(capabilitiesForRoles(['auditor'])).not.toContain('course:author');
    expect(capabilitiesForRoles(['AUDITOR'])).not.toContain('course:author');
  });
});

describe('capabilitiesForRoles - author authors content', () => {
  it('grants assessment:author to the author role', () => {
    expect(capabilitiesForRoles(['author'])).toContain('assessment:author');
  });

  it('withholds tenant capabilities from author', () => {
    const caps = capabilitiesForRoles(['author']);
    expect(caps).not.toContain('tenant:manage');
    expect(caps).not.toContain('tenant:view_payments');
  });
});

describe('capabilitiesForRoles - training_admin (R+ delivery admin)', () => {
  it('grants the R+ authoring capabilities', () => {
    const caps = capabilitiesForRoles(['training_admin']);
    expect(caps).toContain('assessment:author');
    expect(caps).toContain('course:author');
  });

  it('withholds tenant:view_payments (no R+ route gates on it; H+ billing is not theirs)', () => {
    // Verified 2026-07-16: the ONLY route gated on tenant:view_payments is
    // hplus.routes.ts `transactions` (H+ Transaction History). Every R+ route
    // gates on assessment:author. Granting it here would hand the delivery
    // admin the billing surface with no route asking for it.
    expect(capabilitiesForRoles(['training_admin'])).not.toContain('tenant:view_payments');
  });
});

describe('capabilitiesForRoles - delivery:ops (ADR-239 D3, R+ training-ops nav lane)', () => {
  // delivery:ops gates the 16 non-exam, non-authoring R+ nav items plus the
  // /r child routes, so an exam-ops-only session (pure PROCTOR, ADR-239 D2)
  // sees ONLY Exam Administration. Every persona that inhabits R+ today must
  // hold it, or this change would regress live navigation.
  const OPS_ROLES = [
    'instructor',
    'training_admin',
    'TENANT_ADMIN',
    'ADMIN',
    'admin',
    'tenant_admin',
    'owner',
    'OWNER',
    'PLATFORM_OPERATOR',
    'platform_operator',
  ];

  for (const role of OPS_ROLES) {
    it(`grants delivery:ops to "${role}"`, () => {
      expect(capabilitiesForRoles([role])).toContain('delivery:ops');
    });
  }

  it('withholds delivery:ops from PROCTOR (exam-ops only, no training-ops leak)', () => {
    // CHO-2200 PROCTOR row: no training-admin surface leaks TO the proctor.
    expect(capabilitiesForRoles(['PROCTOR'])).not.toContain('delivery:ops');
  });

  it('withholds delivery:ops from learner, author and the read-only auditors', () => {
    expect(capabilitiesForRoles(['learner'])).not.toContain('delivery:ops');
    expect(capabilitiesForRoles(['author'])).not.toContain('delivery:ops');
    expect(capabilitiesForRoles(['auditor'])).not.toContain('delivery:ops');
    expect(capabilitiesForRoles(['AUDITOR'])).not.toContain('delivery:ops');
  });

  it('keeps the PROCTOR capability set logistics-only (unchanged by the ops lane)', () => {
    expect(capabilitiesForRoles(['PROCTOR']).sort()).toEqual(
      [
        'exam:incident_file',
        'exam:roster_view',
        'exam:sitting_check_in',
        'exam:sitting_close',
        'exam:sitting_open',
      ].sort(),
    );
  });

  it('keeps instructor authoring intact next to delivery:ops (CHO-1824 P5.1)', () => {
    const caps = capabilitiesForRoles(['instructor']);
    expect(caps).toContain('assessment:author');
    expect(caps).toContain('delivery:ops');
  });
});

describe('capabilitiesForRoles - lowercase variants mirror their uppercase twins', () => {
  // chora-tenancy mints DB-enum roles lowercase while JWT-extension roles
  // arrive uppercase, so the map carries both forms. They must not drift.
  // The pairing is DERIVED: any lowercase key whose uppercase form is also a
  // key. Hand-writing both sides would let a pair be silently forgotten.
  const casePairs = Object.keys(ROLE_CAPABILITIES)
    .filter((k) => k === k.toLowerCase() && k.toUpperCase() in ROLE_CAPABILITIES)
    .map((lower) => [lower, lower.toUpperCase()] as const);

  it('derives the case pairs from the map itself', () => {
    const lowers = casePairs.map(([l]) => l);
    expect(lowers).toContain('tenant_admin');
    expect(lowers).toContain('platform_operator');
    expect(lowers).toContain('admin');
    expect(lowers).toContain('owner');
    expect(lowers).toContain('auditor');
  });

  for (const [lower, upper] of Object.keys(ROLE_CAPABILITIES)
    .filter((k) => k === k.toLowerCase() && k.toUpperCase() in ROLE_CAPABILITIES)
    .map((l) => [l, l.toUpperCase()] as const)) {
    it(`"${lower}" resolves identically to "${upper}"`, () => {
      expect(capabilitiesForRoles([lower])).toEqual(capabilitiesForRoles([upper]));
    });
  }
});
