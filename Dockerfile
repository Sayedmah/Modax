FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY backend ./backend
COPY apps ./apps
COPY game_forge ./game_forge
COPY scripts ./scripts
RUN pip install --no-cache-dir -e . && useradd --uid 10001 --create-home modax && mkdir /data && chown modax:modax /data
USER modax
ENV MODAX_DATA_DIR=/data MODAX_ALLOW_SIGNUP=false MODAX_DEMO=true
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "modax.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
