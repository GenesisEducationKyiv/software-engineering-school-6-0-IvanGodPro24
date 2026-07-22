UPDATE "SubscriptionSaga"
SET
    "status" = 'COMPENSATING',
    "currentStep" = 'COMPENSATING'
WHERE "status" = 'FAILED';

CREATE TYPE "SubscriptionSagaStatus_new" AS ENUM (
    'STARTED',
    'SUBSCRIPTION_CREATED',
    'EMAIL_SEND_REQUESTED',
    'COMPLETED',
    'COMPENSATING',
    'COMPENSATED'
);

ALTER TABLE "SubscriptionSaga"
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE "SubscriptionSagaStatus_new"
        USING ("status"::text::"SubscriptionSagaStatus_new"),
    ALTER COLUMN "status" SET DEFAULT 'STARTED';

DROP TYPE "SubscriptionSagaStatus";
ALTER TYPE "SubscriptionSagaStatus_new" RENAME TO "SubscriptionSagaStatus";
