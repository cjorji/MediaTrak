FROM node:24-alpine AS frontend
WORKDIR /build
RUN npm install --global pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home app
COPY backend/ ./
COPY --from=frontend /build/dist/ ./frontend/
RUN DEBUG=1 python manage.py collectstatic --noinput && mkdir -p /data && chown app:app /data
USER app
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --no-control-socket --workers 1 --threads 4 --timeout 60"]
