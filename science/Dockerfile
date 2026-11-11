# MoonNav science service + worker (one image, two run modes).
# Build from the repository root:  docker build -f science/Dockerfile -t moonnav-science .
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MOONNAV_DATA_DIR=/srv/data UV_LINK_MODE=copy
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv
WORKDIR /srv/app
COPY science/pyproject.toml science/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY science/ ./
# Source products are fetched from NASA PDS / NAIF at build time and verified against the catalogue checksums.
COPY scripts/fetch_data.sh /srv/fetch_data.sh
RUN mkdir -p /srv/data && ln -s /srv/app /srv/science && MOONNAV_ROOT=/srv bash /srv/fetch_data.sh
RUN useradd --system --uid 10001 moonnav && chown -R moonnav /srv
USER moonnav
EXPOSE 8080
# SERVICE_MODE=api (default) serves FastAPI; SERVICE_MODE=worker runs the job worker.
CMD ["sh", "-c", "if [ \"$SERVICE_MODE\" = worker ]; then exec uv run --no-sync python -m moonnav_science.worker; else exec uv run --no-sync uvicorn moonnav_science.api:app --host 0.0.0.0 --port ${PORT:-8080}; fi"]
