# Миграции БД

- 0001_enable_extensions.sql — включает расширения: unaccent, pg_trgm, citext, btree_gin.
- 0002_core_schema.sql — ядро схемы (таблицы и enum'ы) без индексов и FTS.
- 0003_fts_and_indexes.sql — tsvector, индексы GIN/JSONB и btree.
- 0004_auth.sql — аутентификация: password_hash и timestamps для users.
- 0005_drive_folders.sql — папки + soft-delete для assets.
- 0006_local_file_storage.sql — хранение файлов на локальном диске (asset_files.original_name и служебные поля).
- 0007_saved_searches.sql — сохранённые поиски (JSONB SearchRequest).
- 0100_seed_demo.sql — демо-данные после применения схемы.

Применяйте в порядке, под ролью с правами на создание расширений/типов.


