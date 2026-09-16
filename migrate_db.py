"""
Idempotent schema migrations for deployments without Alembic.
Runs at container startup (start.sh) before seeding.
Safe to run repeatedly — uses IF NOT EXISTS / catalog checks.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from src.core.database import engine


MIGRATIONS = [
    # users.municipality — added to model in commit ab46820
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS municipality VARCHAR(100)",

    # planting_intents — finalized_status / is_in_report added after initial deploy
    "ALTER TABLE planting_intents ADD COLUMN IF NOT EXISTS finalized_status VARCHAR DEFAULT 'NOT PLANTED'",
    "ALTER TABLE planting_intents ADD COLUMN IF NOT EXISTS is_in_report BOOLEAN DEFAULT FALSE",

    # raw_plant_reports — title/notes/status/attachments/municipality/timestamps added after initial deploy
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS title VARCHAR",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'DRAFT'",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS municipality VARCHAR",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()",
    "ALTER TABLE raw_plant_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",

    # report_planting_intents — snapshot columns added after initial deploy
    "ALTER TABLE report_planting_intents ADD COLUMN IF NOT EXISTS finalized_status_snapshot VARCHAR DEFAULT 'NOT PLANTED'",
    "ALTER TABLE report_planting_intents ADD COLUMN IF NOT EXISTS plant_status_snapshot VARCHAR",
]


def run_migrations():
    with engine.begin() as conn:
        for stmt in MIGRATIONS:
            print(f"[migrate] {stmt}")
            conn.execute(text(stmt))
    print("[migrate] done.")


if __name__ == "__main__":
    run_migrations()
