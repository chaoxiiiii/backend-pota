#!/bin/sh
set -e

echo "=== Running schema migrations ==="
python migrate_db.py

echo "=== Initializing database tables ==="
python init_db.py

echo "=== Running seeders ==="
python seed_admin.py
python seed_aew.py
python seed_provincial.py
python seed_municipal.py
python seed_darfo.py
python seed_farmers.py
python seed_buyers.py
python seed_planting_intents.py
python assign_aew.py

echo "=== Starting API server ==="
exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}"
