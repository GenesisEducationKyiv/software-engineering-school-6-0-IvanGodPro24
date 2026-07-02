# Application Architecture

This document describes the current architecture of the GitHub Release Notification API.
It focuses on service boundaries, component responsibilities, data ownership, runtime dependencies, and the intended dependency direction inside the codebase.

For deeper reliability and flow details, see [System Design](system-design.md) and the [Architecture Decision Records](adr).

## 1. Architecture Style

The application uses a hybrid architecture:

- **Main API** is a modular monolith built with Node.js, TypeScript, Express, Prisma, PostgreSQL, Redis, and BullMQ.
- **Notification Service** is an extracted worker service responsible for email delivery.
- **GitHub Scanner Service** is an extracted service responsible for GitHub repository verification and release scanning.
- **Shared packages** contain cross-service contracts and small shared utilities.

The main design goal is to keep business decisions in the Main API while moving slow or independently scalable work, such as SMTP delivery and GitHub scanning, into separate services.

## 2. System Context

```mermaid
flowchart LR
    User[User / Browser]
    MainApi[Main API]
    NotificationService[Notification Service]
    ScannerService[GitHub Scanner Service]
    GitHub[GitHub API]
    Smtp[SMTP Provider]
    Prometheus[Prometheus]
    Grafana[Grafana]
    Logstash[Logstash]
    Elasticsearch[Elasticsearch]
    Kibana[Kibana]

    User -->|REST API| MainApi
    MainApi -->|gRPC repository verification| ScannerService
    MainApi -->|BullMQ email commands| NotificationService
    ScannerService -->|GitHub REST API| GitHub
    NotificationService -->|SMTP| Smtp
    Prometheus -->|scrapes /metrics| MainApi
    Grafana -->|reads metrics| Prometheus
    MainApi -->|GELF logs| Logstash
    NotificationService -->|GELF logs| Logstash
    Logstash --> Elasticsearch
    Kibana -->|reads logs| Elasticsearch
```

External actors and systems:

| Actor/System | Responsibility |
| --- | --- |
| User / Browser | Creates, confirms, lists, and cancels subscriptions. |
| GitHub API | Source of repository existence and latest release data. |
| SMTP Provider | Sends confirmation and release notification emails. |
| Prometheus / Grafana | Collect and visualize operational metrics. |
| ElasticSearch / Logstash / Kibana | Collect and inspect service logs in Docker Compose. |

## 3. Container View

```mermaid
flowchart TD
    Client[Client]

    subgraph MainAPI[Main API Container]
        ApiRoutes[Express routes and middleware]
        SubscriptionModule[Subscriptions module]
        Saga[Subscription saga orchestrator]
        ScannerEventWorker[Scanner event worker]
        QueueAdapters[Queue adapters]
        ScannerVerifier[gRPC scanner verifier]
    end

    subgraph Notification[Notification Service Container]
        EmailWorker[Email worker]
        EmailHandler[Email job handler]
        Templates[Handlebars templates]
        ResultPublisher[Notification result publisher]
    end

    subgraph Scanner[GitHub Scanner Service Container]
        RestApi[REST routes]
        GrpcApi[gRPC service]
        VerificationService[Repository verification service]
        ScannerWorker[Scanner command and cron workers]
        GithubClient[GitHub client]
        ScannerPublisher[Scanner event publisher]
    end

    MainDb[(Main PostgreSQL)]
    ScannerDb[(Scanner PostgreSQL)]
    Redis[(Redis)]
    GitHub[GitHub API]
    SMTP[SMTP Provider]

    Client -->|HTTP| ApiRoutes
    ApiRoutes --> SubscriptionModule
    SubscriptionModule --> Saga
    Saga --> MainDb
    Saga --> QueueAdapters
    QueueAdapters -->|email-queue| Redis
    QueueAdapters -->|scanner-command-queue| Redis
    ScannerVerifier -->|gRPC| GrpcApi

    Redis -->|email jobs| EmailWorker
    EmailWorker --> EmailHandler
    EmailHandler --> Templates
    EmailHandler -->|SMTP| SMTP
    ResultPublisher -->|notification-result-queue| Redis
    Redis -->|notification results| Saga

    GrpcApi --> VerificationService
    RestApi --> VerificationService
    VerificationService --> GithubClient
    ScannerWorker --> GithubClient
    ScannerWorker --> ScannerDb
    ScannerWorker --> ScannerPublisher
    ScannerPublisher -->|scanner-event-queue| Redis
    Redis -->|scanner events| ScannerEventWorker
    ScannerEventWorker --> MainDb
    GithubClient --> GitHub
```

Runtime containers in `docker-compose.yml`:

| Container | Role |
| --- | --- |
| `app` | Main API and Main API workers. |
| `notification-service` | Email command consumer and notification result publisher. |
| `github-scanner-service` | Repository verification, tracked repository projection, release scanning. |
| `db` | Main API PostgreSQL database. |
| `scanner_db` | GitHub Scanner Service PostgreSQL database. |
| `redis` | BullMQ backend and GitHub release cache. |
| `prometheus`, `grafana` | Metrics stack. |
| `elasticsearch`, `logstash`, `kibana` | Logging stack. |

## 4. Component View

### 4.1. Main API

```mermaid
flowchart TD
    Routes[src/routes]
    Middleware[src/middleware]
    Controller[subscription.controller.ts]
    Service[subscription.service.ts]
    Saga[subscription-saga.orchestrator.ts]
    Compensation[subscription-saga-compensation.service.ts]
    Repositories[subscription and tracked repo repositories]
    ScannerHandler[scanner-event.handler.ts]
    QueuePorts[queue ports]
    QueueAdapters[queue adapters]
    VerifierPort[repository-verifier.port.ts]
    GrpcVerifier[grpc-repository-verifier.ts]
    DbClient[Prisma client]
    RedisClient[Redis client]

    Routes --> Middleware
    Routes --> Controller
    Controller --> Service
    Service --> Saga
    Service --> Repositories
    Saga --> Repositories
    Saga --> QueuePorts
    Saga --> VerifierPort
    Compensation --> Repositories
    ScannerHandler --> Repositories
    ScannerHandler --> QueuePorts
    QueueAdapters -. implements .-> QueuePorts
    GrpcVerifier -. implements .-> VerifierPort
    Repositories --> DbClient
    QueueAdapters --> RedisClient
```

Main API responsibilities:

- Owns subscription lifecycle: `PENDING`, `ACTIVE`, `UNSUBSCRIBED`.
- Owns the subscription Saga and compensation logic.
- Owns the main read/write model for subscriptions and repositories.
- Publishes email commands and scanner synchronization commands.
- Consumes notification result events and scanner events.
- Exposes the public REST API and operational endpoints.

### 4.2. GitHub Scanner Service

```mermaid
flowchart TD
    RestRoutes[routes]
    Controller[repository-verification.controller.ts]
    GrpcServer[grpc-server.ts]
    GrpcService[repository-verification.grpc-service.ts]
    VerificationService[repository-verification.service.ts]
    TrackingService[repository-tracking.service.ts]
    ScannerService[repository-scanner.service.ts]
    CommandWorker[scanner-command.worker.ts]
    Repository[tracked-repository.repository.ts]
    GithubClient[github.client.ts]
    Cache[redis-release-cache.ts]
    Publisher[scanner-event.publisher.ts]
    ScannerDb[Scanner Prisma client]

    RestRoutes --> Controller
    Controller --> VerificationService
    GrpcServer --> GrpcService
    GrpcService --> VerificationService
    CommandWorker --> TrackingService
    TrackingService --> Repository
    ScannerService --> Repository
    ScannerService --> GithubClient
    ScannerService --> Cache
    ScannerService --> Publisher
    VerificationService --> GithubClient
    Repository --> ScannerDb
```

GitHub Scanner Service responsibilities:

- Verifies repository existence for the Main API through gRPC.
- Keeps its own tracked repository projection.
- Periodically checks GitHub releases.
- Uses Redis cache to reduce GitHub API calls.
- Publishes release events to `scanner-event-queue`.

### 4.3. Notification Service

```mermaid
flowchart TD
    Worker[email.worker.ts]
    Handler[email-job.handler.ts]
    SubscriptionEmailService[subscription-email.service.ts]
    EmailService[email.service.ts]
    Templates[templates/*.hbs]
    Publisher[notification-result.publisher.ts]
    Redis[Redis / BullMQ]
    SMTP[SMTP Provider]

    Redis -->|email-queue| Worker
    Worker --> Handler
    Handler --> SubscriptionEmailService
    SubscriptionEmailService --> Templates
    SubscriptionEmailService --> EmailService
    EmailService --> SMTP
    Handler --> Publisher
    Publisher -->|notification-result-queue| Redis
```

Notification Service responsibilities:

- Consumes email commands.
- Renders confirmation and release notification templates.
- Sends emails through SMTP.
- Publishes success or failure result events for confirmation email delivery.
- Does not modify Main API database state directly.

## 5. Main Runtime Flows

### 5.1. Subscribe Flow

```mermaid
sequenceDiagram
    actor User
    participant Main as Main API
    participant Scanner as GitHub Scanner Service
    participant DB as Main PostgreSQL
    participant Redis as Redis / BullMQ
    participant Mail as Notification Service
    participant SMTP as SMTP Provider

    User->>Main: POST /api/subscribe
    Main->>Scanner: VerifyRepository gRPC
    Scanner-->>Main: repository is valid
    Main->>DB: create or reuse Repository
    Main->>DB: create PENDING Subscription
    Main->>DB: create SubscriptionSaga
    Main->>Redis: publish confirm-subscription email job
    Main-->>User: 202 Accepted

    Mail->>Redis: consume email job
    Mail->>SMTP: send confirmation email
    SMTP-->>Mail: accepted or failed
    Mail->>Redis: publish notification result event
    Main->>Redis: consume result event
    Main->>DB: complete saga or compensate local changes
```

### 5.2. New Release Flow

```mermaid
sequenceDiagram
    participant Scanner as GitHub Scanner Service
    participant ScannerDB as Scanner PostgreSQL
    participant GitHub as GitHub API
    participant Redis as Redis / BullMQ
    participant Main as Main API
    participant DB as Main PostgreSQL
    participant Mail as Notification Service
    participant SMTP as SMTP Provider

    Scanner->>ScannerDB: load active tracked repositories
    Scanner->>GitHub: get latest release
    GitHub-->>Scanner: latest tag
    Scanner->>ScannerDB: update last seen tag
    Scanner->>Redis: publish repository-tag-updated event
    Main->>Redis: consume scanner event
    Main->>DB: load active subscriptions
    Main->>DB: update repository projection
    Main->>Redis: publish new-release email jobs
    Mail->>Redis: consume email jobs
    Mail->>SMTP: send release notifications
```

## 6. Data Ownership

| Data | Owner | Storage |
| --- | --- | --- |
| Subscriptions | Main API | Main PostgreSQL, `Subscription` table |
| Main repository projection | Main API | Main PostgreSQL, `Repository` table |
| Subscription Saga state | Main API | Main PostgreSQL, `SubscriptionSaga` table |
| Scanner tracked repository projection | GitHub Scanner Service | Scanner PostgreSQL, `TrackedRepository` table |
| Email jobs | Main API produces, Notification Service consumes | Redis / BullMQ |
| Notification result events | Notification Service produces, Main API consumes | Redis / BullMQ |
| Scanner commands | Main API produces, GitHub Scanner Service consumes | Redis / BullMQ |
| Scanner events | GitHub Scanner Service produces, Main API consumes | Redis / BullMQ |
| gRPC repository verification contract | Shared scanner contracts package and proto file | `proto/`, `packages/scanner-contracts` |
| Queue event contracts | Shared contracts packages | `packages/notification-contracts`, `packages/scanner-contracts` |

## 7. Layering

The codebase follows a pragmatic layered architecture. The current folder structure does not use one global `domain/application/infrastructure` tree for every service, but the dependency direction is still explicit.

### 7.1. Main API Layers

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Presentation | `src/routes`, `src/middleware`, `src/modules/*/*.controller.ts`, `src/modules/*/*.routes.ts`, `src/modules/*/*.schema.ts` | HTTP routing, validation, auth, request/response mapping. |
| Application | `src/modules/*/*.service.ts`, `src/modules/*/saga`, `src/modules/scanner/*handler.ts` | Use cases, Saga orchestration, event handling. |
| Domain | `src/modules/*/*.entity.ts`, `src/modules/github/*.port.ts`, `src/queue/**/*.port.ts`, `src/shared/errors.ts` | Business types, domain errors, and ports. |
| Infrastructure | `src/infrastructure`, `src/queue/**/*adapter.ts`, `src/queue/**/*.queue.ts`, `src/modules/**/*worker.ts`, repository implementations | Prisma, Redis, BullMQ, workers, gRPC/REST clients, Swagger, metrics. |
| Composition | `src/containers`, `src/index.ts` | Dependency wiring and process startup. |

Allowed dependency direction:

```mermaid
flowchart TD
    Composition --> Presentation
    Composition --> Application
    Composition --> Infrastructure
    Presentation --> Application
    Application --> Domain
    Application --> InfrastructurePorts[Domain ports]
    Infrastructure --> Domain
```

Main API rules:

- Controllers and routes may call application services.
- Application services may depend on domain entities and ports.
- Application services should not depend directly on Express, Prisma client construction, BullMQ queue construction, SMTP, or concrete gRPC setup.
- Infrastructure adapters may depend on domain ports and implement them.
- Composition code may import any layer because it wires dependencies together.

### 7.2. GitHub Scanner Service Layers

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Presentation | `services/github-scanner-service/src/routes`, `controllers`, `grpc` | REST/gRPC transport and request mapping. |
| Application | `services/github-scanner-service/src/app` | Repository verification, tracking, scanning use cases and ports. |
| Domain | `services/github-scanner-service/src/domain` | Scanner domain entities and errors. |
| Infrastructure | `github`, `cache`, `repositories`, `publishers`, `db`, `workers` | GitHub API client, Redis cache, Prisma repository, BullMQ publisher/consumer. |
| Composition | `app.ts`, `index.ts` | Service wiring and startup. |

Scanner rules:

- `app` services define use cases and depend on ports.
- `domain` must stay independent from Express, gRPC, Prisma, Redis, BullMQ, and Axios.
- Transport adapters convert HTTP/gRPC-specific errors to application/domain errors and back.
- Infrastructure implements ports and performs external I/O.

### 7.3. Notification Service Layers

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Application | `email-job.handler.ts`, `subscription-email.service.ts` | Email use cases and template selection. |
| Infrastructure | `email.service.ts`, `email.worker.ts`, `notification-result.publisher.ts`, `templates` | SMTP, BullMQ worker, BullMQ publisher, Handlebars templates. |
| Composition | `index.ts` | Worker startup and dependency wiring. |

Notification rules:

- Notification Service receives commands through shared contracts.
- It never imports Main API modules or writes to Main API database tables.
- It reports confirmation email outcomes only through `notification-result-queue`.

## 8. Shared Contracts

Shared contracts are isolated in workspace packages:

| Package | Purpose |
| --- | --- |
| `@github-notifier/notification-contracts` | Email job payloads, notification result event payloads, queue names. |
| `@github-notifier/scanner-contracts` | Scanner command/event payloads, queue names, generated gRPC TypeScript contracts. |
| `@github-notifier/shared` | Small shared utilities such as logger, environment helpers, and GitHub repository name parsing. |

The `.proto` file is the source of truth for gRPC repository verification:

```txt
proto/github/notifier/scanner/v1/repository_verification.proto
```

## 9. Architecture Test Targets

Architecture tests for this codebase verify that:

- Domain files do not import infrastructure frameworks such as Express, Prisma, BullMQ, Redis, Axios, Nodemailer, or gRPC.
- Main API use cases do not import Express transport code.
- Main API infrastructure does not import presentation files.
- GitHub Scanner Service application code does not import transport or adapter code.
- Notification Service does not import implementation code from the Main API or GitHub Scanner Service.
- GitHub Scanner Service implementation remains independent from the Main API and Notification Service implementation.
- Shared packages do not import application or service implementation code.

## 10. Related Documents

- [System Design](system-design.md)
- [ADR-001: Use PostgreSQL for Database](adr/0001-use-postgresql-for-database.md)
- [ADR-002: Use Redis for Job Queues](adr/0002-use-redis-for-job-queues.md)
- [ADR-004: Extract Notification Service](adr/0004-extract-notification-service.md)
- [ADR-005: Use BullMQ and Redis as Message Broker](adr/0005-use-bullmq-redis-as-message-broker.md)
- [ADR-006: Use Orchestrated Saga for Subscription Flow](adr/0006-use-orchestrated-saga-for-subscription-flow.md)
- [ADR-007: Use gRPC for Repository Verification](adr/0007-use-grpc-for-repository-verification.md)
