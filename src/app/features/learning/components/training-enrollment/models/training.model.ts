/**
 * TypeScript interfaces for trainer-led training sessions.
 * Source of truth: chora-contracts/openapi/delivery-admin.yaml
 *
 * Learner-facing reads use REST: GET /api/v1/training/sessions
 * Enrollment uses REST: POST/DELETE /api/v1/training/sessions/{id}/enroll
 */

// ---------------------------------------------------------------------------
// Domain Entities
// ---------------------------------------------------------------------------

export interface TrainingSession {
  id: string;
  title: string;
  description: string;
  trainerName: string;
  trainerGcid: string;
  trainerBio: string | null;
  dateTime: string; // ISO 8601
  durationMinutes: number;
  capacity: number;
  enrolledCount: number;
  topics: string[];
  prerequisites: string[];
  location: string | null;
  virtualLink: string | null;
  status: TrainingSessionStatus;
  isEnrolled: boolean;
  waitlistPosition: number | null;
}

export type TrainingSessionStatus =
  | 'published'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// ---------------------------------------------------------------------------
// API Response
// ---------------------------------------------------------------------------

export interface TrainingSessionListResponse {
  data: TrainingSession[];
}

export interface EnrollmentResponse {
  sessionId: string;
  enrolled: boolean;
  waitlistPosition: number | null;
}

// ---------------------------------------------------------------------------
// Discriminated Union State (AsyncState pattern)
// ---------------------------------------------------------------------------

export type TrainingListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; sessions: TrainingSession[] }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Capacity Helpers
// ---------------------------------------------------------------------------

export type CapacityLevel = 'available' | 'filling' | 'nearly_full' | 'full';

export function getCapacityLevel(session: TrainingSession): CapacityLevel {
  const ratio = session.enrolledCount / session.capacity;
  if (ratio >= 1) return 'full';
  if (ratio > 0.8) return 'nearly_full';
  if (ratio > 0.5) return 'filling';
  return 'available';
}

export const CAPACITY_LEVEL_LABELS: Record<CapacityLevel, string> = {
  available: 'Available',
  filling: 'Filling Up',
  nearly_full: 'Nearly Full',
  full: 'Full',
};

export const SESSION_STATUS_LABELS: Record<TrainingSessionStatus, string> = {
  published: 'Upcoming',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
