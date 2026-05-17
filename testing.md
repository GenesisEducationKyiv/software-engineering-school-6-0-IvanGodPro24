# Testing Guide

## Requirements

**Git**, **Docker**, and **Node.js** should be installed on the machine.

---

## Run all tests with a single command

```bash
npm run test
```

This command runs the unit, integration, and end-to-end tests.

---

## Test types

### Unit tests

Testing isolated service logic without external dependencies. Docker is not required.

```bash
npm run test:unit
```

---

### Integration tests

Testing API endpoints using a live database and Redis. Docker starts up automatically.

```bash
npm run test:integration
```

Script automatically:

1. Starts PostgreSQL and Redis using `docker-compose.test.yml`
2. Applies migrations
3. Runs tests
4. Shuts down the containers after completion

---

### E2E tests (Playwright)

Testing the UI via a browser. Docker starts up automatically.

```bash
npm run test:e2e
```

The script automatically:

1. Starts PostgreSQL and Redis using `docker-compose.test.yml`
2. Applies migrations
3. Builds the project
4. Runs Playwright tests in Chromium
5. Deletes the containers after completion

When a test fails, the HTML report is saved in `playwright-report/`. Open:

```bash
npx playwright show-report
```
