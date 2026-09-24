#!/usr/bin/env bash
# Despliegue seguro de MC Inventory.
#
# Actualizacion habitual:
#   git pull --ff-only
#   ./scripts/deploy.sh
#
# Tambien se puede hacer en un solo paso:
#   ./scripts/deploy.sh --pull
#
# El script solo reconstruye y recrea el servicio app. Nunca ejecuta
# `docker compose down`, `docker volume rm` ni `docker compose rm -v`.

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mc-inventory}"
POSTGRES_DATA_DIR="/libre/devops/apps/database/data"
APP_IMAGE="${APP_IMAGE:-$(sed -n 's/^APP_IMAGE=//p' "$ROOT_DIR/.env" 2>/dev/null | head -n 1)}"
APP_IMAGE="${APP_IMAGE:-mc-inventory-app}"
COMPOSE=(
  docker compose
  --project-name "$PROJECT_NAME"
  --project-directory "$ROOT_DIR"
  --file "$ROOT_DIR/docker-compose.yml"
  --file "$ROOT_DIR/docker-compose.prod.yml"
)

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "No se encontro el comando requerido: $1"
}

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ROOT_DIR/.env" | head -n 1
}

canonical_path() {
  readlink -f -- "$1" 2>/dev/null || printf '%s' "$1"
}

validate_host_path() {
  local allow_empty="${1:-false}"

  [[ -d "$POSTGRES_DATA_DIR" ]] || \
    fail "No existe el directorio persistente de PostgreSQL: $POSTGRES_DATA_DIR"
  chmod 700 "$POSTGRES_DATA_DIR" 2>/dev/null || true

  if [[ ! -f "$POSTGRES_DATA_DIR/PG_VERSION" ]]; then
    if [[ "$allow_empty" == "true" ]]; then
      log "AVISO: el directorio de datos esta vacio; PostgreSQL lo inicializara en el primer arranque."
    else
      fail "El directorio no contiene PG_VERSION. No se desplegara sobre una base posiblemente vacia; valida el backup primero."
    fi
  fi
}

postgres_container_id() {
  "${COMPOSE[@]}" ps -q postgres 2>/dev/null | head -n 1
}

validate_running_postgres() {
  local container_id state health actual_source expected_source version user db

  container_id="$(postgres_container_id)"
  [[ -n "$container_id" ]] || \
    fail "PostgreSQL no esta corriendo. Iniciala una vez con: ./scripts/deploy.sh --initial"
  POSTGRES_CONTAINER_ID="$container_id"

  state="$(docker inspect -f '{{.State.Status}}' "$container_id")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  [[ "$state" == "running" ]] || fail "El contenedor PostgreSQL esta en estado: $state"
  [[ "$health" == "healthy" ]] || fail "El healthcheck de PostgreSQL esta en estado: $health"

  actual_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' "$container_id")"
  expected_source="$(canonical_path "$POSTGRES_DATA_DIR")"
  [[ -n "$actual_source" ]] || fail "No se encontro el bind mount de PostgreSQL"
  [[ "$(canonical_path "$actual_source")" == "$expected_source" ]] || \
    fail "PostgreSQL usa '$actual_source' y se esperaba '$expected_source'"

  version="$(docker exec "$container_id" cat /var/lib/postgresql/data/PG_VERSION | tr -d '\r\n')"
  [[ "$version" == "16" ]] || fail "La version de PostgreSQL en el volumen es $version; se requiere 16"

  user="$(read_env_value POSTGRES_USER)"
  db="$(read_env_value POSTGRES_DB)"
  [[ -n "$user" && -n "$db" ]] || fail "POSTGRES_USER y POSTGRES_DB deben existir en .env"
  docker exec "$container_id" pg_isready -U "$user" -d "$db" >/dev/null 2>&1 || \
    fail "PostgreSQL no acepta conexiones con las credenciales de .env"

  log "PostgreSQL validado: $actual_source (PG$version, healthy)"
}

build_app() {
  log "Construyendo la imagen de la aplicacion: $APP_IMAGE"
  # Se usa docker build directamente porque algunas instalaciones tienen
  # Compose v5 con un buildx antiguo; el resultado se carga en el registro local
  # y luego Compose lo consume con --no-build.
  docker build --pull -t "$APP_IMAGE" "$ROOT_DIR"
}

create_database_backup() {
  local backup_dir backup_file
  backup_dir="${BACKUP_DIR:-/libre/devops/backups}"

  mkdir -p "$backup_dir" || fail "No se pudo crear el directorio de backups: $backup_dir"
  chmod 700 "$backup_dir" 2>/dev/null || true
  backup_file="$(mktemp -p "$backup_dir" mc-inventory-pre-deploy-XXXXXX.dump)" || \
    fail "No se pudo crear un archivo temporal para el backup"

  if ! "${COMPOSE[@]}" exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"; then
    rm -f "$backup_file"
    fail "Fallo el backup de PostgreSQL; no se actualizo la app"
  fi
  [[ -s "$backup_file" ]] || {
    rm -f "$backup_file"
    fail "El backup de PostgreSQL quedo vacio; no se actualizo la app"
  }
  chmod 600 "$backup_file" 2>/dev/null || true
  log "Backup creado antes del deploy: $backup_file"
}

wait_for_app() {
  local port health_body attempt app_id app_health

  port="$("${COMPOSE[@]}" port app 3000 2>/dev/null | tail -n 1 | awk -F: '{print $NF}')"
  [[ "$port" =~ ^[0-9]+$ ]] || port=3000
  log "Esperando healthcheck HTTP en 127.0.0.1:$port/api/health"

  for attempt in $(seq 1 90); do
    health_body="$(curl -fsS --max-time 3 "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
    app_id="$("${COMPOSE[@]}" ps -q app 2>/dev/null | head -n 1)"
    app_health="none"
    if [[ -n "$app_id" ]]; then
      app_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$app_id" 2>/dev/null || true)"
    fi
    if printf '%s' "$health_body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' && [[ "$app_health" == "healthy" ]]; then
      log "La aplicacion responde correctamente y esta healthy: $health_body"
      return 0
    fi
    sleep 1
  done

  printf '%s\n' "Ultimos logs de app:" >&2
  "${COMPOSE[@]}" logs --tail 200 app >&2 || true
  fail "La aplicacion no respondio /api/health o no quedo healthy dentro del tiempo esperado"
}

mode="update"
if [[ "${1:-}" == "--pull" ]]; then
  log "Actualizando el codigo con git pull --ff-only"
  git -C "$ROOT_DIR" pull --ff-only
  shift
fi
case "${1:-}" in
  --check) mode="check" ;;
  --initial) mode="initial" ;;
  "") ;;
  *) fail "Uso: $0 [--pull] [--check|--initial]" ;;
esac

require_command docker
require_command curl
[[ -f "$ROOT_DIR/.env" ]] || fail "Falta .env en $ROOT_DIR"
[[ -f "$ROOT_DIR/.env.master.key" ]] || fail "Falta .env.master.key en $ROOT_DIR"
for secret_file in "$ROOT_DIR/.env" "$ROOT_DIR/.env.master.key"; do
  chmod 600 "$secret_file" || fail "No se pudo proteger $(basename "$secret_file") con permisos 600"
done
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  chmod 600 "$ROOT_DIR/.env.local" || fail "No se pudo proteger .env.local con permisos 600"
fi
if grep -q '^LOCAL_ADMIN_PASSWORD=' "$ROOT_DIR/.env"; then
  log "AVISO: .env contiene LOCAL_ADMIN_PASSWORD; migrarlo a LOCAL_ADMIN_PASSWORD_HASH y rotar la credencial."
fi
nextauth_secret="$(read_env_value NEXTAUTH_SECRET)"
postgres_password="$(read_env_value POSTGRES_PASSWORD)"
if [[ ${#nextauth_secret} -lt 32 || "$nextauth_secret" != ENC:v1:* ]]; then
  log "AVISO: NEXTAUTH_SECRET debe ser un secreto cifrado y de al menos 32 caracteres."
fi
if [[ ${#postgres_password} -lt 24 ]]; then
  log "AVISO: POSTGRES_PASSWORD debe tener al menos 24 caracteres."
fi
"${COMPOSE[@]}" config --quiet

postgres_id_before=""
case "$mode" in
  check)
    validate_host_path false
    validate_running_postgres
    "${COMPOSE[@]}" ps
    exit 0
    ;;
  initial)
    validate_host_path true
    build_app
    log "Arrancando PostgreSQL y la aplicacion por primera vez"
    "${COMPOSE[@]}" up -d --no-build
    ;;
  update)
    validate_host_path false
    validate_running_postgres
    postgres_id_before="$POSTGRES_CONTAINER_ID"
    create_database_backup
    build_app
    log "Recreando solo el contenedor app; PostgreSQL no se toca"
    "${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate app
    ;;
esac

wait_for_app
validate_running_postgres
if [[ -n "$postgres_id_before" && "$POSTGRES_CONTAINER_ID" != "$postgres_id_before" ]]; then
  fail "El contenedor PostgreSQL cambio de ID durante el deploy; revisar inmediatamente"
fi
"${COMPOSE[@]}" ps
log "Despliegue completado. Datos PostgreSQL preservados en $POSTGRES_DATA_DIR"
