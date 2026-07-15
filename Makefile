.PHONY: help init up down restart build build-no-cache logs logs-backend logs-nginx status clean ssl-generate

COMPOSE = docker compose
ENV_FILE = .env

help:
	@echo "Цели: init up down restart build logs status …"
	@echo "Подробности: SERVER_DEPLOYMENT.md (SSL, DATABASE_URL)."

init:
	@test -f $(ENV_FILE) || cp .env.example $(ENV_FILE)
	@mkdir -p ssl backups
	@echo "OK: .env (если не было) и каталоги ssl/, backups/"

up:
	$(COMPOSE) --env-file $(ENV_FILE) up -d

down:
	$(COMPOSE) --env-file $(ENV_FILE) down

restart: down up

build:
	$(COMPOSE) --env-file $(ENV_FILE) build

build-no-cache:
	$(COMPOSE) --env-file $(ENV_FILE) build --no-cache

logs:
	$(COMPOSE) --env-file $(ENV_FILE) logs -f --tail=100

logs-backend:
	$(COMPOSE) --env-file $(ENV_FILE) logs -f --tail=100 backend

logs-nginx:
	$(COMPOSE) --env-file $(ENV_FILE) logs -f --tail=100 nginx

status:
	$(COMPOSE) --env-file $(ENV_FILE) ps

clean:
	$(COMPOSE) --env-file $(ENV_FILE) down --remove-orphans

ssl-generate:
	@mkdir -p ssl
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout ssl/key.pem -out ssl/cert.pem -subj "/CN=localhost"
	@echo "OK: самоподписанный сертификат в ssl/"
