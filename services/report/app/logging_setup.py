import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Extra fields (eventId, correlationId, ...) are passed with extra={...}."""

    RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "@timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "service": "report-service",
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in self.RESERVED:
                data[key] = value
        if record.exc_info:
            data["error"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    logging.getLogger("aiokafka").setLevel(logging.WARNING)
