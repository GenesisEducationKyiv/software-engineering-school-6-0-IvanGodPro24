# Testing Guide

This project uses three test layers:

- **Unit tests:** isolated service and business logic tests with mocked dependencies.
- **Integration tests:** API tests against the Express app with real PostgreSQL and Redis test services.
- **E2E tests:** Playwright browser tests against the built application and the static subscription page.

---

## Requirements

Install these tools before running the full test suite locally:

- Git
- Node.js v22+
- Docker and Docker Compose
- Project dependencies:

```bash
npm install
```

Playwright E2E tests also need the Chromium browser:

```bash
npx playwright install --with-deps chromium
```

---

## Test Commands

| Command | Purpose |
|---|---|
| `npm run test:unit` | Runs Jest unit tests only. |
| `npm run test:integration` | Starts test services, applies migrations, and runs integration tests. |
| `npm run test:e2e` | Starts test services, builds the app, and runs Playwright tests. |
| `npm test` | Runs unit, integration, and E2E tests in sequence. |

---

## Unit Tests

Unit tests are located in `src/__tests__/` and use Jest with `ts-jest`.

Run them with:

```bash
npm run test:unit
```

What this command does:

1. Runs Jest in Node.js with ESM support.
2. Ignores `*.integration.test.ts` files.
3. Tests isolated logic without Docker, PostgreSQL, or Redis.

Current unit test coverage includes:

- Subscription state behavior.
- GitHub API error and release handling.
- Repository scanner behavior.

---

## Integration Tests

Integration tests are located in `src/__tests__/*.integration.test.ts` and use Jest + Supertest.

Run them with:

```bash
npm run test:integration
```

The `test:integration` command executes `scripts/run-integration.sh`.

The script does this:

1. Starts test containers from `docker-compose.test.yml`.
2. Waits briefly for services to become available.
3. Exports test environment variables.
4. Applies Prisma migrations with `npx prisma migrate deploy`.
5. Runs `npm run test:integration:run`.
6. Removes test containers and volumes.

---

## E2E Tests

E2E tests are located in `e2e/` and use Playwright.

Run them with:

```bash
npm run test:e2e
```

The `test:e2e` command executes `scripts/run-e2e.sh`.

The script does this:

1. Starts test containers from `docker-compose.test.yml`.
2. Waits briefly for the database.
3. Exports test environment variables.
4. Applies Prisma migrations with `npx prisma migrate deploy`.
5. Builds the project with `npm run build`.
6. Runs `npx playwright test`.
7. Removes test containers and volumes.

Playwright configuration is defined in `playwright.config.ts`:

- Test directory: `e2e/`
- Browser project: Chromium
- Base URL: `http://localhost:3000`
- Workers: `1`
- Reporter: HTML
- Web server command: `npm run start`
- Web server URL: `http://localhost:3000`

When a Playwright test fails, the HTML report is saved in `playwright-report/`.

Open the report with:

```bash
npx playwright show-report
```

---

## Test Infrastructure

The local test infrastructure is defined in `docker-compose.test.yml`.

| Service | Container | Port |
|---|---|---|
| PostgreSQL | `github_notifier_test_db` | `localhost:5434` |
| Redis | `github_notifier_test_redis` | `localhost:6380` |
| MailHog SMTP | `github_notifier_test_smtp` | `localhost:1025` |

The integration and E2E scripts clean up containers and volumes after successful runs.

If a script is interrupted, clean up manually:

```bash
docker compose -f docker-compose.test.yml down -v --remove-orphans
```

---

## CI Testing

GitHub Actions runs tests in split jobs:

1. **Lint & Build**
   - Installs dependencies.
   - Runs ESLint.
   - Generates the Prisma client.
   - Builds the TypeScript project.
2. **Unit Tests**
   - Runs `npm run test:unit`.
3. **Integration Tests**
   - Runs `npm run test:integration`.
4. **E2E Tests**
   - Installs Chromium with `npx playwright install --with-deps chromium`.
   - Runs `npm run test:e2e`.
   - Uploads `playwright-report/` as an artifact when E2E tests fail.
5. **Deploy**
   - Runs only on `main`.
   - Starts only after unit, integration, and E2E jobs pass.

The CI pipeline is defined in `.github/workflows/ci-cd.yml`.
