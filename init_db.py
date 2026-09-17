# init_db.py
# Creates all database tables from the SQLAlchemy models.
# Safe to run on every deploy: create_all() only creates missing tables.
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.database import Base, engine

# Import every model module so all tables are registered on Base.metadata
# before create_all() runs (relationships also resolve by string name).
from src.models import (  # noqa: F401
    users,
    audit_logs,
    farmers,
    buyers,
    buyer_registry,
    buyer_status,
    planting_intents,
    offtake_requests,
    price_data,
    forecasts,
    raw_plant_reports,
    report_planting_intents,
    report_status,
    report_submission,
    report_validation_history,
    alert_threshold_configs,
    etl_run_log,
)


def init_db():
    print("Initializing database schema...")
    Base.metadata.create_all(bind=engine)
    tables = sorted(Base.metadata.tables.keys())
    print(f"Schema ready ({len(tables)} tables):")
    for table in tables:
        print(f"   - {table}")


if __name__ == "__main__":
    init_db()
