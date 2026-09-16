FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY frontend ./frontend
COPY seed_*.py init_db.py migrate_db.py start.sh ./
COPY uploads ./uploads

RUN chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]