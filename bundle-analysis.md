# Chora Web — Bundle Analysis

Expected bundle sizes and code splitting strategy for the Angular 21+ SPA.

## Initial Bundle (critical path)

The initial bundle is what loads on first navigation. Angular 21+ with `outputHashing: all` produces content-hashed filenames for aggressive CDN caching.

| Chunk | Contents | Expected Size (gzip) | Budget |
|-------|----------|---------------------|--------|
| `main-[hash].js` | Angular core, router, HttpClient, signals runtime | ~80-100 kB | 120 kB max |
| `polyfills-[hash].js` | Zone.js (if still needed), ES2022+ polyfills | ~15-25 kB | 30 kB max |
| `styles-[hash].css` | Global SCSS, design tokens, theme variables | ~10-15 kB | 20 kB max |
| **Total initial** | | **~105-140 kB** | **500 kB warning, 1 MB error** |

The `angular.json` production budget enforces:
- Initial bundle: 500 kB warning, 1 MB error
- Any component style: 4 kB warning, 8 kB error

## Lazy-Loaded Feature Chunks

Each feature directory under `src/app/features/` produces a separate lazy chunk loaded on first navigation to that route. This is the primary code splitting boundary.

### Existing Feature Modules

| Feature | Route | Expected Size (gzip) | Key Components |
|---------|-------|---------------------|----------------|
| `atomic` | `/learning/*` | ~25-35 kB | AtomPlayer, AtomCard, TopicTree, answer validation |
| `engagement` | `/engagement/*` | ~20-30 kB | StreakTracker, ComboMultiplier, DailyDose, leaderboards |
| `discovery` | `/discovery/*` | ~30-40 kB | KnowledgeGraph (D3/canvas), graph traversal, TopicRetention |
| `identity` | `/settings/*` | ~15-20 kB | Profile, linked accounts, API keys, GCID management |
| `admin` | `/admin/*` | ~35-45 kB | TenantConfig, content management, moderation panels |
| `onboarding` | `/onboarding/*` | ~10-15 kB | First-run wizard, learner profile setup |
| `choraverse` | `/choraverse/*` | ~25-35 kB | TradingCards, Duels, BossChallenges, Store |
| `invite` | `/invite/*`, `/ref/*` | ~5-8 kB | InviteHandler, referral code processing |
| `search` | `/search/*` | ~10-15 kB | Full-text search, Meilisearch integration |
| `billing` | `/billing/*` | ~15-20 kB | Payment history, add-on management, invoices |

### Phase 29 Feature Modules (new lazy chunks)

These 9 modules were added during Phase 29 full-stack development. Each is a separate lazy-loaded chunk.

| Feature | Route | Expected Size (gzip) | Key Components |
|---------|-------|---------------------|----------------|
| `campusops` | `/campusops/*` | ~20-25 kB | Facility management, room scheduling, resource allocation |
| `parent` | `/parent/*` | ~15-20 kB | Parent portal, learner progress view, notification preferences |
| `support` | `/support/*` | ~20-25 kB | Help desk, ticket management, FAQ, knowledge base |
| `wbl` | `/wbl/*` | ~15-20 kB | Work-based learning, placement tracking, supervisor feedback |
| `examadmin` | `/examadmin/*` | ~25-30 kB | Exam scheduling, proctoring config, result management |
| `community` | `/community/*` | ~20-25 kB | Social feed, study groups, peer interactions, reactions |
| `survey` | `/survey/*` | ~15-20 kB | Survey builder, response collection, analytics dashboard |
| `classroom` | `/classroom/*` | ~25-30 kB | LiveQuiz, LivePoll, attendance, timetable, real-time sync |
| `familiar` | `/familiar/*` | ~20-25 kB | RPG companion chat, personality config, SSE streaming |

## Code Splitting Strategy

### Route-Level Splitting (primary)

Every feature directory is a lazy-loaded route. Angular automatically creates a separate chunk per `loadChildren` or `loadComponent` call in the route config.

```typescript
// app.routes.ts — each produces its own chunk
{ path: 'learning', loadChildren: () => import('./features/atomic/atomic.routes') },
{ path: 'engagement', loadChildren: () => import('./features/engagement/engagement.routes') },
{ path: 'campusops', loadChildren: () => import('./features/campusops/campusops.routes') },
// ... etc
```

### Component-Level Splitting (secondary)

Heavy components within a feature should use `@defer` for further code splitting:

```html
<!-- Knowledge graph visualization: only load when visible -->
@defer (on viewport) {
  <chora-knowledge-graph [topicId]="topicId()" />
} @placeholder {
  <chora-graph-skeleton />
} @loading (minimum 200ms) {
  <chora-spinner />
}
```

Candidates for `@defer`:
- Knowledge graph canvas (D3.js dependency)
- Rich text editor (content authoring)
- Chart/analytics components (charting library)
- Duel real-time sync components (WebSocket)
- Familiar chat panel (SSE streaming)

### Shared Chunk Optimization

Angular's build optimizer automatically extracts shared code into common chunks when two or more lazy modules import the same dependency. Expected shared chunks:

| Shared Chunk | Contents | Expected Size (gzip) |
|-------------|----------|---------------------|
| `common-[hash].js` | Shared components (AtomCard, OfflineBanner), pipes, directives | ~15-20 kB |
| `vendor-[hash].js` | @ngx-translate/core, date-fns (if used), shared utilities | ~10-15 kB |

### Preloading Strategy

Use Angular's `PreloadAllModules` or a custom strategy that preloads based on user role:

- **Learner role**: Preload `atomic`, `engagement`, `discovery`, `choraverse` after initial render
- **Instructor role**: Preload `atomic`, `admin`, `classroom`, `examadmin`
- **Admin role**: Preload `admin`, `billing`, `campusops`, `governance`
- **Parent role**: Preload `parent`, `engagement` (read-only)

Do NOT preload all modules — it defeats the purpose of lazy loading on slower tablet connections.

## Size Budget Enforcement

The `angular.json` production configuration enforces budgets:

```json
{
  "budgets": [
    { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
    { "type": "anyComponentStyle", "maximumWarning": "4kB", "maximumError": "8kB" }
  ]
}
```

Additional recommendations:
- Monitor lazy chunk sizes in CI — alert if any single chunk exceeds 50 kB gzipped
- Use `source-map-explorer` or `webpack-bundle-analyzer` to audit what contributes to each chunk
- Tree-shake unused `@angular/material` modules (if adopted in future)
- Keep translation JSON files under 50 kB per locale

## Total Estimated Bundle

| Category | Size (gzip) |
|----------|-------------|
| Initial bundle | ~105-140 kB |
| All lazy chunks combined | ~350-430 kB |
| Shared chunks | ~25-35 kB |
| **Total application** | **~480-605 kB** |

This is well within performance budgets for tablet-first delivery over typical WiFi/4G connections. First meaningful paint target: under 2 seconds on a mid-range tablet.
