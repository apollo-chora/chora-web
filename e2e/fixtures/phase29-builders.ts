import { randomUUID } from 'crypto';

// ===========================================================================
// Builders — Phase 29 modules (CampusOps, Support, ExamAdmin, WBL, Parent)
// ===========================================================================

// ---------------------------------------------------------------------------
// CampusOps — Venue
// ---------------------------------------------------------------------------

export function buildVenue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    name: 'Main Campus Hall',
    address: '123 Learning Ave, Education City',
    capacity: 200,
    status: 'active',
    facilities: ['projector', 'whiteboard', 'wifi'],
    contact_email: 'venue@test.chora.io',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CampusOps — Room
// ---------------------------------------------------------------------------

export function buildRoom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    venue_id: randomUUID(),
    name: 'Room A-101',
    floor: '1',
    capacity: 40,
    room_type: 'classroom',
    equipment: ['projector', 'whiteboard'],
    is_available: true,
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CampusOps — Booking
// ---------------------------------------------------------------------------

export function buildBooking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    room_id: randomUUID(),
    booked_by: 'gcid-instructor-001',
    purpose: 'Algebra Tutorial Session',
    date: '2026-03-20',
    time_start: '09:00',
    time_end: '11:00',
    status: 'confirmed',
    attendees_expected: 30,
    created_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CampusOps — Timetable Slot
// ---------------------------------------------------------------------------

export function buildTimetableSlot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    room_id: randomUUID(),
    room_name: 'Room A-101',
    day_of_week: 'monday',
    time_start: '09:00',
    time_end: '10:30',
    subject: 'Algebra Foundations',
    instructor_gcid: 'gcid-instructor-001',
    instructor_name: 'Test Instructor',
    recurrence: 'weekly',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CampusOps — Attendance Session
// ---------------------------------------------------------------------------

export function buildAttendanceSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    room_id: randomUUID(),
    session_date: '2026-03-16',
    time_start: '09:00',
    time_end: '10:30',
    instructor_gcid: 'gcid-instructor-001',
    total_enrolled: 30,
    total_present: 27,
    total_absent: 3,
    qr_code_url: 'https://qr.chora.io/attendance/session-001',
    status: 'completed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Support — Ticket
// ---------------------------------------------------------------------------

export function buildTicket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    reporter_gcid: 'gcid-learner-001',
    reporter_name: 'Test Learner',
    subject: 'Cannot access assessment',
    description: 'I get a 403 error when trying to start the algebra assessment.',
    category: 'technical',
    priority: 'medium',
    status: 'open',
    assigned_to: null,
    created_at: '2026-03-15T14:30:00Z',
    updated_at: '2026-03-15T14:30:00Z',
    resolved_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Support — Ticket Reply
// ---------------------------------------------------------------------------

export function buildTicketReply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    ticket_id: randomUUID(),
    author_gcid: 'gcid-admin-001',
    author_name: 'Test Admin',
    content: 'We are investigating this issue. Please try clearing your browser cache.',
    is_internal: false,
    created_at: '2026-03-15T15:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Support — FAQ Article
// ---------------------------------------------------------------------------

export function buildFaqArticle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    title: 'How to reset my password',
    body: 'Go to Settings > Security > Change Password and follow the instructions.',
    category: 'account',
    tags: ['password', 'security', 'account'],
    helpful_count: 42,
    view_count: 150,
    is_published: true,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Support — Satisfaction Survey
// ---------------------------------------------------------------------------

export function buildSatisfactionResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    ticket_id: randomUUID(),
    rating: 4,
    comment: 'Quick and helpful resolution.',
    submitted_by: 'gcid-learner-001',
    submitted_at: '2026-03-16T09:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExamAdmin — Contract
// ---------------------------------------------------------------------------

export function buildExamContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    awarding_body: 'National Exam Board',
    qualification_title: 'Level 3 Certificate in Mathematics',
    contract_reference: `NEB-${Date.now()}`,
    status: 'active',
    valid_from: '2026-01-01T00:00:00Z',
    valid_until: '2026-12-31T23:59:59Z',
    max_candidates: 500,
    registered_candidates: 120,
    created_at: '2025-12-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExamAdmin — Exam Venue
// ---------------------------------------------------------------------------

export function buildExamVenue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    venue_name: 'Exam Hall A',
    address: '456 Testing Blvd, Assessment City',
    capacity: 100,
    is_approved: true,
    facilities: ['cctv', 'invigilator_station', 'secure_storage'],
    last_inspection_date: '2026-02-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExamAdmin — Sitting
// ---------------------------------------------------------------------------

export function buildExamSitting(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    contract_id: randomUUID(),
    venue_id: randomUUID(),
    venue_name: 'Exam Hall A',
    scheduled_date: '2026-04-15',
    time_start: '09:00',
    time_end: '12:00',
    capacity: 50,
    registered: 35,
    status: 'scheduled',
    proctor_gcid: 'gcid-instructor-001',
    proctor_name: 'Test Instructor',
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExamAdmin — Result
// ---------------------------------------------------------------------------

export function buildExamResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    sitting_id: randomUUID(),
    candidate_gcid: 'gcid-learner-001',
    candidate_name: 'Test Learner',
    score_pct: 78,
    grade: 'B',
    outcome: 'pass',
    marked_at: '2026-04-20T14:00:00Z',
    released_at: '2026-04-25T09:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WBL — Placement
// ---------------------------------------------------------------------------

export function buildPlacement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    learner_gcid: 'gcid-learner-001',
    learner_name: 'Test Learner',
    organisation: 'TechCorp Solutions',
    role_title: 'Junior Developer Intern',
    supervisor_name: 'Jane Doe',
    supervisor_email: 'jane.doe@techcorp.example.com',
    start_date: '2026-03-01',
    end_date: '2026-06-30',
    required_hours: 400,
    logged_hours: 120,
    status: 'active',
    created_at: '2026-02-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WBL — Work Log Entry
// ---------------------------------------------------------------------------

export function buildWorkLogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    placement_id: randomUUID(),
    date: '2026-03-16',
    hours: 7.5,
    description: 'Worked on front-end feature development and attended team standup.',
    competencies_demonstrated: ['communication', 'problem_solving', 'teamwork'],
    supervisor_approved: false,
    created_at: '2026-03-16T17:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WBL — Capstone
// ---------------------------------------------------------------------------

export function buildCapstone(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    placement_id: randomUUID(),
    title: 'E-Commerce Dashboard Redesign',
    description: 'Redesign the analytics dashboard for improved UX and performance.',
    status: 'in_progress',
    progress_pct: 45,
    milestones: [
      { id: randomUUID(), title: 'Requirements gathering', status: 'completed', due_date: '2026-03-15' },
      { id: randomUUID(), title: 'Wireframe design', status: 'completed', due_date: '2026-03-30' },
      { id: randomUUID(), title: 'Implementation', status: 'in_progress', due_date: '2026-05-15' },
      { id: randomUUID(), title: 'Testing & review', status: 'not_started', due_date: '2026-06-15' },
    ],
    submission_deadline: '2026-06-20T23:59:59Z',
    submitted_at: null,
    grade: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WBL — Supervisor Feedback
// ---------------------------------------------------------------------------

export function buildSupervisorFeedback(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    placement_id: randomUUID(),
    supervisor_name: 'Jane Doe',
    rating: 4,
    strengths: 'Strong problem-solving skills and good communication.',
    areas_for_improvement: 'Could improve time estimation for tasks.',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    submitted_at: '2026-04-02T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Parent — Guardian Link
// ---------------------------------------------------------------------------

export function buildGuardianLink(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    guardian_gcid: 'gcid-guardian-001',
    learner_gcid: 'gcid-learner-001',
    learner_name: 'Test Learner',
    learner_avatar_url: null,
    relationship: 'parent',
    link_status: 'active',
    permissions: ['view_progress', 'view_activity', 'manage_consent'],
    linked_at: '2026-01-20T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Parent — Activity Digest
// ---------------------------------------------------------------------------

export function buildActivityDigest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    learner_gcid: 'gcid-learner-001',
    learner_name: 'Test Learner',
    date: '2026-03-16',
    atoms_completed: 5,
    time_spent_minutes: 45,
    streak_days: 7,
    xp_earned: 120,
    topics_active: ['Algebra', 'Geometry'],
    highlights: [
      'Completed DailyDose with 100% accuracy',
      'Maintained 7-day streak',
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Parent — Progress Report
// ---------------------------------------------------------------------------

export function buildProgressReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    learner_gcid: 'gcid-learner-001',
    learner_name: 'Test Learner',
    period: 'monthly',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    atoms_completed: 45,
    atoms_attempted: 52,
    average_score_pct: 82,
    streak_current: 7,
    streak_longest: 14,
    total_xp: 2450,
    xp_gained: 580,
    level: 8,
    paths_in_progress: 2,
    paths_completed: 1,
    top_topics: ['Algebra', 'Geometry', 'Statistics'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Parent — Consent Record
// ---------------------------------------------------------------------------

export function buildConsentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    learner_gcid: 'gcid-learner-001',
    guardian_gcid: 'gcid-guardian-001',
    consent_type: 'data_sharing',
    description: 'Share learning progress with third-party analytics providers',
    is_granted: true,
    granted_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-03-01T08:00:00Z',
    ...overrides,
  };
}
