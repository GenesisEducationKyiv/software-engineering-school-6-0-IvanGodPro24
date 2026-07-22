#!/bin/bash

set -e

trap 'echo "Deleting test containers..."; docker compose -f docker-compose.test.yml down -v --remove-orphans' EXIT

echo "Starting the test containers (DB and Redis)..."
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
export REDIS_URL="redis://localhost:6380"
export API_KEY="super-secret-key"

echo "Deploying migrations to the test db..."
npm run db:migrate

echo "Running the integration tests..."
npm run test:integration:run

echo "Integration tests have been successfully completed!"
