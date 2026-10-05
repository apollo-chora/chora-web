# npm audit — remaining findings (chora-web)

Status after `npm audit fix --legacy-peer-deps` (the repo's established install
convention, see .github/workflows/security.yml): **33 → 8 findings**
**0 critical · 3 high · 4 moderate · 1 low.**

## Remaining (all funnel through the Angular webpack toolchain)

| Sev | Package | Direct | Try | Why it stays |
|---|---|---|---|---|
| high | @angular-devkit/build-angular | yes | bump to 22.1.3 | Major 21→22 bump carries the same transitive vulns (verified: audit went to 9 with identical image-size/less/sockjs/uuid/webpack-dev-server) and breaks the @storybook/angular peer range (`>=18 <22`) |
| high | image-size (0.5.5 @less) | no | override 2.0.2 | Bundled inside build-angular's less@4.4.2; forced override is a major API jump that conflicts with Angular's pinned toolchain (verified: overrides raised the count to 11 and added vite+less-loader highs) |
| high | less (4.4.2 @build-angular) | no | bump 4.8.1 | Same bundled toolchain constraint as image-size; no compatible fix inside 21.x |
| moderate | @storybook/angular | yes | fix | Peer-locked to Angular <22 through @angular-devkit/build-angular; a bump to Angular 22 breaks it (incompatible peer range), an override does not resolve cleanly |
| moderate | sockjs / uuid / webpack-dev-server | no | | Packaged inside @angular-devkit/build-webpack@0.2102.x; only cleared by the A22 major that carries the same advisories |
| low | esbuild | no | fix | Resolved through the same webpack chain; follows the build-angular constraint |

## What was tried and rejected (verified, not assumed)

- **Angular 21 → 22 major bump**: did NOT clear the 3 HIGH (build-angular 22.1.3
  still bundles the vulnerable image-size/less/sockjs/uuid/webpack-dev-server)
  and broke Storybook's peer range. Reverted.
- **npm overrides** (image-size 2.0.2, uuid ^9, sockjs 0.3.24): the reselection
  was incompatible with Angular's pinned toolchain — audit went to 11 and
  introduced new high findings (@angular/build, vite, less-loader). Reverted.

## Conclusion (goal stop rule)

The remaining 3 HIGH + 4 moderate are **not fixable within chora-web scope
without a build-breaking change**: they are shipped inside
`@angular-devkit/build-angular`'s bundled webpack toolchain, and the only
candidate fix (A22) neither clears them nor keeps Storybook compatible. Cleared
net effect: **all 5 criticals fixed, 0 critical remains**. Fixing the residual
HIGHs needs an upstream Angular webpack-toolchain update or dropping
Storybook — both outside this goal's scope (would touch architecture, not a
mechanical bump).

## 2026-08-27, a new critical arrived and was closed

The conclusion above held until a critical appeared that is not part of the
Angular webpack chain at all. `GHSA-5xrq-8626-4rwp` reached the tree through
`vitest >=4.0.0 <4.1.0` and the two coverage packages pinned beside it: with
the Vitest UI server listening, an arbitrary file can be read and executed.
The audit gate caught it on build `462489d4` and refused the lane at
`sca-npm-audit`, reporting one new high or critical id above a baseline that
tracks two.

It was closed by a bump rather than a baseline entry. `vitest` moves to
`^4.1.11` and `@vitest/coverage-istanbul` and `@vitest/coverage-v8` come off
their `4.0.18` pins. The peer range on `@analogjs/vitest-angular` is
`^1.3.1 || ^2.0.0 || ^3.0.0 || ^4.0.0`, so 4.1.11 sits inside it and no peer
override was needed.

Measured against the updated lock, the tree goes from 13 advisories with 3
critical to 7 with none, and the only high ids left are the two `image-size`
entries this document already explains. The baseline file was not touched.
This one was a mechanical bump, which is exactly the case the stop rule above
leaves open: the residual highs stay unfixable in scope, a new advisory
outside that chain does not.

