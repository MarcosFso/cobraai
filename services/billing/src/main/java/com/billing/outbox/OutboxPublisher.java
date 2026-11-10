package com.billing.outbox;

import com.billing.domain.OutboxEvent;
import com.billing.domain.OutboxEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Polls the outbox table and sends unpublished events to Kafka, in creation order.
 * Delivery is "at least once": if the service dies between the send and the commit, the event is sent again,
 * which is why every consumer is idempotent (it ignores an eventId it has already processed).
 * Single instance assumption (MVP); with several replicas use SELECT ... FOR UPDATE SKIP LOCKED.
 */
@Component
@ConditionalOnProperty(name = "app.outbox.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);

    private final OutboxEventRepository outbox;
    private final KafkaTemplate<String, String> kafka;
    private final int batchSize;
    private final String topic;

    public OutboxPublisher(OutboxEventRepository outbox, KafkaTemplate<String, String> kafka,
                           @Value("${app.outbox.batch-size}") int batchSize,
                           @Value("${app.topics.invoice-events}") String topic) {
        this.outbox = outbox;
        this.kafka = kafka;
        this.batchSize = batchSize;
        this.topic = topic;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms}")
    @Transactional
    public void publishPending() {
        List<OutboxEvent> batch = outbox.findByPublishedAtIsNullOrderBySeqAsc(PageRequest.of(0, batchSize));
        for (OutboxEvent event : batch) {
            try {
                // One topic for every event of an invoice, keyed by the invoice id: Kafka only orders messages inside
                // one partition, so created, paid and overdue of the same invoice must travel together.
                kafka.send(topic, event.getAggregateId(), event.getPayload()).get(10, TimeUnit.SECONDS);
                event.markPublished();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                // Stop at the first failure to keep order; the next poll retries from here.
                log.warn("Could not publish eventId={} type={}: {}", event.getId(), event.getType(), e.toString());
                return;
            }
        }
    }
}
