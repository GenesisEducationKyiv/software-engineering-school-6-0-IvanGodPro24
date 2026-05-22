#!/bin/bash

set -e

trap 'echo "Deleting test containers..."; docker compose -f docker-compose.test.yml down -v --remove-orphans' EXIT

echo "Setting up the test containers for E2E..."
docker compose -f docker-compose.test.yml up -d

echo "Waiting for the database..."
sleep 3

export DATABASE_URL="postgresql://test_user:test_password@localhost:5434/test_db?schema=public"
export SMTP_HOST="localhost"
export SMTP_PORT="1025"

echo "Applying migrations..."
npx prisma migrate deploy

echo "Building the project"
npm run build

echo "Running Playwright E2E tests..."
npx playwright test

echo "The E2E tests have been successfully completed!"
