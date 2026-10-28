package com.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    /** Same value as the eventId inside the payload. */
    @Id
    private UUID id;

    @Column(nullable = false, length = 40)
    private String type;

    /** Kafka message key (the invoice id), so events of one invoice stay ordered. */
    @Column(name = "aggregate_id", nullable = false, length = 64)
    private String aggregateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    protected OutboxEvent() {
    }

    public OutboxEvent(UUID id, String type, String aggregateId, String payload) {
        this.id = id;
        this.type = type;
        this.aggregateId = aggregateId;
        this.payload = payload;
        this.createdAt = Instant.now();
    }

    public void markPublished() {
        this.publishedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getType() { return type; }
    public String getAggregateId() { return aggregateId; }
    public String getPayload() { return payload; }
    public Instant getPublishedAt() { return publishedAt; }
}
