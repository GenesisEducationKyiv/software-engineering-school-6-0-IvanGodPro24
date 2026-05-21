# GitHub Release Notification API

A robust, production-ready REST API that allows users to subscribe to email notifications for new releases of their favorite GitHub repositories. Built as a case task for Software Engineering School 6.0.

---

## 🚀 Features & Architecture

- **Subscription State Machine:** Implements state machine logic (`PENDING` → `ACTIVE` → `UNSUBSCRIBED`) to ensure data integrity and seamless re-subscriptions.
- **Race Condition Protection:** Utilizes database-level unique constraints and Prisma operations to handle concurrent duplicate requests flawlessly.
- **Background Processing:** Uses `node-cron` for scheduled repository scanning and `BullMQ` + `Redis` for reliable, asynchronous email queuing with retry strategies (exponential backoff, 3 attempts).
- **Rate Limit Handling:** Gracefully handles GitHub API `429 Too Many Requests` errors and caches API responses in Redis to minimize external calls.
- **Production-Ready CI/CD:** Fully automated GitHub Actions pipeline (Build, Test) with zero-downtime deployment to Render via Deploy Hooks.

### 🏆 Completed Extra Tasks

- [x] Redis caching of GitHub API responses (10 min TTL)
- [x] API key authentication (`x-api-key` header for protected routes)
- [x] Prometheus metrics integration (`/metrics` endpoint)
- [x] GitHub Actions CI/CD pipeline
- [x] Deployed API to cloud hosting (Render)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v22, TypeScript |
| Framework | Express.js |
| Database | PostgreSQL, Prisma ORM |
| Caching & Queues | Redis, BullMQ, ioredis |
| Mailing | Nodemailer, Handlebars (HTML templates) |
| Testing | Jest, ts-jest, Supertest, Playwright |
| Observability | Prometheus (`prom-client`), Grafana |
| Containerization | Docker, Docker Compose |

---

## ⚡ Quick Start

The fastest way to get the project running locally:

**1. Clone the repository:**

```bash
git clone https://github.com/GenesisEducationKyiv/software-engineering-school-6-0-IvanGodPro24.git
cd software-engineering-school-6-0-IvanGodPro24
```

**2. Set up environment variables:**

```bash
cp .env.example .env
# Edit .env with your values (see "Environment Configuration" below)
```

**3. Start with Docker:**

```bash
docker compose up -d --build
```

**4. Done.** The API is now available at `http://localhost:3000`.

---

## ⚙️ Local Development

The easiest way to run the application locally is using Docker. The provided `docker-compose.yml` spins up the API server, background worker, PostgreSQL, Redis, Prometheus, and Grafana in a single command.

### 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- Node.js v22+ (only if running outside of Docker)

### 2. Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```env
# Database & Redis (use these exact values for local Docker setup)
DATABASE_URL=postgresql://postgres:postgres@db:5432/github_notifier
REDIS_URL=redis://redis:6379

# Application
PORT=3000
APP_URL=http://localhost:3000
API_KEY=your_super_secret_api_key

# External APIs
GH_TOKEN=your_github_personal_access_token

# SMTP Configuration (see "Choosing an SMTP Service" below)
SMTP_FROM=your_email@gmail.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

### 3. Choosing an SMTP Service

- **For local testing (no real emails):** Use [Mailtrap Sandbox](https://mailtrap.io/). It intercepts all outgoing emails and stores them in a virtual inbox — no real delivery happens.
- **For production (real emails):** Use [Brevo](https://www.brevo.com/) (formerly Sendinblue). Ensure your sender domain/email is verified in their dashboard.

> ⚠️ **Note on spam:** When testing with a real SMTP provider, confirmation emails may land in the **Spam or Promotions** folder. Please check there if you don't see the email in your primary inbox.

### 4. Running the Application

Start the entire infrastructure in detached mode:

```bash
docker compose up -d --build
```

Docker will automatically:

1. Initialize the PostgreSQL database
2. Run Prisma migrations (`prisma migrate deploy`)
3. Start the API server on port `3000`
4. Start the BullMQ email worker
5. Launch Prometheus and Grafana

---

## 📚 API Documentation (Swagger)

Once the application is running, the full interactive API documentation is available via **Swagger UI:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

> To use the `GET /api/subscriptions` endpoint, click the **Authorize** button in Swagger UI and enter the `API_KEY` value from your `.env` file.

### Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/subscribe` | Subscribe an email to a GitHub repo | — |
| `GET` | `/api/confirm/:token` | Confirm email subscription | — |
| `GET` | `/api/unsubscribe/:token` | Unsubscribe from notifications | — |
| `GET` | `/api/subscriptions?email=` | List active subscriptions for an email | `x-api-key` |

---

## 📊 Observability

The project includes a fully configured monitoring stack:

- **Prometheus raw metrics:** [http://localhost:3000/metrics](http://localhost:3000/metrics)
- **Prometheus server:** [http://localhost:9090](http://localhost:9090)
- **Grafana dashboards:** [http://localhost:3001](http://localhost:3001) — login `admin` / password `admin`

In Grafana, add `http://prometheus:9090` as a Prometheus data source to visualize HTTP request durations, memory usage, and Event Loop lag.

> A **BullMQ Dashboard** is also available at [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) to monitor email job statuses in real time.

---

## 🧪 Testing

The project has separate test layers for isolated business logic, API integration, and browser-level E2E.

### Requirements

- Node.js v22+
- Docker and Docker Compose
- Playwright Chromium browser for E2E tests:

```bash
npx playwright install --with-deps chromium
```

### Test Commands

| Command | Description |
|---|---|
| `npm run test:unit` | Runs Jest unit tests only. No Docker services are required. |
| `npm run test:integration` | Starts the test PostgreSQL and Redis containers, applies Prisma migrations, runs integration tests, then removes the containers. |
| `npm run test:e2e` | Starts the test containers, applies migrations, builds the app, runs Playwright E2E tests in Chromium, then removes the containers. |
| `npm test` | Runs unit, integration, and E2E tests in sequence. |

### Unit Tests

Unit tests cover isolated service logic with mocked dependencies:

```bash
npm run test:unit
```

Current unit coverage includes subscription logic, GitHub API handling, and repository scanning.

### Integration Tests

Integration tests use Jest + Supertest against the Express app with a real test PostgreSQL database and Redis instance:

```bash
npm run test:integration
```

The `scripts/run-integration.sh` helper starts services from `docker-compose.test.yml`, applies Prisma migrations, runs `*.integration.test.ts`, and cleans up the test containers.

### E2E Tests

E2E tests use Playwright against the built application and the static subscription page served from `public/`:

```bash
npm run test:e2e
```

The `scripts/run-e2e.sh` helper starts the test PostgreSQL, Redis, and MailHog SMTP containers, applies Prisma migrations, builds the project, and runs the Chromium Playwright suite from `e2e/`.

If an E2E test fails, Playwright writes an HTML report to `playwright-report/`. Open it with:

```bash
npx playwright show-report
```

### Test Infrastructure

The test environment is defined in `docker-compose.test.yml`:

- PostgreSQL on `localhost:5434`
- Redis on `localhost:6380`
- MailHog SMTP on `localhost:1025`

GitHub Actions runs testing as split CI jobs: lint/build, unit tests, integration tests, and E2E tests. The deploy job runs only after all test jobs pass on `main`.

---

## 🗂 Main Project Structure

```bash
src/
├── controllers/        # Express route handlers
├── db/                 # Prisma client singleton
├── middleware/         # Auth, validation, error handling
├── queue/              # BullMQ queue, worker, Redis client
├── routes/             # Express routers
├── services/           # Business logic (github, scanner, email)
├── templates/          # Handlebars HTML email templates
├── utils/              # Shared utilities (getEnvVar)
├── validation/         # Zod schemas
└── index.ts            # App entry point
public/                 # Static subscription page used by the app and E2E tests
e2e/                    # Playwright end-to-end tests
scripts/                # Test runner helper scripts
prisma/
├── schema.prisma
└── migrations/
```
