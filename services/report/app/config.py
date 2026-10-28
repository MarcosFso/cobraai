import os

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "report-service")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

TOPICS = ["invoice.created", "invoice.paid", "invoice.overdue", "invoice.canceled"]
