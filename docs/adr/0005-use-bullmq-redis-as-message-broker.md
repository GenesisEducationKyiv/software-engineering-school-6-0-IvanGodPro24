# ADR-005: Використання Redis + BullMQ як брокера повідомлень

**Статус:** Прийнято

**Дата:** 2026-06-10

**Автор:** Ivan Nepotachev

## Контекст

Після винесення домену сповіщень в окремий Notification Service основному API потрібен асинхронний спосіб передавати задачі на відправку email. Відправка листів не повинна блокувати HTTP-запити, залежати від доступності SMTP у момент запиту або зникати при короткочасних помилках мережі.

У системі вже використовується Redis для кешування відповідей GitHub API та BullMQ-черга `email-queue`, в яку Main API публікує email jobs, а Notification Service споживає їх окремим worker-процесом.

```txt
Main API
  └─ publishes command/event to BullMQ queue
        └─ Redis stores queue jobs
              └─ Notification Service consumes job
                    └─ sends email via SMTP
```

У цій архітектурі компоненти мають такі ролі:

| Частина | Роль |
| --- | --- |
| Main API | Publisher / Producer |
| Redis | Message broker storage/transport для BullMQ |
| BullMQ Queue | Абстракція черги повідомлень |
| Notification Service | Consumer / Worker |
| `EmailJobData` | Контракт між сервісами |
| `attempts`, `backoff` | Retry policy для невдалих задач |

Redis у цьому проєкті має дві ролі:

```txt
Redis
├─ Cache for GitHub API responses
└─ BullMQ storage for email queue
```

## Розглянуті варіанти

1. **Redis + BullMQ**

   * **Плюси:** Уже вписується в поточну Node.js архітектуру, використовує наявний Redis, дає retry/backoff, concurrency, delayed jobs, bulk додавання задач і можливість спостерігати за чергою через Bull Board.
   * **Мінуси:** Це lightweight message queue / job queue поверх Redis, а не повноцінний broker рівня RabbitMQ або event streaming platform рівня Kafka.

2. **RabbitMQ**

   * **Плюси:** Дуже добре підходить для work queues, commands/tasks, acknowledgements, durable queues і складнішої маршрутизації через exchanges.
   * **Мінуси:** Для поточної задачі не дає суттєвої практичної переваги над BullMQ, але додає окремий інфраструктурний сервіс, нові бібліотеки, нову модель конфігурації та більший operational overhead.

3. **Kafka**

   * **Плюси:** Підходить для event streaming, audit log, replay подій, аналітики, data pipelines, stream processing і високого throughput.
   * **Мінуси:** Для email notification це overengineering. Системі не потрібні довготривала історія подій, partitioning, consumer groups для великих потоків або складна stream-processing модель.

4. **Redis Pub/Sub**

   * **Плюси:** Найпростіший і швидкий publish/subscribe механізм для real-time повідомлень, коли допустима втрата окремих подій.
   * **Мінуси:** Redis Pub/Sub має at-most-once delivery semantics. Якщо Notification Service був офлайн або впав під час обробки повідомлення, email-задача може бути втрачена. Для email-сповіщень це неприйнятно, бо користувач може не отримати лист підтвердження або повідомлення про реліз.

## Прийняте рішення

Обрано **Redis + BullMQ** як message queue / lightweight message broker для асинхронної комунікації між Main API та Notification Service.

Main API створює задачі в черзі `email-queue`. Redis зберігає стан задач, а Notification Service запускає BullMQ worker, який споживає задачі та відправляє email через SMTP.

Поточний контракт задачі визначається типом `EmailJobData` з package `@github-notifier/notification-contracts` і підтримує два типи email:

* `confirm-subscription` — лист підтвердження підписки.
* `new-release` — лист про новий реліз.

Для невдалих задач використовується retry policy:

* `attempts: 3` — до трьох спроб виконання задачі.
* `backoff: { type: 'exponential', delay: 5000 }` — exponential backoff з базовою затримкою 5 секунд.

Notification Service обробляє чергу з `concurrency: 5`, тобто може паралельно виконувати кілька email-задач без блокування основного API.

## Наслідки

**Позитивні:**

* Основний API не залежить від швидкості або тимчасової недоступності SMTP-провайдера.
* HTTP-запити можуть завершуватися швидко, бо важка робота відправки email делегується worker-сервісу.
* Email-задачі не губляться так легко, як у Redis Pub/Sub, і можуть бути повторені при тимчасових помилках.
* BullMQ дає готові механізми retries, exponential backoff, concurrency, delayed jobs і bulk додавання задач.
* Notification Service можна масштабувати окремо від Main API, додаючи більше worker-процесів або змінюючи concurrency.
* Redis уже присутній у системі, тому не потрібно додавати RabbitMQ або Kafka лише для поточного сценарію email notifications.
* Межа між сервісами стає явною: Main API тільки публікує задачу, Notification Service тільки обробляє її.

**Негативні:**

* Redis тепер використовується і як cache, і як storage/transport для BullMQ, тому його відмова впливає одразу на кешування та email-чергу.
* Потрібно підтримувати versioning і build package `@github-notifier/notification-contracts`, щоб Main API та Notification Service використовували сумісний контракт `EmailJobData`.
* Для production-рівня потрібно окремо продумати persistence Redis, моніторинг черги, alerting для failed jobs.

**Обмеження:**

* Поточному сценарію email notifications не потрібні складний routing, exchanges, event history, replay або analytics pipelines.
* Якщо в майбутньому система потребуватиме складної міжсервісної маршрутизації, варто окремо переглянути RabbitMQ.
* Якщо з'явиться потреба в event streaming, довготривалій історії подій, replay або analytics pipelines, варто окремо переглянути Kafka.
