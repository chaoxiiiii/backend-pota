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
]


def run_migrations():
    with engine.begin() as conn:
        for stmt in MIGRATIONS:
            print(f"[migrate] {stmt}")
            conn.execute(text(stmt))
    print("[migrate] done.")


if __name__ == "__main__":
    run_migrations()
