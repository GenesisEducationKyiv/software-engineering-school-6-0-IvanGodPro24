-- CreateTable
CREATE TABLE "TrackedRepository" (
    "id" TEXT NOT NULL,
    "sourceRepositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastSeenTag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedRepository_sourceRepositoryId_key" ON "TrackedRepository"("sourceRepositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedRepository_name_key" ON "TrackedRepository"("name");

-- CreateIndex
CREATE INDEX "TrackedRepository_active_idx" ON "TrackedRepository"("active");
