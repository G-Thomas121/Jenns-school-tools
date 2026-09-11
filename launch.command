#!/bin/bash
cd "$(dirname "$0")"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  osascript -e 'display alert "Docker not running" message "Please open Docker Desktop and wait for it to start, then try again." buttons {"OK"} default button "OK"'
  open -a "Docker"
  exit 1
fi

# First run: create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  osascript -e 'display alert "Almost ready!" message "Please open the .env file in this folder and add your Anthropic API key, then double-click launch again." buttons {"OK"} default button "OK"'
  open -R .env
  exit 0
fi

echo "Starting MARTY..."
docker compose up -d

# Wait for frontend to be ready
echo "Waiting for services to start..."
for i in {1..20}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

open http://localhost:3000
echo "MARTY is running at http://localhost:3000"
