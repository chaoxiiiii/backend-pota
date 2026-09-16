#!/bin/sh
set -e

# Ensure all frontend interface files are available in the deployed runtime.
mkdir -p frontend/dashboards

for file in index.html login.html buyer-registry.html forgot-password.html reset-password.html; do
    if [ -f "$file" ] && [ ! -f "frontend/$file" ]; then
        cp "$file" "frontend/$file"
    fi
    if [ -f "frontend/$file" ]; then
        cp "$file" "frontend/$file"
    fi
done

for file in frontend/dashboards/*.html; do
    [ -e "$file" ] || continue
    cp "$file" "frontend/dashboards/$(basename "$file")"
done

if [ -d "assets" ] && [ ! -d "frontend/assets" ]; then
    cp -R assets frontend/assets
fi

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
