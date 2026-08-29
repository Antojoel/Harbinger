FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# streamable-http / sse transports listen here; stdio ignores it.
EXPOSE 9000

CMD ["python", "server.py"]
