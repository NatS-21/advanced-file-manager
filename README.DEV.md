# Development Mode с Hot Reload

Этот проект настроен для работы в режиме разработки с автоматической перезагрузкой при изменении кода.

## Быстрый старт

### Запуск в режиме разработки

```bash
# Запустить все сервисы (БД, API, Web) с hot reload
docker-compose -f docker-compose.dev.yml up --build

# Или в фоновом режиме
docker-compose -f docker-compose.dev.yml up -d --build
```

### Остановка

```bash
docker-compose -f docker-compose.dev.yml down
```

## Порты

- **Frontend (Vite)**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5435

## Как это работает

### Backend (API)
- Использует `tsx --watch` для автоматической перезагрузки при изменении TypeScript файлов
- Исходный код монтируется через Docker volumes
- Изменения в `apps/api/` и `packages/shared/` автоматически применяются

### Frontend (Web)
- Использует Vite dev server с hot module replacement (HMR)
- Исходный код монтируется через Docker volumes
- Изменения в `apps/web/` автоматически применяются без перезагрузки страницы

## Структура файлов

- `docker-compose.dev.yml` - конфигурация для development режима
- `apps/api/Dockerfile.dev` - Dockerfile для API в dev режиме
- `apps/web/Dockerfile.dev` - Dockerfile для Web в dev режиме

## Переменные окружения

Создайте файл `.env` в корне проекта (или используйте `env.example`):

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=advanced_file_manager
POSTGRES_PORT=5435
JWT_SECRET=your-secret-key
COOKIE_SECRET=your-cookie-secret
```

## Применение миграций БД

После первого запуска или при изменении схемы БД:

```bash
# Войти в контейнер API
docker exec -it afm_api_dev sh

# Применить миграции
node apps/api/scripts/migrate.js
```

## Отладка

### Просмотр логов

```bash
# Все сервисы
docker-compose -f docker-compose.dev.yml logs -f

# Только API
docker-compose -f docker-compose.dev.yml logs -f api

# Только Web
docker-compose -f docker-compose.dev.yml logs -f web
```

### Перезапуск сервиса

```bash
# Перезапустить API
docker-compose -f docker-compose.dev.yml restart api

# Перезапустить Web
docker-compose -f docker-compose.dev.yml restart web
```

## Production режим

Для production используйте обычный `docker-compose.yml`:

```bash
docker-compose up --build
```

---

## Ошибка "No space left on device"

Если при запуске PostgreSQL появляется ошибка `No space left on device`, освободите место в Docker:

```bash
# Очистить неиспользуемые образы, контейнеры и volumes
docker system prune -af --volumes

# Очистить build cache (освобождает ~20-40 GB)
docker builder prune -af

# Затем перезапустить
docker-compose -f docker-compose.dev.yml up -d
```

**Примечание:** `--volumes` удалит данные БД. После этого потребуется заново применить миграции.

