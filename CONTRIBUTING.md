# Contributing

Thanks for considering a contribution. The bar to merge:

1. **Tests pass.** `pnpm test` is green locally and on CI (Node 20/22, ubuntu + macOS).
2. **Daraja parity over cleverness.** If Daraja's response uses awkward casing or
   redundant fields, copy them — devs won't switch to a mock that requires
   parser changes.
3. **No real money, no real credentials.** This is a mock. If you find yourself
   adding real M-Pesa integration, you're in the wrong repo.

## Dev loop

```bash
pnpm install
pnpm dev                # tsx watch on src/cli.ts
pnpm test:watch
pnpm typecheck
pnpm build
```

## Adding a new endpoint

1. Add a Zod schema in `src/schemas/index.ts`.
2. Add a route file in `src/routes/<name>.ts` exporting a `Hono<AppContext>`.
3. Mount it in `src/server.ts`.
4. Add a happy-path test and at least one failure test in `tests/<name>.test.ts`.

## Adding a new failure scenario

1. Add to `SUFFIX_MAP` in `src/core/failure-injector.ts`.
2. Map the scenario to a state in `scenarioToState` in `src/routes/stk-push.ts`.
3. Add a test in `tests/failure-modes.test.ts`.
4. Update the table in the README.

## Code style

- TypeScript strict, no `any` in source (test fixtures may use `any`).
- No comments unless the WHY is non-obvious.
- One feature per PR.

## Releasing

Tag `vX.Y.Z` on `main` — `.github/workflows/release.yml` publishes the Docker
image to GHCR and the npm package.
