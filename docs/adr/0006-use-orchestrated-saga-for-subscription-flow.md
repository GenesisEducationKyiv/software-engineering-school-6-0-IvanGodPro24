# ADR-006: Використання оркестрованої Saga для процесу підписки

**Статус:** Прийнято

**Дата:** 2026-06-21

**Автор:** Ivan Nepotachev

## Контекст

Після винесення email-відправлення в окремий Notification Service процес створення підписки став розподіленим між двома компонентами:

1. Main API створює або оновлює `Repository` та `Subscription` у PostgreSQL.
2. Main API публікує job-команду на відправлення confirmation email у BullMQ.
3. Notification Service обробляє команду та передає email SMTP-провайдеру.

Ці операції не можуть бути об'єднані в одну звичайну транзакцію PostgreSQL, тому що Redis, BullMQ та SMTP не беруть участі в транзакції бази даних.

Без додаткової координації могла виникнути неконсистентність:

```txt
Subscription створена як PENDING
  -> email command успішно додана в queue
  -> Notification Service не зміг відправити email
  -> користувач не може підтвердити підписку
  -> у базі залишається недоступна PENDING subscription
```

Також потрібно було розрізняти:

* тимчасову SMTP-помилку, після якої BullMQ ще виконає retry;
* остаточну помилку після всіх спроб;
* успішне відправлення email;
* помилку публікації результату після того, як email уже був відправлений.

## Розглянуті варіанти

### 1. Залишити eventual consistency без Saga

Main API створює subscription і додає email job, але не отримує результат від Notification Service.

**Переваги:**

* Найпростіша реалізація.
* Мінімальна кількість компонентів.

**Недоліки:**

* Main API не знає, чи був confirmation email відправлений.
* Неможливо автоматично компенсувати невдалий процес.
* У базі можуть залишатися PENDING subscriptions, які користувач не може підтвердити.
* Відсутній явний lifecycle розподіленої операції.

### 2. Two-Phase Commit

Спроба використати розподілену транзакцію між PostgreSQL, Redis та Notification Service.

**Переваги:**

* Сильніші гарантії консистентності.

**Недоліки:**

* Redis/BullMQ та SMTP не підтримують спільну транзакцію з PostgreSQL.
* Значна складність реалізації.
* Невиправданий operational overhead для поточного сценарію.

### 3. Choreography Saga

Кожен сервіс самостійно реагує на події та публікує наступні події без центрального orchestrator-а.

**Переваги:**

* Слабше зв'язування сервісів.
* Добре масштабується для великої event-driven системи.

**Недоліки:**

* Для поточного невеликого flow складніше зрозуміти загальну послідовність.
* Бізнес-процес розподіляється між багатьма event handlers.
* Складніше відстежувати поточний стан і виконувати компенсацію.

### 4. Orchestrated Saga

Main API зберігає стан Saga, публікує команду та обробляє результат Notification Service.

**Переваги:**

* Один компонент контролює весь subscription flow.
* Saga lifecycle зберігається в PostgreSQL.
* Явні success і failure transitions.
* Централізована compensation logic.
* Простіше тестувати та спостерігати flow.

**Недоліки:**

* Main API бере на себе роль orchestrator-а.
* Потрібні додаткова таблиця, result queue, worker і contracts.
* Система працює з eventual consistency.

## Прийняте рішення

Обрано **оркестровану Saga**, де Main API виконує роль Saga Orchestrator.

Для збереження стану процесу використовується модель `SubscriptionSaga`.

Основні статуси:

| Статус                 | Значення                                     |
| ---------------------- | -------------------------------------------- |
| `STARTED`              | Saga створена                                |
| `SUBSCRIPTION_CREATED` | Repository та Subscription підготовлені      |
| `EMAIL_SEND_REQUESTED` | Відправлення confirmation email запитано     |
| `COMPLETED`            | SMTP-провайдер прийняв confirmation email    |
| `COMPENSATING`         | Почалося відновлення попереднього стану      |
| `COMPENSATED`          | Компенсацію завершено                        |

Основний flow:

```txt
Client
  -> POST /api/subscribe

Main API
  -> validates repository
  -> creates SubscriptionSaga
  -> creates or updates Subscription as PENDING
  -> publishes confirm-subscription to email-queue
  -> returns 202 Accepted

Notification Service
  -> consumes confirm-subscription
  -> передає confirmation email SMTP-провайдеру
  -> publishes result event to notification-result-queue

Main API Notification Result Worker
  -> confirmation-email-sent
       -> marks Saga as COMPLETED

  -> confirmation-email-failed
       -> runs compensation
       -> marks Saga as COMPENSATED
```

Для нового subscription compensation:

```txt
createdSubscription = true
  -> delete PENDING Subscription
  -> delete newly created Repository if it has no subscriptions
```

Для повторної підписки:

```txt
createdSubscription = false
  -> restore Subscription status from PENDING to UNSUBSCRIBED
```

Після фінальної невдалої BullMQ-спроби Notification Service намагається опублікувати `confirmation-email-failed`. За успішної доставки цього result event Main API запускає компенсацію. Тимчасова SMTP-помилка не запускає компенсацію, поки залишаються retries.

Для зменшення ризику повторного confirmation email використовується BullMQ progress checkpoint:

```txt
email sent successfully
  -> job progress = email-sent
  -> publish confirmation-email-sent
```

Якщо email був відправлений, але result event тимчасово не вдалося опублікувати, retry пропускає повторну SMTP-відправку та повторює тільки result publishing.

Result jobs отримують детермінований `jobId`:

```txt
${event.type}-${event.sagaId}
```

Це зменшує ризик створення дублікатів однакових result events.

## Наслідки

### Позитивні

* Стан розподіленого процесу явно зберігається в PostgreSQL.
* Main API знає результат роботи Notification Service.
* Невдала остаточна відправка confirmation email запускає компенсацію після доставки result event.
* Тимчасові SMTP-помилки обробляються BullMQ retries.
* Повторна обробка result publishing не повинна повторно надсилати email.
* Success і failure paths можна спостерігати через Prisma Studio, application logs і Bull Board.
* Компенсаційна логіка знаходиться в окремому сервісі.

### Негативні

* З'явилися додаткова Prisma-модель, друга BullMQ-черга та result worker.
* Система має більше станів і failure scenarios.
* Потрібна ідемпотентна обробка повторних подій.
* Дані стають консистентними не миттєво, а після завершення асинхронного flow.

### Обмеження

Поточна реалізація не використовує transactional outbox. Після коміту PostgreSQL Main API окремо оновлює Saga та додає email job у BullMQ. Якщо процес аварійно завершиться між цими операціями, Saga може залишитися в `EMAIL_SEND_REQUESTED`, а email job не потрапить у чергу.

```txt
PostgreSQL transaction committed
  -> process аварійно завершився до додавання в чергу
  -> PENDING Subscription і Saga залишилися в БД
  -> email job відсутній у черзі
```

Аналогічно, після фінальної SMTP-помилки `confirmation-email-failed` може не потрапити до result queue, якщо публікація події неуспішна на останній спробі. У такому випадку автоматична компенсація не запускається.

Між успішною SMTP-відправкою та збереженням `email-sent` progress залишається невелике failure window:

```txt
SMTP успішно відправив email
  -> process аварійно завершився
  -> progress ще не був збережений
  -> retry потенційно може повторити email
```

Повністю усунути цей сценарій можна за допомогою:

* idempotency key, який підтримує email provider;
* persistent email delivery record;
* transactional outbox;

Для production-рівня надійності ці failure windows потребують transactional outbox з окремим dispatcher-ом або процесу відновлення Saga, що зависли у проміжних станах. Для поточного проекту BullMQ progress checkpoint та детерміновані result job IDs є компромісом між надійністю та складністю.
