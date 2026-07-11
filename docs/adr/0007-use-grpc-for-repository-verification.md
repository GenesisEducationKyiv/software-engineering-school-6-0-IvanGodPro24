# ADR-007: Використання gRPC для перевірки репозиторіїв

**Статус:** Прийнято

**Дата:** 2026-06-26

**Автор:** Ivan Nepotachev

## Контекст

Після винесення GitHub Scanner Service в окремий сервіс Main API має синхронно перевіряти репозиторій під час `POST /api/subscribe`. Ця перевірка є частиною user-facing flow: якщо репозиторій не існує, приватний або GitHub тимчасово недоступний, Main API має повернути коректний HTTP статус клієнту до створення підписки.

Початково Main API міг звертатися до scanner service через REST endpoint. REST реалізація лишається корисною для health checks, ручної перевірки, Swagger/OpenAPI-сумісного HTTP контракту та fallback/debug сценаріїв. Але для service-to-service виклику між Main API і GitHub Scanner Service потрібен більш строгий контракт із типізованими request/response повідомленнями та явною моделлю RPC-помилок.

## Розглянуті варіанти

### 1. Залишити тільки REST

**Переваги:**

* Простий HTTP контракт.
* Легко тестувати через curl/Postman/Swagger.
* Не потрібна генерація додаткових клієнтів.

**Недоліки:**

* Overhead на парсинг: JSON є текстовим форматом, що вимагає більше ресурсів CPU на серіалізацію/десеріалізацію порівняно з бінарними форматами.
* Відсутність нативних Deadlines та Cancellations: Таймаути зазвичай реалізуються лише на стороні клієнта. Якщо клієнт відвалюється по таймауту, REST-сервер часто продовжує виконувати непотрібну роботу, бо скасування запиту не прокидається нативно.
* HTTP семантика замість RPC: HTTP статус-коди є занадто загальними для service-to-service взаємодії, що змушує будувати кастомні структури помилок у body.
* Еволюція контракту: Зміни в JSON-схемах важче контролювати на предмет зворотної сумісності.

### 2. Використати gRPC для Main API -> GitHub Scanner Service

**Переваги:**

* `.proto` файл є єдиним source of truth для RPC контракту.
* Buf генерує TypeScript contracts для client/server сторін.
* Main API отримує типізований client замість ручного HTTP adapter-а.
* gRPC статуси природно описують service-to-service помилки: `NOT_FOUND`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`.
* RPC виклик має deadline, тому Main API не чекає scanner service нескінченно.

**Недоліки:**

* Потрібні `proto`, Buf config, generated contracts і додаткові gRPC tests.
* Локальне та test Docker оточення має відкривати gRPC порт.
* Для ручної перевірки gRPC менш зручний, ніж REST.

## Прийняте рішення

Main API використовує **gRPC за замовчуванням** для синхронної перевірки репозиторію в GitHub Scanner Service.

REST implementation у GitHub Scanner Service **збережена**. Вона не є основним service-to-service шляхом для Main API, але лишається частиною сервісу для HTTP-сумісного доступу, health checks і ручної діагностики.

Source of truth для gRPC контракту:

```txt
proto/github/notifier/scanner/v1/repository_verification.proto
```

Buf використовується для lint/generation:

```txt
buf.yaml
buf.gen.yaml
```

Згенерований TypeScript contract потрапляє в package:

```txt
packages/scanner-contracts/src/generated
```

Main API залежить від `@github-notifier/scanner-contracts` і створює `RepositoryVerificationServiceClient`. GitHub Scanner Service реалізує generated `RepositoryVerificationServiceServer` через adapter `RepositoryVerificationGrpcService`.

## Error mapping

GitHub Scanner Service мапить domain errors у gRPC statuses:

| Domain error code    | gRPC status          |
| -------------------- | -------------------- |
| `INVALID_ARGUMENT`   | `INVALID_ARGUMENT`   |
| `NOT_FOUND`          | `NOT_FOUND`          |
| `PERMISSION_DENIED`  | `PERMISSION_DENIED`  |
| `RESOURCE_EXHAUSTED` | `RESOURCE_EXHAUSTED` |
| `UNAVAILABLE`        | `UNAVAILABLE`        |
| `INTERNAL`           | `INTERNAL`           |

Main API приймає gRPC `ServiceError` і перетворює його назад у HTTP error для зовнішнього клієнта:

| gRPC status          | HTTP status | Значення для клієнта                     |
| -------------------- | ----------- | ---------------------------------------- |
| `INVALID_ARGUMENT`   | `400`       | Некоректний repository input             |
| `PERMISSION_DENIED`  | `403`       | Репозиторій недоступний                  |
| `NOT_FOUND`          | `404`       | Репозиторій не знайдено                  |
| `RESOURCE_EXHAUSTED` | `429`       | GitHub rate limit                        |
| `DEADLINE_EXCEEDED`  | `504`       | Scanner service не відповів вчасно       |
| `UNAVAILABLE`        | `503`       | Scanner service недоступний              |
| `CANCELLED`          | `503`       | Scanner request не був завершений        |
| інші статуси         | `502`       | Неочікувана помилка upstream scanner-а   |

## Deadline

Main API задає deadline для кожного RPC виклику через `CallOptions.deadline`. Значення конфігурується через:

```txt
SCANNER_SERVICE_GRPC_TIMEOUT_MS
```

Це захищає subscription flow від зависання на недоступному або повільному scanner service.

## Наслідки

### Позитивні

* Service-to-service контракт став явним і типізованим.
* `.proto` є єдиним джерелом правди для gRPC API.
* Buf generation зменшує ризик розходження client/server типів.
* Main API отримує контрольований timeout/deadline для repository verification.
* gRPC integration test перевіряє реальний client/server roundtrip, serialization і передачу gRPC статусів.

### Негативні

* Збільшилась кількість build artifacts і кроків генерації.
* Docker Compose, E2E та CI мають конфігурувати gRPC порт разом із REST портом scanner service.
* REST і gRPC adapters мають підтримувати однакову логіку для repository verification.

### Обмеження

REST implementation збережена, але Main API зараз не має runtime перемикача між REST і gRPC verifier-ами. Якщо такий fallback знадобиться, то його можна додати явно через environment variable і покрити тестами.
