#!/bin/bash

set -e

trap 'echo "Deleting test containers..."; docker compose -f docker-compose.test.yml down -v --remove-orphans' EXIT

echo "Setting up the test containers for E2E..."
docker compose -f docker-compose.test.yml up -d

echo "Waiting for the database..."
for attempt in {1..30}; do
  if docker compose -f docker-compose.test.yml exec -T test_db pg_isready -U test_user -d test_db -h localhost -p 5432 > /dev/null 2>&1; then
    echo "Database is ready."
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "Database did not become ready in time." >&2
    docker compose -f docker-compose.test.yml logs test_db
    exit 1
  fi

  echo "Waiting for PostgreSQL... ($attempt/30)"
  sleep 1
done

export DATABASE_URL="postgresql://test_user:test_password@localhost:5434/test_db?schema=public"
export SMTP_HOST="localhost"
export SMTP_PORT="1025"

echo "Applying migrations..."
npx prisma migrate deploy

echo "Building notification contracts..."
npm run build:contracts

echo "Building the project..."
npm run build

echo "Running Playwright E2E tests..."
npx playwright test

echo "The E2E tests have been successfully completed!"
