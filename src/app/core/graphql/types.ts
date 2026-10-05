/**
 * TypeScript interfaces for GraphQL responses across all learner-facing domains.
 * Source of truth: chora-contracts/graphql/ + backend Go resolvers.
 *
 * GraphQL returns camelCase; domain models use snake_case.
 * Mapping happens in the consuming services, not here.
 * These types represent the raw GraphQL wire format.
 */

// ---------------------------------------------------------------------------
// GraphQL Protocol Types (re-exported from atom.models for backward compat)
// ---------------------------------------------------------------------------

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  data: T | null;
  errors?: GraphQLError[];
}

// ---------------------------------------------------------------------------
// Engagement — Dashboard (GraphQL wire format, camelCase)
// ---------------------------------------------------------------------------

export interface GqlStreakData {
  currentDays: number;
  status: string;
  longestStreak: number;
  lastActivityAt: string;
}

export interface GqlXpSummary {
  totalXp: number;
  level: number;
  xpToNextLevel: number;
  comboMultiplier: number;
}

export interface GqlPathProgress {
  pathId: string;
  pathTitle: string;
  completionPct: number;
  stepsCompleted: number;
  stepsTotal: number;
}

export interface GqlDashboardData {
  streak: GqlStreakData;
  xp: GqlXpSummary;
  level: number;
  dailyDoseStatus: string;
  activeGoalsCount: number;
  pathProgress: GqlPathProgress[];
}

// ---------------------------------------------------------------------------
// Engagement — DailyDose (GraphQL wire format)
// ---------------------------------------------------------------------------

export interface GqlDailyDoseAtom {
  id: string;
  atomType: string;
  difficulty: number;
  latestRevision: {
    id: string;
    revisionNumber: number;
    content: Record<string, unknown>;
  } | null;
}

export interface GqlDailyDoseCard {
  atom: GqlDailyDoseAtom;
  topicLabel: string;
  estimatedSeconds: number;
  isGoalAligned: boolean;
  source: string;
}

export interface GqlDailyDoseSession {
  cards: GqlDailyDoseCard[];
  combo: number;
  xpEarned: number;
  completedCount: number;
}


// ---------------------------------------------------------------------------
// Familiar — RPG Companion (GraphQL wire format)
// ---------------------------------------------------------------------------

export interface GqlFamiliar {
  id: string;
  gcid: string;
  name: string;
  species: string;
  personality: string;
  level: number;
  xp: number;
  mood: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GqlFamiliarStats {
  familiarId: string;
  totalInteractions: number;
  encouragementsGiven: number;
  questsCompleted: number;
  streakAssists: number;
  moodHistory: GqlMoodEntry[];
}

export interface GqlMoodEntry {
  mood: string;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge Graph — Topic Tree with Retention (GraphQL wire format)
// ---------------------------------------------------------------------------

export interface GqlTopicNode {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  atomCount: number | null;
  createdAt: string;
  updatedAt: string;
  retentionPercent: number | null;
  children: GqlTopicNode[];
}
