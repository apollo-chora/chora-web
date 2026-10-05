import { describe, it, expect } from 'vitest';
import { RPLUS_NAV } from './rplus.nav';
import { capabilitiesForRoles } from '../../../core/auth/role-capabilities';

describe('RPLUS_NAV', () => {
  it('exposes 14 R+ surface entries (Rostering absorbed into the landing, R4)', () => {
    // R0 (CHO-2240) retired the Class Roster demo (19→18). R2a (CHO-2248)
    // removed the two authoring tools — Question Banks + AI Assessment
    // Authoring — from the sidebar (18→16). R2b (CHO-2250) demoted Course
    // Review to a per-course action on the course-detail page (16→15). R4
    // (CHO-2269) absorbed the Rostering dashboard into the Offerings finder
    // portfolio header (15→14); /r/rostering now redirects to /r/offerings.
    // Drill-downs (rosters/:courseId + catalog/:courseId + classroom/quiz-builder
    // + classroom/play/:sessionId + poll/:pollId + assessments/:id/monitor +
    // assessments/new + wbl/:id + applications-admin/:id + skillsfutures-claims/:id
    // + project-groups/:id + question-banks/:id) intentionally do NOT add sidebar entries.
    expect(RPLUS_NAV).toHaveLength(14);
  });

  it('no longer lists the Rostering dashboard item (R4, absorbed into the landing)', () => {
    expect(RPLUS_NAV.some((n) => n.route === '/r/rostering')).toBe(false);
  });

  it('no longer lists the retired Class Roster demo item (R0)', () => {
    expect(RPLUS_NAV.some((n) => n.route === '/r/roster')).toBe(false);
  });

  it('lists Offerings first (R0 landing; R1 Deliver band lead)', () => {
    // R1 (CHO-2243) reordered the flat list into band order. Offerings is the
    // R+ landing (R0) and leads the DELIVER band, so it is index 0 now (was
    // /r/rostering, the wave-3 portfolio entry, which moved to the band tail).
    expect(RPLUS_NAV[0].route).toBe('/r/offerings');
  });

  // ── R1 (CHO-2243): 6 lifecycle bands, single persona ─────────────────────
  // Every item carries a `group` band key; the sidebar renders an uppercase
  // header per band in canonical order and hides empty bands. This pins the
  // band membership so a future reorder regresses HERE, not in the live nav.
  describe('band grouping (R1 de-shadow)', () => {
    const bandOf = (route: string) => RPLUS_NAV.find((n) => n.route === route)?.group;

    it('every entry carries a band group', () => {
      for (const item of RPLUS_NAV) {
        expect(item.group, `${item.route} must carry a band group`).toBeTruthy();
      }
    });

    it('uses exactly the 6 canonical band keys', () => {
      const bands = new Set(RPLUS_NAV.map((n) => n.group));
      expect([...bands].sort()).toEqual(
        ['admin', 'assess', 'deliver', 'live', 'records', 'schedule'].sort(),
      );
    });

    it('assigns DELIVER: Offerings, Catalog (Rostering absorbed R4, Course Review demoted R2b)', () => {
      expect(bandOf('/r/offerings')).toBe('deliver');
      expect(bandOf('/r/catalog')).toBe('deliver');
      // R4: Rostering left the sidebar for the Offerings finder portfolio header.
      expect(bandOf('/r/rostering')).toBeUndefined();
      // R2b: Course Review left the sidebar for the per-course detail page.
      expect(bandOf('/r/courses/review')).toBeUndefined();
    });

    it('assigns SCHEDULE: Timetable only', () => {
      expect(bandOf('/r/scheduling')).toBe('schedule');
    });

    it('assigns LIVE: Live Classroom only', () => {
      expect(bandOf('/r/classroom')).toBe('live');
    });

    it('assigns ASSESS: Assessments, Exams (authoring tools demoted, R2a)', () => {
      expect(bandOf('/r/assessments')).toBe('assess');
      expect(bandOf('/r/exams')).toBe('assess');
      // R2a: Question Banks + AI Assessment Authoring left the sidebar for the
      // offering workspace Assessments tab; they no longer appear in any band.
      expect(bandOf('/r/assessment-authoring')).toBeUndefined();
      expect(bandOf('/r/question-banks')).toBeUndefined();
    });

    it('assigns RECORDS: Certifications only', () => {
      expect(bandOf('/r/certifications')).toBe('records');
    });

    it('assigns ADMIN: the training-admin tail + Bookings (parked until R2)', () => {
      // Bookings temporarily lands in ADMIN; R2 folds it into the workspace
      // Roster+Attendance. The 6 durable admin doors join it here.
      for (const route of [
        '/r/applications-admin',
        '/r/skillsfutures-claims',
        '/r/wbl',
        '/r/project-groups',
        '/r/campusops',
        '/r/surveys',
        '/r/bookings',
      ]) {
        expect(bandOf(route), `${route} must be in ADMIN`).toBe('admin');
      }
    });

    it('renders items in band order (deliver → schedule → live → assess → records → admin)', () => {
      // The array order IS the within-band render order; a stable band order
      // across the array keeps the sidebar deterministic without a sort.
      const order = ['deliver', 'schedule', 'live', 'assess', 'records', 'admin'];
      const seen = RPLUS_NAV.map((n) => n.group);
      const firstIndex = (band: string) => seen.indexOf(band);
      const lastIndex = (band: string) => seen.lastIndexOf(band);
      // No band's items are interleaved with another band's: each band
      // occupies a contiguous run, and the runs follow `order`.
      for (let i = 0; i < order.length - 1; i++) {
        expect(lastIndex(order[i])).toBeLessThan(firstIndex(order[i + 1]));
      }
    });
  });

  it.each([
    ['/r/catalog', 'rplus.nav.catalog'],
    ['/r/scheduling', 'rplus.nav.scheduling'],
    ['/r/bookings', 'rplus.nav.bookings'],
    ['/r/classroom', 'rplus.nav.classroom'],
    ['/r/assessments', 'rplus.nav.assessments'],
    ['/r/exams', 'rplus.nav.exams'],
    ['/r/certifications', 'rplus.nav.certifications'],
    ['/r/campusops', 'rplus.nav.campusops'],
    ['/r/wbl', 'rplus.nav.wbl'],
    ['/r/applications-admin', 'rplus.nav.applicationsAdmin'],
    ['/r/project-groups', 'rplus.nav.project_groups'],
    ['/r/skillsfutures-claims', 'rplus.nav.skillsfutures_claims'],
    ['/r/surveys', 'rplus.nav.surveys'],
  ])('has nav entry %s with labelKey %s', (route, labelKey) => {
    const item = RPLUS_NAV.find((n) => n.route === route);
    expect(item).toBeDefined();
    expect(item?.labelKey).toBe(labelKey);
  });

  it('no longer lists the authoring tools in the sidebar (R2a demote to workspace)', () => {
    // R2a (CHO-2248): Question Banks + AI Assessment Authoring are reached from
    // the offering workspace Assessments tab, not the sidebar. Their routes stay
    // (offering-workspace.component.html links to them) behind assessment:author.
    expect(RPLUS_NAV.some((n) => n.route === '/r/assessment-authoring')).toBe(false);
    expect(RPLUS_NAV.some((n) => n.route === '/r/question-banks')).toBe(false);
  });

  it('every entry has an icon defined (FontAwesome reference)', () => {
    for (const item of RPLUS_NAV) {
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it('all routes are scoped under /r/* (R+ surface prefix)', () => {
    for (const item of RPLUS_NAV) {
      expect(item.route.startsWith('/r/')).toBe(true);
    }
  });

  // ── ADR-239 D3: per-role R+ nav visibility (delivery:ops lane) ──────────
  // The sidebar hides an item when its `capability` is unmet (fail-closed,
  // SidebarComponent.isVisible). These specs pin the capability tags AND the
  // per-persona derivation so the CHO-2200 no-tab-leak matrix is deterministic.

  it('keeps /r/exams (Exam Administration) visible to the whole R+ surface population', () => {
    const exams = RPLUS_NAV.find((n) => n.route === '/r/exams');
    expect(exams).toBeDefined();
    expect(exams?.capability).toBeUndefined();
  });

  it('gates every non-exam entry on delivery:ops (13 items)', () => {
    // R2a demoted the 2 assessment:author items; R2b demoted Course Review;
    // R4 absorbed Rostering, so every remaining non-exam entry is delivery:ops
    // (13). Exam Administration stays ungated.
    const opsGated = RPLUS_NAV.filter((n) => n.capability === 'delivery:ops');
    expect(opsGated).toHaveLength(13);
    for (const item of RPLUS_NAV) {
      if (item.route === '/r/exams') continue;
      expect(item.capability, `${item.route} must carry delivery:ops`).toBe('delivery:ops');
    }
  });

  it('carries no assessment:author nav entry (R2a demoted both to the workspace)', () => {
    const authoring = RPLUS_NAV.filter((n) => n.capability === 'assessment:author');
    expect(authoring.map((n) => n.route)).toEqual([]);
  });

  describe('per-persona visibility derivation (SidebarComponent.isVisible predicate)', () => {
    const visibleRoutesFor = (roles: string[]): string[] => {
      const caps = capabilitiesForRoles(roles);
      return RPLUS_NAV.filter((n) => !n.capability || caps.includes(n.capability)).map(
        (n) => n.route,
      );
    };

    it('a pure PROCTOR session sees ONLY Exam Administration (no tab leak)', () => {
      // CHO-2200 PROCTOR row: no training-admin surface leaks TO the proctor.
      // The session itself is mintable only after the ADR-239 O1 claim lane
      // lands (W4); this pins the FE contract it will meet.
      expect(visibleRoutesFor(['PROCTOR'])).toEqual(['/r/exams']);
    });

    it('an instructor session sees every R+ item (unchanged behavior)', () => {
      expect(visibleRoutesFor(['instructor'])).toHaveLength(RPLUS_NAV.length);
    });

    it('the paired instructor+training_admin session sees every R+ item (ADR-239 D1)', () => {
      expect(visibleRoutesFor(['instructor', 'training_admin'])).toHaveLength(RPLUS_NAV.length);
    });

    it('a platform_operator session sees every R+ item (ADR-165 god-mode, unchanged)', () => {
      expect(visibleRoutesFor(['platform_operator'])).toHaveLength(RPLUS_NAV.length);
    });

    it('a PROCTOR who is also instructor sees the union (role-driven visibility, no toggles)', () => {
      expect(visibleRoutesFor(['PROCTOR', 'instructor'])).toHaveLength(RPLUS_NAV.length);
    });
  });

  it('does not add drill-down screens (course-detail + quiz-builder + course-roster + 4 wave-6 details) to the sidebar', () => {
    const routes = RPLUS_NAV.map((n) => n.route);
    expect(routes).not.toContain('/r/catalog/:courseId');
    expect(routes).not.toContain('/r/classroom/quiz-builder');
    expect(routes).not.toContain('/r/rosters/:courseId');
    expect(routes).not.toContain('/r/classroom/play/:sessionId');
    expect(routes).not.toContain('/r/poll/:pollId');
    expect(routes).not.toContain('/r/wbl/:id');
    expect(routes).not.toContain('/r/applications-admin/:id');
    expect(routes).not.toContain('/r/skillsfutures-claims/:id');
    expect(routes).not.toContain('/r/project-groups/:id');
  });
});
