/**
 * Typed GraphQL query strings for all learner-facing reads.
 * These queries are sent to POST /api/v1/graphql via the GraphQL service.
 *
 * Naming convention: QUERY_{DOMAIN}_{OPERATION}
 * All queries use camelCase field names (GraphQL convention).
 * Services map camelCase -> snake_case for domain models.
 */

// ---------------------------------------------------------------------------
// Shared Fragments
// ---------------------------------------------------------------------------

const TOPIC_NODE_FIELDS = `
  id
  tenantId
  name
  parentId
  sortOrder
  atomCount
  createdAt
  updatedAt
`;

// ---------------------------------------------------------------------------
// Topic Queries
// ---------------------------------------------------------------------------
// NB: QUERY_TOPIC_TREE + QUERY_KNOWLEDGE_GRAPH (both issuing the resolver-less
// `topicTree` field) and the retention fragment were removed together with the
// retired `/discovery` graph-discovery UI. The live per-user Knowledge Graph
// at `/a/map` (ADR-204 §6.3) does not use these.

/** Single topic node with one level of children */
export const QUERY_TOPIC_NODE = `
  query TopicNode($id: ID!) {
    topicNode(id: $id) {
      ${TOPIC_NODE_FIELDS}
      children {
        ${TOPIC_NODE_FIELDS}
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Engagement — Dashboard Queries
// ---------------------------------------------------------------------------

/** Learner dashboard summary (streak, XP, daily dose status, path progress) */
export const QUERY_MY_DASHBOARD = `
  query MyDashboard {
    myDashboard {
      streak {
        currentDays
        status
        longestStreak
        lastActivityAt
      }
      xp {
        totalXp
        level
        xpToNextLevel
        comboMultiplier
      }
      level
      dailyDoseStatus
      activeGoalsCount
      pathProgress {
        pathId
        pathTitle
        completionPct
        stepsCompleted
        stepsTotal
      }
    }
  }
`;

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
  query MyDailyDose {
    myDailyDose {
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
  query MyFamiliar {
    myFamiliar {
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
