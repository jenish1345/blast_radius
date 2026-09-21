.PHONY: help install env probe smoke models run record demo docker deploy clean

help:
	@echo "Blast Radius — build in this order"
	@echo ""
	@echo "  make install   1. create venv, install deps"
	@echo "  make env       2. copy .env.example -> .env (then fill in your keys)"
	@echo "  make probe     3. print the real ConTree SDK surface"
	@echo "  make models    4. list the model IDs your account can call"
	@echo "  make smoke     5. THE GATE — prove fork + diff works. Do not proceed until this passes."
	@echo "  make run       6. start the operator console on http://localhost:8000"
	@echo "  make record    7. record real runs so the demo never depends on live inference"
	@echo "  make demo      8. reproduce the headline result from a recorded trace"
	@echo "  make docker    build the container image"
	@echo "  make deploy    print the Nebius AI Cloud deployment steps"

install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "\nActivate with:  source .venv/bin/activate"

env:
	@test -f .env || cp .env.example .env
	@echo ".env is ready. Open it and paste your NEBIUS_API_KEY."

probe:
	python probe_sdk.py

models:
	python -c "from core.llm import list_models; [print(m) for m in list_models()]"

smoke:
	python scripts/smoke.py

run:
	uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

record:
	python scripts/record.py --all

demo:
	python scripts/record.py drift

docker:
	docker build -t blast-radius:latest .

deploy:
	@cat DEPLOY.md

clean:
	rm -f blastradius.db blastradius.db-wal blastradius.db-shm
	find . -name __pycache__ -type d -exec rm -rf {} +

.PHONY: test
test:
	python tests/test_risk.py
