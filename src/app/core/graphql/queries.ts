/**
 * Typed GraphQL query strings for all learner-facing reads.
 * These queries are sent to POST /api/v1/graphql via the GraphQL service.
 *
 * Naming convention: QUERY_{DOMAIN}_{OPERATION}
 * All queries use camelCase field names (GraphQL convention).
 * Services map camelCase -> snake_case for domain models.
 */

// ---------------------------------------------------------------------------
// Topic Queries
// ---------------------------------------------------------------------------
// NB: QUERY_TOPIC_TREE + QUERY_KNOWLEDGE_GRAPH (both issuing the resolver-less
// `topicTree` field) and the retention fragment were removed together with the
// retired `/discovery` graph-discovery UI. The live per-user Knowledge Graph
// at `/a/map` (ADR-204 §6.3) does not use these.

// ---------------------------------------------------------------------------
// Engagement — Dashboard Queries
// ---------------------------------------------------------------------------

/** Current learner streak only */
export const QUERY_MY_STREAK = `
  query MyStreak {
    myStreak {
      currentDays
      status
      longestStreak
      lastActivityAt
    }
  }
`;

/** Current learner XP summary only */
export const QUERY_MY_XP = `
  query MyXP {
    myXP {
      totalXp
      level
      xpToNextLevel
      comboMultiplier
    }
  }
`;

/** Today's DailyDose card stack */
export const QUERY_MY_DAILY_DOSE = `
  query DailyDose {
    dailyDose {
      cards {
        atom {
          id
          atomType
          difficulty
          latestRevision {
            id
            revisionNumber
            content
          }
        }
        topicLabel
        estimatedSeconds
        isGoalAligned
        source
      }
      combo
      xpEarned
      completedCount
    }
  }
`;

// ---------------------------------------------------------------------------
// Familiar Queries
// ---------------------------------------------------------------------------

/** Current learner's Familiar companion */
export const QUERY_MY_FAMILIAR = `
  query MyCompanion {
    myCompanion {
      id
      gcid
      name
      species
      personality
      level
      xp
      mood
      avatarUrl
      createdAt
      updatedAt
    }
  }
`;

/** Familiar interaction stats */
export const QUERY_MY_FAMILIAR_STATS = `
  query MyFamiliarStats {
    myFamiliarStats {
      familiarId
      totalInteractions
      encouragementsGiven
      questsCompleted
      streakAssists
      moodHistory {
        mood
        recordedAt
      }
    }
  }
`;
