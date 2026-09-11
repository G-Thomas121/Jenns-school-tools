.PHONY: up down build logs update test seed check-python

# ── Docker (primary) ──────────────────────────────────────────────────────────
up:
	docker compose up -d
	@sleep 2 && open http://localhost:3000 || true
	@echo "MARTY is running at http://localhost:3000"

down:
	docker compose down

build:
	docker compose up -d --build
	@sleep 3 && open http://localhost:3000 || true

logs:
	docker compose logs -f

update:
	git pull
	docker compose up -d --build
	@echo "Updated!"

# ── Local dev (no Docker) ─────────────────────────────────────────────────────
PYTHON := $(shell brew --prefix python 2>/dev/null)/bin/python3
VENV   := .venv
PIP    := $(VENV)/bin/pip
UV     := $(VENV)/bin/uvicorn

check-python:
	@which $(PYTHON) > /dev/null 2>&1 || \
		(echo "Error: Python 3 not found." && exit 1)

setup: check-python
	@echo "Setting up local dev environment..."
	@$(PYTHON) -m venv $(VENV)
	@$(PIP) install --upgrade pip -q
	@$(PIP) install -r requirements.txt -q
	@mkdir -p curriculum outputs data submissions/inbox submissions/processed
	@[ -f .env ] || cp .env.example .env
	@$(VENV)/bin/python -m app.database
	@echo "Done! Run 'make run' to start backend only."

run:
	@$(UV) app.main:app --reload --port 8000

test:
	@$(VENV)/bin/pytest tests/ -v

seed:
	@$(VENV)/bin/python seed.py
