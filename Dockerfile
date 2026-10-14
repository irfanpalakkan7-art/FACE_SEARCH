FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics \
    PORT=7860 \
    PUBLIC_DEMO=1 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

RUN useradd --create-home --uid 1000 user

WORKDIR /home/user/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-space.txt .
RUN pip install --no-cache-dir -r requirements-space.txt \
    && chown user:user /home/user/app

USER user

RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
    && mkdir -p logs screenshots models

COPY --chown=user . .

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "2", "--timeout", "120", "web_app:app"]
