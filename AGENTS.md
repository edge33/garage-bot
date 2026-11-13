# Project instructions

## Scope and approach

- This is a private Telegram bot for operating two garage doors, deployed with
  Docker Compose in a homelab. Keep the service small and focused.
- Read the relevant code and README before changing behavior. Follow explicit
  user instructions and prefer existing conventions, tools, and dependencies.
- Apply KISS. Avoid speculative features, unnecessary abstractions, unrelated
  refactors, and dependency upgrades outside the requested work.

## Runtime and tooling

- Use Node.js 26 with native TypeScript type stripping. The pinned runtime is in
  `.nvmrc` and the Dockerfile; keep them consistent when updating Node.
- Use pnpm, with the version pinned in `package.json`. Keep dependency versions
  exact and update `pnpm-lock.yaml` when dependencies change. Use frozen installs
  for verification and container builds.
- Run `.ts` source directly. Do not introduce a TypeScript compilation step,
  bundler, transpiler, or alternate runtime.
- Use ESM, explicit `.ts` relative import extensions, and `import type` for types.
  Preserve strict type checking with `noEmit` and `erasableSyntaxOnly`. Avoid
  enums, parameter properties, and path aliases that Node cannot execute directly.
- Use Biome for formatting and linting, and Node's native test runner, assertions,
  and fetch API. Reuse grammY for Telegram integration.

## Readability and structure

- Write human-readable code with spaces and blank lines between logical steps.
  Keep the existing two-space indentation and Biome formatting.
- Prefer clear names, small cohesive functions, explicit control flow, and early
  returns. Avoid dense expressions and clever shortcuts.
- Comment on reasons and constraints rather than narrating obvious operations.
  Keep changes focused and remove stale comments when behavior changes.
- Keep environment validation in `src/config.ts`, garage requests and cooldowns
  in `src/garage.ts`, Telegram handlers in `src/bot.ts`, and process lifecycle in
  `src/index.ts`.
- Keep external data validated and types precise. Avoid unjustified `any` and
  hidden side effects; inject clocks and network dependencies where tests need them.

## Garage behavior and safeguards

- Preserve the button mapping: **Garage piccolo** sends `door: "small"` and
  **Garage grande** sends `door: "large"` to `POST /toggleAction` with the secret
  in the JSON body. Preserve the configured HTTP scheme even on port 8443.
- This API toggles the controller; it does not guarantee opening or report door
  position. Replies must describe command acceptance, failure, or uncertainty,
  without claiming that a door is open.
- Default `DRY_RUN` to `true`. In dry run, return a visibly simulated response
  before any garage network activity, including DNS. No garage secret is required
  in this mode. Keep dry-run status visible in menus, action replies, and logs.
- Authorize every garage operation using numeric Telegram user IDs and private
  chats only. The private `/id` lookup may work without allowlisting but must not
  grant access. Never authorize by username or trust button labels as authorization.
- Preserve the five-second timeout, no automatic garage retries, redirect
  rejection, per-door in-flight guard, and five-second cooldown shared across
  users, including simulated and failed actions.
- Preserve startup discarding of pending Telegram updates, rejection of stale
  activation messages, and bounded in-memory deduplication. Do not claim
  exactly-once physical operation across restarts.
- Use Italian for user-facing bot text and retain clear loading/error outcomes
  where relevant. Keep the persistent two-button keyboard.

## Secrets and external systems

- Keep credentials in ignored `.env` configuration. Use placeholders only in
  examples; never copy actual tokens or garage secrets into code or documentation.
- Do not print secrets, request bodies, credential-bearing URLs, or raw transport
  errors. Telegram errors can contain the bot token in their URL.
- Automated checks must never contact the real garage controller. Use mocks or
  an ephemeral loopback HTTP server. Use dummy credentials in verification.
- Live Telegram tests require configured credentials. Real door tests require
  explicit user authorization and an owner present to observe the doors. Do not
  change a user's live `DRY_RUN` configuration as part of routine verification.
- Keep deployment as one long-polling instance per bot token, with a non-root
  container and no published ports. Do not add a database or public webhook
  service without a requirement for it.

## Verification and delivery

- Add meaningful tests for changed behavior and important failure cases. Test
  observable outcomes rather than mirroring implementation details.
- Run relevant checks: `pnpm check`, `pnpm typecheck`, and `pnpm test`. Use
  `pnpm test:coverage` to print coverage and write `coverage/lcov.info`; keep
  reports ignored and include untested source files in the totals.
- HTTP timeout/redirect tests need a local socket. A sandbox permission error is
  an environment limitation, not a passing test; rerun with appropriate access.
- For deployment changes, verify `docker build -t garage-bot:local .` and
  `docker compose config --no-env-resolution --quiet`. Do not expose resolved
  secrets through Compose configuration output.
- Documentation-only changes need a focused review; do not add tests that merely
  assert document contents.
- Update the README when setup, configuration, behavior, or public contracts change.
  Review the final diff for scope, readability, secrets, and unintended artifacts.
- Finish with a concise summary, checks actually run, remaining limitations, and
  the worktree/branch when available. Do not claim unrun checks passed.
