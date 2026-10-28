package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceRepository;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.OutboxEvent;
import com.billing.domain.OutboxEventRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.NotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Every state change writes the invoice and its outbox event in the SAME transaction
 * (Transactional Outbox). Nothing in this class talks to Kafka.
 */
@Service
public class InvoiceService {

    public static final String CREATED = "invoice.created";
    public static final String PAID = "invoice.paid";
    public static final String OVERDUE = "invoice.overdue";
    public static final String CANCELED = "invoice.canceled";

    private static final Logger log = LoggerFactory.getLogger(InvoiceService.class);

    private final InvoiceRepository invoices;
    private final CustomerRepository customers;
    private final OutboxEventRepository outbox;
    private final ObjectMapper mapper;
    private final Clock clock;

    public InvoiceService(InvoiceRepository invoices, CustomerRepository customers,
                          OutboxEventRepository outbox, ObjectMapper mapper, Clock clock) {
        this.invoices = invoices;
        this.customers = customers;
        this.outbox = outbox;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public Invoice create(UUID customerId, String description, long amountCents, LocalDate dueDate) {
        if (amountCents <= 0) {
            throw new BusinessRuleException("amountCents must be greater than zero");
        }
        if (dueDate.isBefore(today())) {
            throw new BusinessRuleException("dueDate cannot be in the past");
        }
        Customer customer = customers.findById(customerId)
                .orElseThrow(() -> new NotFoundException("Customer not found: " + customerId));

        Invoice invoice = invoices.save(new Invoice(customerId, description.trim(), amountCents, dueDate));
        record(CREATED, invoice, customer);
        log.info("Invoice created invoiceId={}", invoice.getId());
        return invoice;
    }

    @Transactional
    public Invoice pay(UUID id) {
        Invoice invoice = find(id);
        invoice.pay(Instant.now(clock));
        record(PAID, invoice, customerOf(invoice));
        log.info("Invoice paid invoiceId={}", id);
        return invoices.saveAndFlush(invoice);
    }

    @Transactional
    public Invoice cancel(UUID id) {
        Invoice invoice = find(id);
        invoice.cancel();
        record(CANCELED, invoice, customerOf(invoice));
        log.info("Invoice canceled invoiceId={}", id);
        return invoices.saveAndFlush(invoice);
    }

    /** Ids of OPEN invoices whose due date already passed (candidates for the daily job). */
    @Transactional(readOnly = true)
    public List<UUID> findOverdueCandidates() {
        return invoices.findByStatusAndDueDateBefore(InvoiceStatus.OPEN, today())
                .stream().map(Invoice::getId).toList();
    }

    /** One transaction per invoice, so a conflict on one does not roll back the others. */
    @Transactional
    public boolean markOverdue(UUID id) {
        Invoice invoice = find(id);
        if (!invoice.markOverdue(today())) {
            return false; // already OVERDUE/PAID/CANCELED: running the job twice emits nothing
        }
        record(OVERDUE, invoice, customerOf(invoice));
        invoices.saveAndFlush(invoice);
        log.info("Invoice marked overdue invoiceId={}", id);
        return true;
    }

    @Transactional(readOnly = true)
    public Invoice get(UUID id) {
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<Invoice> list(InvoiceStatus status) {
        return status == null
                ? invoices.findAllByOrderByCreatedAtDesc()
                : invoices.findByStatusOrderByDueDateAsc(status);
    }

    /** "Today" is always computed in America/Sao_Paulo (see Clock bean). */
    public LocalDate today() {
        return LocalDate.now(clock);
    }

    private Invoice find(UUID id) {
        return invoices.findById(id).orElseThrow(() -> new NotFoundException("Invoice not found: " + id));
    }

    private Customer customerOf(Invoice invoice) {
        return customers.findById(invoice.getCustomerId())
                .orElseThrow(() -> new NotFoundException("Customer not found: " + invoice.getCustomerId()));
    }

    private void record(String type, Invoice invoice, Customer customer) {
        UUID eventId = UUID.randomUUID();
        String correlationId = MDC.get("correlationId");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventId", eventId.toString());
        payload.put("correlationId", correlationId != null ? correlationId : UUID.randomUUID().toString());
        payload.put("type", type);
        payload.put("occurredAt", Instant.now(clock).toString());
        payload.put("invoiceId", invoice.getId().toString());
        payload.put("customerId", customer.getId().toString());
        payload.put("customerEmail", customer.getEmail());
        payload.put("amountCents", invoice.getAmountCents());
        payload.put("dueDate", invoice.getDueDate().toString());
        try {
            outbox.save(new OutboxEvent(eventId, type, invoice.getId().toString(), mapper.writeValueAsString(payload)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize event " + type, e);
        }
    }
}
