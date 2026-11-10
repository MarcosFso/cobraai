package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.Invoice;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.domain.OutboxEvent;
import com.billing.domain.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Writes the event of a state change into the outbox table, in the caller's transaction (Transactional Outbox).
 * Nothing here talks to Kafka: the OutboxPublisher does that later.
 */
@Component
public class EventRecorder {

    private final OutboxEventRepository outbox;
    private final OrganizationRepository organizations;
    private final ObjectMapper mapper;

    public EventRecorder(OutboxEventRepository outbox, OrganizationRepository organizations, ObjectMapper mapper) {
        this.outbox = outbox;
        this.organizations = organizations;
        this.mapper = mapper;
    }

    /**
     * @param seed true for the sample data of a demo sandbox: the report service counts it, but no e-mail is sent
     */
    public void record(String type, Invoice invoice, Customer customer, Instant occurredAt, boolean seed) {
        boolean demo = organizations.findById(invoice.getOrgId()).map(Organization::isDemo).orElse(false);
        UUID eventId = UUID.randomUUID();
        String correlationId = MDC.get("correlationId");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventId", eventId.toString());
        payload.put("correlationId", correlationId != null ? correlationId : UUID.randomUUID().toString());
        payload.put("type", type);
        payload.put("occurredAt", occurredAt.toString());
        payload.put("orgId", invoice.getOrgId().toString());
        payload.put("invoiceId", invoice.getId().toString());
        payload.put("customerId", customer.getId().toString());
        payload.put("customerName", customer.getName());
        payload.put("customerEmail", customer.getEmail());
        payload.put("amountCents", invoice.getAmountCents());
        payload.put("dueDate", invoice.getDueDate().toString());
        payload.put("demo", demo);
        payload.put("seed", seed);
        try {
            outbox.save(new OutboxEvent(eventId, type, invoice.getId().toString(), mapper.writeValueAsString(payload)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize event " + type, e);
        }
    }
}
