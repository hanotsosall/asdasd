FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Открываем порт для Railway (Railway автоматически использует $PORT)
ENV PORT=8000

CMD ["sh", "-c", "python bot.py & uvicorn main:app --host 0.0.0.0 --port $PORT"]
