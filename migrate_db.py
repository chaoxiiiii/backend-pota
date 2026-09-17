# migrate_db.py
# Idempotent schema migrations for existing databases.
#
# Base.metadata.create_all() (init_db.py) only creates NEW tables -- it
# never alters existing ones. So whenever a new column is added to a
# model, add it to MIGRATIONS below as well, otherwise production
# databases that predate the column will throw 500s at runtime.
#
# Every statement uses IF EXISTS / IF NOT EXISTS, so this script is safe
# to run on every container start, against both empty and old databases.
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from src.core.database import engine


# (table, column, column DDL)
MIGRATIONS = [
    # users.municipality -- added to the model after the production DB
    # already existed; missing column caused login/report 500s.
    ("users", "municipality", "VARCHAR(100)"),
]


def migrate():
    with engine.begin() as conn:
        for table, column, ddl in MIGRATIONS:
            print(f"Ensuring column {table}.{column} exists...")
            conn.execute(
                text(
                    f"ALTER TABLE IF EXISTS {table} "
                    f"ADD COLUMN IF NOT EXISTS {column} {ddl}"
                )
            )
    print("Migrations complete")


if __name__ == "__main__":
    migrate()
