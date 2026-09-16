#!/bin/sh
set -e

python migrate_db.py

python init_db.py
python seed_admin.py
python seed_aew.py
python seed_provincial.py
python seed_municipal.py
python seed_darfo.py
python seed_farmers.py
python seed_buyers.py
python seed_planting_intents.py

echo "RUN_ETL_ON_STARTUP=${RUN_ETL_ON_STARTUP:-true}"

if [ "${RUN_ETL_ON_STARTUP:-true}" = "true" ]; then
    echo "Starting initial PSA and forecast ETL in the background..."
    python -u -m src.etl_pipeline.scheduler --run-now &
    echo "Initial ETL process started with PID $!."
fi

exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}"
