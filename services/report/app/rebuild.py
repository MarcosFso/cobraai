"""Rebuild command: wipes the Redis numbers and replays every topic from the first message.

    docker compose stop report-service
    docker compose run --rm report-service python -m app.rebuild
    docker compose start report-service

It works because the topics have infinite retention and because applying an event is idempotent.
The "processed" list is wiped too; otherwise every replayed event would be ignored as a duplicate.
Stop the live service first so it does not apply events while the keys are being rebuilt.
"""
import asyncio
import logging

from aiokafka import AIOKafkaConsumer, TopicPartition
from redis.asyncio import Redis

from . import config
from .consumer import handle_message
from .logging_setup import setup_logging
from .store import ReportStore

log = logging.getLogger("report.rebuild")


async def rebuild(store: ReportStore) -> int:
    removed = await store.clear()
    log.info("Redis keys removed", extra={"keys": removed})

    consumer = AIOKafkaConsumer(bootstrap_servers=config.KAFKA_BOOTSTRAP, group_id=None, enable_auto_commit=False)
    await consumer.start()
    replayed = 0
    try:
        partitions = []
        for topic in config.TOPICS:
            for partition in consumer.partitions_for_topic(topic) or set():
                partitions.append(TopicPartition(topic, partition))
        if not partitions:
            log.warning("No partitions found, nothing to replay")
            return 0
        consumer.assign(partitions)
        await consumer.seek_to_beginning(*partitions)
        end_offsets = await consumer.end_offsets(partitions)
        pending = {tp for tp in partitions if end_offsets[tp] > 0}

        while pending:
            batch = await consumer.getmany(timeout_ms=2000)
            for tp, messages in batch.items():
                for message in messages:
                    await handle_message(store, message.value)
                    replayed += 1
                    if message.offset + 1 >= end_offsets[tp]:
                        pending.discard(tp)
            if not batch:
                break
    finally:
        await consumer.stop()
    log.info("Rebuild finished", extra={"replayed": replayed})
    return replayed


async def main() -> None:
    setup_logging()
    redis = Redis.from_url(config.REDIS_URL, decode_responses=True)
    try:
        await rebuild(ReportStore(redis))
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
