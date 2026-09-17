FROM python:3.11-slim

WORKDIR /app

# Prophet/cmdstanpy need a C toolchain and shared libs at runtime;
# the slim image doesn't ship them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY migrate_db.py init_db.py assign_aew.py start.sh ./
COPY seed_*.py ./
COPY uploads ./uploads

# Normalize Windows line endings (CRLF breaks /bin/sh) and make executable
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
