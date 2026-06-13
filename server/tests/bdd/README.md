# Behaviour-driven backend tests (ROUTD)

Hybrid BDD layer over the existing vitest integration harness, focused on the
**ROUTD fork features**. Two styles, same Given/When/Then vocabulary:

## 1. Gherkin `.feature` files (for the key user flows)

Plain-language `features/*.feature` files, mapped to step definitions in
`*.steps.test.ts`. Parsed and run by the tiny in-repo runner in
`support/gherkin.ts` (no external cucumber dependency — the off-the-shelf one
ships a broken ESM build). Each Scenario becomes one vitest test that runs its
steps in order on a shared `world`; a failing step throws with its Gherkin line.

- `features/bucket-list.feature` + `bucket-list.steps.test.ts`
- `features/whitelabel.feature` + `whitelabel.steps.test.ts`

Step patterns support `{string}` and `{int}` placeholders.

## 2. BDD-style vitest (for the rest)

In-TypeScript scenarios using `support/bdd.ts` (`Feature/Scenario/Given/When/
Then/And`) — no `.feature` file, handy for data-heavy specs.

- `visitor-insights.bdd.test.ts`

## Running

```
npm run test:bdd          # just the BDD layer (tests/bdd)
npm test                  # full suite (BDD included via tests/**/*.test.ts)
```

## Harness

Each spec inlines the proven db/config mocks (so Nest decorators load after the
mocks), builds the real Nest+Express app via `buildApp()`, and drives it over
`supertest`. The legacy fork routers (forkExtras) are reachable because the
bridge mounts them before Nest init. DB is reset per scenario via
`beforeEach(resetTestDb)`.

## Adding a feature

1. Write `features/<name>.feature` (or skip for BDD-style).
2. Add `<name>.steps.test.ts` (Gherkin) or `<name>.bdd.test.ts` (BDD-style),
   copying the harness block from an existing file.
3. Map every step; reuse `tests/helpers/factories.ts` for data.
