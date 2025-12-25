### Требования

- Установленный **Docker** (Desktop или engine)
- Поддержка **Docker Compose** (`docker compose` новая команда)

---

### 1. Клонирование и переход в каталог

```bash
git clone <repo-url> advanced-file-manager
cd advanced-file-manager
```

---

### 2. Подготовка `.env`

Скопируйте пример и отредактируйте под свои нужды:

```bash
cp env.example .env
```

Ключевые переменные:

- **`POSTGRES_USER`**, **`POSTGRES_PASSWORD`**, **`POSTGRES_DB`**  
  Должны совпадать с тем, что вы хотите видеть в БД (используются и API, и контейнером `db`).

- **`POSTGRES_PORT`**  
  Хост‑порт, на который будет проброшен Postgres.  
  По умолчанию в `docker-compose.yml` стоит:

  ```yaml
  ports:
    - "${POSTGRES_PORT:-5435}:5432"
  ```

  Рекомендуется **оставить 5435**, чтобы не конфликтовать с локальным Postgres на 5432.

- **`JWT_SECRET`**, **`COOKIE_SECRET`**  
  Задайте достаточно длинные и случайные значения.

- **`STORAGE_DIR`**  
  Путь на хосте, куда будут складываться загруженные файлы.  
  По умолчанию `./storage` — он уже примонтирован в сервис `api`:

  ```yaml
  volumes:
    - ./storage:/storage
  ```

---

### 3. Сборка Docker-образов

Из корня репозитория:

```bash
docker compose build
```

Это соберёт:

- образ `afm_api` (Node.js + Fastify, backend)
- образ `afm_web` (статический frontend под управлением `nginx`)
- подтянет образ `postgres:16` для сервиса `db`

---

### 4. Запуск сервисов

Поднять всё сразу (Postgres + API + Web):

```bash
docker compose up -d
```

Либо явно указать сервисы:

```bash
docker compose up -d db api web
```

Проверить статус:

```bash
docker compose ps
```

---

### 5. Миграции базы данных

После первого запуска (и при изменении схемы) нужно применить миграции **внутри docker-сети**:

```bash
docker compose run --rm api node apps/api/scripts/migrate.js status  # посмотреть, что PENDING
docker compose run --rm api node apps/api/scripts/migrate.js up      # применить миграции
```

Миграции лежат в `apps/api/db/migrations` и применяются по имени файла **в алфавитном порядке**.

---

### 6. Открытие UI и проверка API

- **Web UI**: `http://localhost:8080`
- **Health‑чек API**:

```bash
curl -i http://localhost:3000/api/health
```

Ожидается `HTTP 200` и JSON вида `{"ok":true,"db":"up", ...}`.

Дальше:

- откройте `http://localhost:8080` в браузере
- зарегистрируйтесь
- загрузите файлы в “Библиотеке”

---

### 7. Работа с БД через psql

Чтобы зайти в Postgres внутри контейнера:

```bash
docker compose exec db psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-advanced_file_manager}
```

Посмотреть структуру таблицы `users`, например:

```sql
\d users;
```

---

### 8. Остановка и очистка

- **Остановить контейнеры, не трогая данные БД**:

```bash
docker compose down
```

- **Полностью удалить контейнеры и volume с данными Postgres**:

```bash
docker compose down -v
```

---

### 9. Обновление приложения

При обновлении кода/зависимостей:

```bash
git pull
docker compose build
docker compose up -d
docker compose run --rm api node apps/api/scripts/migrate.js up
```

---

### 10. Типичные проблемы

- **Порт 5432 уже занят**

На хосте уже запущен локальный Postgres или другой контейнер.

Решения:

1. Использовать другой хост‑порт через `POSTGRES_PORT` (рекомендуется 5435, уже заложено по умолчанию).
2. Либо остановить локальный Postgres:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
# посмотреть, кто держит
```

- **Миграции не применились / нет колонки `password_hash`**

Убедитесь, что вы запускали миграции **через Docker**:

```bash
docker compose run --rm api node apps/api/scripts/migrate.js up
```

Затем можно проверить структуру:

```bash
docker compose exec db psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-advanced_file_manager} -c '\d users'
```

- **Web открывается, но API отвечает 500 или 401 при регистрации/логине**

Чаще всего:

- не применены миграции (см. выше),
- либо в `.env` некорректные `POSTGRES_*` / `DATABASE_URL`.

Перезапустите контейнеры после правок `.env`:

```bash
docker compose down
docker compose up -d
```
