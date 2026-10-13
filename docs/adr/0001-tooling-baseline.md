# ADR 0001: Tooling baseline

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m0

## Context

The project plan fixes the stack (pnpm workspaces, strict TypeScript, Vite, Preact, Canvas 2D, D3,
Vitest, fast-check, Playwright). A few version and tooling details had to be settled at scaffold
time.

## Decision

1. **TypeScript 6.0.x, not 7.x.** TypeScript 7 (native port) is the npm `latest`, but
   `typescript-eslint` 8.x declares `typescript <6.1.0` as its peer range.
2. **No `tsx`/`ts-node`.** Node 24 executes `.ts` files natively via type stripping, so the CLI
   (`pnpm sim run`) runs as `node packages/sim/src/cli.ts`. `erasableSyntaxOnly` in
   `tsconfig.base.json` guarantees all sim code is strippable (no enums, namespaces or
   parameter properties). Relative imports use explicit `.ts` extensions.
3. **No `@preact/preset-vite`.** Vite's built-in Oxc transform handles Preact's automatic JSX
   runtime (`importSource: 'preact'`); the preset would add Babel for HMR niceties only.
4. **Sim core is consumed as source.** `@zoned-out/sim` exports `src/index.ts`; Vite bundles it
   and Node runs it directly. No build step for the package.
5. **Hard rules are linted.** `eslint.config.js` forbids `Math.random`, `Date.now`,
   `performance.now`, `new Date()`, module-level `let`/`var`, `process`, DOM globals and Node
   built-in imports in `packages/sim/src` (except `cli.ts`).
6. **Supply-chain hygiene.** pnpm's minimum-release-age gate is respected; packages too new to
   pass it are pinned to the previous release rather than exempted.

## Consequences

- Node ≥ 24 is required locally and in CI (`.nvmrc`).
- When typescript-eslint supports TS 7, upgrading is a version bump plus a re-run of checks.
