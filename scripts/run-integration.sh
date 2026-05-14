#!/bin/bash

set -e

echo "Starting the test containers (DB and Redis)..."
docker compose -f docker-compose.test.yml up -d

echo "Waiting..."
sleep 3

export DATABASE_URL="postgresql://test_user:test_password@localhost:5434/test_db?schema=public"
export REDIS_URL="redis://localhost:6380"
export API_KEY="super-secret-key"

echo "Deploying migrations to the test db..."
npx prisma migrate deploy

echo "Running the integration tests..."
npm run test:integration:run

echo "Deleting test containers..."
docker compose -f docker-compose.test.yml down -v --remove-orphans

echo "Integration tests have been successfully completed!"
