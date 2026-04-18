-- Миграция: переименование unacceptable → critical и добавление таблицы risk_scoring_history
-- Запускать: psql -U compliance_user -d compliance_db -f migrate_risk_level.sql

BEGIN;

-- 1. Переименовываем значение enum в PostgreSQL
ALTER TYPE risklevel RENAME VALUE 'unacceptable' TO 'critical';

-- 2. Создаём таблицу истории риск-скоринга
CREATE TABLE IF NOT EXISTS risk_scoring_history (
    id                          SERIAL PRIMARY KEY,
    client_id                   INTEGER NOT NULL REFERENCES clients(id),
    company_id                  INTEGER NOT NULL REFERENCES companies(id),

    -- Блоки (NULL если не применяется к типу клиента)
    block_a                     FLOAT,   -- Профиль участника (только юрлица)
    block_b                     FLOAT,   -- Активы и операции
    block_c                     FLOAT,   -- Транзакционный риск
    block_d                     FLOAT,   -- Комплаенс и контроль (только юрлица)

    score_details               JSONB,   -- Детали по каждому критерию
    final_score                 FLOAT,
    risk_level                  risklevel NOT NULL,

    -- Override
    override_applied            BOOLEAN DEFAULT FALSE,
    override_reasons            JSONB,

    -- Ручная корректировка
    manual_override             BOOLEAN DEFAULT FALSE,
    manual_override_justification TEXT,

    assessed_by                 INTEGER REFERENCES users(id),
    assessed_at                 TIMESTAMP DEFAULT NOW(),
    next_review_date            TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_scoring_client ON risk_scoring_history(client_id);
CREATE INDEX IF NOT EXISTS idx_risk_scoring_company ON risk_scoring_history(company_id);

COMMIT;
