-- CreateEnum
CREATE TYPE "SubscriptionSagaStatus" AS ENUM ('STARTED', 'SUBSCRIPTION_CREATED', 'EMAIL_SEND_REQUESTED', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED');

-- CreateTable
CREATE TABLE "SubscriptionSaga" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "repositoryId" TEXT,
    "subscriptionId" TEXT,
    "createdRepository" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubscriptionSagaStatus" NOT NULL DEFAULT 'STARTED',
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionSaga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionSaga_status_idx" ON "SubscriptionSaga"("status");

-- CreateIndex
CREATE INDEX "SubscriptionSaga_subscriptionId_idx" ON "SubscriptionSaga"("subscriptionId");
