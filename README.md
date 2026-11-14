# Garage bot

A private Telegram bot with persistent **Garage piccolo** and **Garage grande**
buttons. Written in TypeScript, executed directly by Node.js 26 with native type
stripping. There is no TypeScript compilation step.

## Setup

1. Create a bot using Telegram's [@BotFather](https://t.me/BotFather) and obtain
   its token. Keep inline mode disabled and disable group joining with `/setjoingroups`.
2. Copy the example configuration:

   ```sh
   cp .env.example .env
   ```

3. Set `TELEGRAM_BOT_TOKEN`. Start with `DRY_RUN=true` and a positive placeholder
   user ID in `ALLOWED_TELEGRAM_USER_IDS` if you do not know your real ID yet.
4. Start the bot:

   ```sh
   docker compose up -d --build
   docker compose logs -f garage-bot
   ```

5. Open a private chat with your bot and send `/id`. This command works without
   authorization and returns only your own numeric Telegram ID. Put your ID and
   any other trusted users' IDs in the comma-separated allowlist, then recreate
   the container with `docker compose up -d`.
6. Send `/start` or `/garage`. Test both buttons. The menu, replies, and logs must
   indicate **DRY RUN**. No garage request is made, and no garage secret is needed.

Only one running instance may poll a given bot token. Group messages are ignored;
every garage operation requires an allowlisted user in a private chat. Usernames
are not used for authorization. Forwarded messages do not grant access.

## Configuration

| Variable                    | Default                 | Purpose                                            |
| --------------------------- | ----------------------- | -------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`        | Required                | Token issued by BotFather                          |
| `ALLOWED_TELEGRAM_USER_IDS` | Required                | Comma-separated positive numeric user IDs          |
| `DRY_RUN`                   | `true`                  | Exactly `true` or `false`; controls simulation     |
| `GARAGE_API_BASE_URL`       | `http://10.0.0.90:8443` | HTTP(S) origin without credentials, path, or query |
| `GARAGE_API_SECRET`         | Empty                   | Required when `DRY_RUN=false`                      |

The `.env` file is ignored by Git and excluded from the Docker build context.
Do not commit credentials. Environment variables are loaded by Compose or the
development command; `pnpm start` expects them to already be exported.

## Enable real door actions

With the owner present to observe the doors, set the real `GARAGE_API_SECRET` and
change `DRY_RUN=false` in `.env`. Recreate the container:

```sh
docker compose up -d
```

Check that startup logs show `"dryRun":false`, then test each door once. To return
to simulation, set `DRY_RUN=true` and recreate the container again. Mode changes
take effect only after recreation; a plain restart does not reload `.env`.

Each button issues a single `POST /toggleAction` with JSON containing the configured
`secret` and either `"door":"small"` or `"door":"large"`. The supplied controller
uses **toggle** behavior: an action may open, stop, or close a door. There is no
door-position feedback. Successful responses indicate only command acceptance.

Requests time out after five seconds and never retry automatically or follow
redirects. Timeouts and network failures have an unknown physical outcome: check
the door before trying again. A per-door five-second cooldown is shared across
all users, including simulated and failed actions. In-flight requests block
another action for the same door.

Pending Telegram updates are discarded at startup. Activation messages older
than 30 seconds are rejected. Duplicate update IDs are ignored within a bounded
in-memory cache. Restarting clears this cache and cooldowns; the controller does
not provide an idempotency contract, so exactly-once physical operation is not
guaranteed.

## Operation

The container runs as a non-root user and publishes no ports. Its standard bridge
network needs outbound HTTPS access to Telegram and LAN access to the configured
garage host. No Home Assistant instance, reverse proxy, database, or volume is
required. Telegram polling recovers from transient network failures; fatal
authentication or competing-poller failures exit the process. Compose restarts it
unless explicitly stopped.

```sh
# Inspect status and logs
docker compose ps
docker compose logs --tail=100 garage-bot

# Rebuild after source changes
docker compose up -d --build

# Stop and remove the container
docker compose down
```

Logs contain action user IDs, doors, mode, duration, and outcomes. Tokens, garage
secrets, HTTP bodies, and raw errors are excluded from application logs.

## Development and verification

Install the Node.js version in `.nvmrc` and pnpm version in `package.json`.
All dependency versions are pinned in the manifest and lockfile.

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm dev

pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm format

docker build -t garage-bot:local .
docker compose config --no-env-resolution --quiet
```

Biome formats and lints the code. TypeScript checks types with `noEmit`, while
Node executes source and tests directly. Use type-only imports and erasable
TypeScript syntax; avoid enums, parameter properties, and TypeScript path aliases.

Tests intercept Telegram calls and mock garage requests. Timeout/redirect tests
use an ephemeral loopback HTTP server and need permission to bind a local socket.
Automated checks never call the real garage controller. Live Telegram dry-run
acceptance requires your token and user IDs; real door acceptance requires the
owner to observe the doors.

`pnpm test:coverage` uses Node's native coverage support, prints a summary, and
writes `coverage/lcov.info` for coverage viewers and CI tools. It requires 100%
line, branch, and function coverage for TypeScript source files under `src/`,
including files not loaded by the tests. The process entrypoint (`src/index.ts`)
is excluded and remains untested. Tests and dependencies are also excluded.
Generated reports are ignored by Git and excluded from Biome checks.

## Dependency updates and releases

Install the [Renovate GitHub App](https://github.com/apps/renovate) and grant it
access to this repository. `renovate.json` enables dependency PRs for npm/pnpm,
the Node.js runtime, Docker base images, and GitHub Actions. Versions stay pinned.
Node.js updates stay on version 26 and are grouped across `.nvmrc`, `package.json`,
and the Dockerfile. pnpm updates are grouped across `package.json` and the Docker
install command. Review and merge dependency PRs after the checks pass.

Release Please runs on pushes to `main` and can also be run manually from Actions.
Use Conventional Commits in commit messages (or squash merge titles): `fix:`
triggers a patch release, `feat:` a minor release, and `feat!:` or a
`BREAKING CHANGE:` footer a major release. Runtime dependency and Docker updates
use `fix(deps):`; development/tooling updates use `chore(deps):` and wait for the
next releasable change.

The release manifest starts from the current package version, `1.0.0`, and the
bootstrap commit is the main branch commit immediately before this automation.
Release Please opens a PR updating `package.json`, the manifest, and `CHANGELOG.md`.
Merge that PR to create a GitHub release and a `vX.Y.Z` tag. This private package
is not published to npm.

Configure the Actions secret `RELEASE_PLEASE_TOKEN` with a dedicated token that
has repository Contents, Issues, and Pull requests read/write permissions. It
must belong to an account with write access to this repository. A classic PAT
needs `repo` access. Using this token allows the generated release PRs and tags
to trigger other workflows; GitHub's built-in token does not trigger them. The
release workflow does not fall back to the built-in token.

## Published container images

Pushing a `v*` tag, including a tag created by Release Please, builds the tagged
commit and publishes a Linux amd64 image to `ghcr.io/edge33/garage-bot`. A release
tag such as `v1.0.1` produces image tags `v1.0.1` and `1.0.1`; stable semantic
versions also update `latest`. Prerelease tags do not update `latest`. No image is
published for ordinary branch pushes or pull requests.

The image workflow authenticates with `GITHUB_TOKEN` and `packages: write`;
no additional registry secret is required. Images are private by default. For
private pulls on the homelab, log in with an account that has package access and
a classic PAT with `read:packages`, using `docker login ghcr.io`. Pin deployments
to a release tag or digest. To use a published image with Compose, replace
`build: .` with `image: ghcr.io/edge33/garage-bot:1.0.1` after that release exists,
then use `docker compose pull` and `docker compose up -d`. Keep one running bot
instance and the existing environment configuration.
