import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from . import config
from .store import ReportStore

log = logging.getLogger("report.consumer")


async def handle_message(store: ReportStore, raw: bytes) -> None:
    try:
        event = json.loads(raw)
        event["eventId"], event["type"], event["invoiceId"], event["amountCents"]
    except (ValueError, KeyError, TypeError):
        log.warning("Discarding invalid event payload")
        return
    await store.apply(event)


async def run_consumer(store: ReportStore) -> None:
    """Live consumer. Retries until Kafka and the topics are ready (billing-service creates them)."""
    while True:
        consumer = AIOKafkaConsumer(
            *config.TOPICS,
            bootstrap_servers=config.KAFKA_BOOTSTRAP,
            group_id=config.KAFKA_GROUP_ID,
            auto_offset_reset="earliest",
        )
        try:
            await consumer.start()
            log.info("Kafka consumer running", extra={"topics": config.TOPICS})
            async for message in consumer:
                await handle_message(store, message.value)
        except asyncio.CancelledError:
            await consumer.stop()
            raise
        except Exception as error:  # noqa: BLE001 - keep the service alive, retry
            log.warning("Kafka not ready, retrying in 5s", extra={"error": str(error)})
            await consumer.stop()
            await asyncio.sleep(5)
