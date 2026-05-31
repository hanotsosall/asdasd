FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем все файлы, включая папки templates, static, cleaners
COPY . .

ENV PORT=8080

CMD ["sh", "-c", "python bot.py 2>&1 & uvicorn main:app --host 0.0.0.0 --port $PORT"]
