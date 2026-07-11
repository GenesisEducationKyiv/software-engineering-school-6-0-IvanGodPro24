# GitHub Release Notification API

A robust, production-ready REST API that allows users to subscribe to email notifications for new releases of their favorite GitHub repositories. Built as a case task for Software Engineering School 6.0.

---

## 🚀 Features & Architecture

- **Subscription State Machine:** Implements state machine logic (`PENDING` → `ACTIVE` → `UNSUBSCRIBED`) to ensure data integrity and seamless re-subscriptions.
- **Orchestrated Subscription Saga:** Coordinates subscription persistence and confirmation email delivery across the Main API and Notification Service. Successful delivery completes the Saga, while final delivery failure triggers compensation.
- **Bidirectional Asynchronous Messaging:** Uses `email-queue` for commands and `notification-result-queue` for success/failure result events.
- **Idempotent Email Result Handling:** Stores an `email-sent` BullMQ progress checkpoint and uses deterministic result job IDs to reduce duplicate confirmation emails and duplicate result events.
- **Race Condition Protection:** Utilizes database-level unique constraints and Prisma operations to handle concurrent duplicate requests flawlessly.
- **Modular Monolith + Microservice:** The main API is organized into clear modules (`subscriptions`, `repositories`, `scanner`, `github`, `notifications`, `infrastructure`), while the notification/email domain is extracted into a separate `notification-service`.
- **Background Processing:** Uses `node-cron` for scheduled repository scanning and `BullMQ` + `Redis` for reliable asynchronous communication between the main API and the notification microservice.
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

| Layer            | Technology                              |
| ---------------- | --------------------------------------- |
| Runtime          | Node.js v22, TypeScript                 |
| Framework        | Express.js                              |
| Database         | PostgreSQL, Prisma ORM                  |
| Caching & Queues | Redis, BullMQ, ioredis                  |
| Mailing          | Nodemailer, Handlebars (HTML templates) |
| Testing          | Jest, ts-jest, Supertest, Playwright    |
| Observability    | Prometheus (`prom-client`), Grafana     |
| Containerization | Docker, Docker Compose                  |

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
2. Run Prisma migrations (`npm run db:migrate`)
3. Start the API server on port `3000`
4. Start the Notification Service for email delivery
5. Launch Redis, Prometheus, Grafana, and the logging stack

---

## 📚 API Documentation (Swagger)

Once the application is running, the full interactive API documentation is available via **Swagger UI:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

> To use the `GET /api/subscriptions` endpoint, click the **Authorize** button in Swagger UI and enter the `API_KEY` value from your `.env` file.

### Endpoints

| Method | Path                        | Description                            | Auth        |
| ------ | --------------------------- | -------------------------------------- | ----------- |
| `POST` | `/api/subscribe`            | Subscribe an email to a GitHub repo    | —           |
| `GET`  | `/api/confirm/:token`       | Confirm email subscription             | —           |
| `GET`  | `/api/unsubscribe/:token`   | Unsubscribe from notifications         | —           |
| `GET`  | `/api/subscriptions?email=` | List active subscriptions for an email | `x-api-key` |

---

## 📊 Observability

The project includes a fully configured monitoring stack:

- **Prometheus raw metrics:** [http://localhost:3000/metrics](http://localhost:3000/metrics)
- **Prometheus server:** [http://localhost:9090](http://localhost:9090)
- **Grafana dashboards:** [http://localhost:3001](http://localhost:3001) — login `admin` / password `admin`

In Grafana, add `http://prometheus:9090` as a Prometheus data source to visualize HTTP request durations, memory usage, and Event Loop lag.

> A **BullMQ Dashboard** is also available at [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues). It exposes both `email-queue` and `notification-result-queue`, allowing the complete Saga command/result flow to be monitored in real time.

---

## 🧪 Testing

The test suite is split into unit, integration, and Playwright E2E layers.

| Command                    | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `npm run test:unit`        | Runs isolated Jest tests.                                             |
| `npm run test:integration` | Runs API integration tests with test PostgreSQL and Redis containers. |
| `npm run test:e2e`         | Runs Playwright browser tests against the built app.                  |
| `npm test`                 | Runs the full test suite in sequence.                                 |

Integration and E2E commands start and clean up their own Docker test infrastructure from `docker-compose.test.yml`. CI runs lint/build, unit, integration, and E2E checks as separate jobs before deployment.

For the full local workflow, required tools, ports, helper scripts, and report handling, see [testing.md](testing.md).

---

## 🗂 Main Project Structure

```bash
src/
├── containers/              # Dependency composition for main app modules
├── infrastructure/          # Technical infrastructure adapters
│   ├── cache/               # Redis cache service
│   ├── db/                  # Prisma client
│   ├── logger/              # Pino logger
│   ├── metrics/             # Prometheus metrics
│   ├── redis/               # Redis connection
│   └── swagger/             # Swagger UI setup
├── middleware/              # Express middleware
├── modules/                 # Modular monolith business modules
│   ├── github/              # GitHub API integration
│   ├── notifications/       # Queue job contracts
│   ├── repositories/        # Tracked GitHub repositories
│   ├── scanner/             # Release scanning logic
│   └── subscriptions/       # Subscription business flow
├── queue/                   # BullMQ command and result queues
├── routes/                  # Root API router
├── shared/                  # Shared utilities and domain errors
└── index.ts                 # Main API entry point

services/
└── notification-service/    # Extracted notification microservice
    ├── src/
    │   ├── templates/       # Handlebars email templates
    │   ├── email.service.ts
    │   ├── email.worker.ts
    │   ├── notification-result.publisher.ts
    │   ├── index.ts
    │   └── subscription-email.service.ts
    ├── Dockerfile
    ├── package.json
    └── tsconfig.json

public/                      # Static subscription page used by the app and E2E tests
e2e/                         # Playwright end-to-end tests
scripts/                     # Test runner helper scripts
prisma/                      # Prisma schema and migrations
docs/                        # OpenAPI docs, ADRs, and system design
```

### Architecture Summary

The project now follows a **modular monolith + microservice** approach.

The root application is responsible for subscription management, GitHub repository tracking, scheduled scanning, API endpoints, persistence, and publishing notification jobs.

The extracted `notification-service` is responsible for consuming email jobs from Redis/BullMQ, rendering email templates, and sending emails through SMTP. The main API no longer owns Nodemailer, SMTP integration, or email templates.

### Orchestrated Subscription Saga

Creating a subscription is now an asynchronous distributed process coordinated by the Main API.

```txt
Client
  -> POST /api/subscribe

Main API
  -> creates SubscriptionSaga
  -> creates or updates PENDING Subscription
  -> publishes confirm-subscription to email-queue
  -> returns 202 Accepted

Notification Service
  -> sends confirmation email through SMTP
  -> publishes confirmation-email-sent or confirmation-email-failed

Main API Notification Result Worker
  -> success: marks Saga as COMPLETED
  -> failure: compensates local changes and marks Saga as COMPENSATED
```

Subscription.status and SubscriptionSaga.status represent different concerns:

| State                                 | Meaning                                               |
| ------------------------------------- | ----------------------------------------------------- |
| Subscription.PENDING                  | The user has not clicked the confirmation link yet    |
| Subscription.ACTIVE                   | The user confirmed the subscription                   |
| Subscription.UNSUBSCRIBED             | The user unsubscribed                                 |
| SubscriptionSaga.EMAIL_SEND_REQUESTED | The confirmation email command was published          |
| SubscriptionSaga.COMPLETED            | The confirmation email was successfully sent          |
| SubscriptionSaga.COMPENSATED          | Email delivery failed and local changes were reverted |

A completed Saga does not mean that the subscription is already active. It means that the distributed operation successfully created the pending subscription and delivered the confirmation email.

### Redis and BullMQ Roles

Redis is used in two separate roles:

1. **Cache storage** for GitHub API responses. This reduces repeated external calls and helps the app handle GitHub API rate limits more gracefully.
2. **Message broker backend** for BullMQ queues. BullMQ stores email jobs in Redis so they can be processed asynchronously by the notification microservice.

The email delivery flow is:

```txt
Main API
  -> publishes email command to email-queue
  -> Redis stores the command
  -> Notification Service consumes the command
  -> SMTP provider sends email
  -> Notification Service publishes result event
  -> notification-result-queue stores the result
  -> Main API consumes the result
  -> Saga becomes COMPLETED or COMPENSATED
```

This keeps HTTP request handling independent from email delivery. If SMTP is slow or temporarily unavailable, the API can still publish a job quickly, while BullMQ handles retries and the Notification Service processes the queue separately.
