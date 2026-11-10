package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.domain.Invoice;
import com.billing.domain.InvoiceRepository;
import com.billing.domain.InvoiceStatus;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Every state change writes the invoice and its outbox event in the SAME transaction (Transactional Outbox).
 * Nothing in this class talks to Kafka. Every method that serves a user takes the user's company, and all queries
 * filter by it.
 */
@Service
public class InvoiceService {

    public static final String CREATED = "invoice.created";
    public static final String PAID = "invoice.paid";
    public static final String OVERDUE = "invoice.overdue";
    public static final String CANCELED = "invoice.canceled";
    public static final int DEMO_MAX_INVOICES = 120;

    private static final Logger log = LoggerFactory.getLogger(InvoiceService.class);

    private final InvoiceRepository invoices;
    private final CustomerRepository customers;
    private final OrganizationRepository organizations;
    private final EventRecorder events;
    private final Clock clock;

    public InvoiceService(InvoiceRepository invoices, CustomerRepository customers, OrganizationRepository organizations,
                          EventRecorder events, Clock clock) {
        this.invoices = invoices;
        this.customers = customers;
        this.organizations = organizations;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public InvoiceView create(UUID orgId, UUID customerId, String description, long amountCents, LocalDate dueDate) {
        if (amountCents <= 0) {
            throw new BusinessRuleException("O valor precisa ser maior que zero");
        }
        if (dueDate.isBefore(today())) {
            throw new BusinessRuleException("O vencimento não pode estar no passado");
        }
        Customer customer = customers.findByIdAndOrgId(customerId, orgId)
                .orElseThrow(() -> new NotFoundException("Cliente não encontrado"));
        if (organizations.findById(orgId).map(Organization::isDemo).orElse(false)
                && invoices.countByOrgId(orgId) >= DEMO_MAX_INVOICES) {
            throw new BusinessRuleException("Limite da demonstração atingido (" + DEMO_MAX_INVOICES + " cobranças)");
        }

        Invoice invoice = invoices.save(new Invoice(orgId, customerId, description.trim(), amountCents, dueDate));
        events.record(CREATED, invoice, customer, Instant.now(clock), false);
        log.info("Invoice created invoiceId={} orgId={}", invoice.getId(), orgId);
        return new InvoiceView(invoice, customer);
    }

    @Transactional
    public InvoiceView pay(UUID orgId, UUID id) {
        Invoice invoice = find(orgId, id);
        invoice.pay(Instant.now(clock));
        Customer customer = customerOf(invoice);
        events.record(PAID, invoice, customer, Instant.now(clock), false);
        log.info("Invoice paid invoiceId={} orgId={}", id, orgId);
        return new InvoiceView(invoices.saveAndFlush(invoice), customer);
    }

    @Transactional
    public InvoiceView cancel(UUID orgId, UUID id) {
        Invoice invoice = find(orgId, id);
        invoice.cancel();
        Customer customer = customerOf(invoice);
        events.record(CANCELED, invoice, customer, Instant.now(clock), false);
        log.info("Invoice canceled invoiceId={} orgId={}", id, orgId);
        return new InvoiceView(invoices.saveAndFlush(invoice), customer);
    }

    /** Ids of OPEN invoices (of any company) whose due date already passed: candidates for the daily job. */
    @Transactional(readOnly = true)
    public List<UUID> findOverdueCandidates() {
        return invoices.findByStatusAndDueDateBefore(InvoiceStatus.OPEN, today())
                .stream().map(Invoice::getId).toList();
    }

    /** One transaction per invoice, so a conflict on one does not roll back the others. Called by the system job. */
    @Transactional
    public boolean markOverdue(UUID id) {
        Invoice invoice = invoices.findById(id).orElseThrow(() -> new NotFoundException("Cobrança não encontrada"));
        if (!invoice.markOverdue(today())) {
            return false; // already OVERDUE/PAID/CANCELED: running the job twice emits nothing
        }
        events.record(OVERDUE, invoice, customerOf(invoice), Instant.now(clock), false);
        invoices.saveAndFlush(invoice);
        log.info("Invoice marked overdue invoiceId={} orgId={}", id, invoice.getOrgId());
        return true;
    }

    @Transactional(readOnly = true)
    public InvoiceView get(UUID orgId, UUID id) {
        Invoice invoice = find(orgId, id);
        return new InvoiceView(invoice, customerOf(invoice));
    }

    @Transactional(readOnly = true)
    public List<InvoiceView> list(UUID orgId, InvoiceStatus status) {
        Map<UUID, Customer> byId = customers.findByOrgIdOrderByNameAsc(orgId).stream()
                .collect(Collectors.toMap(Customer::getId, Function.identity()));
        List<Invoice> rows = status == null
                ? invoices.findByOrgIdOrderByDueDateDesc(orgId)
                : invoices.findByOrgIdAndStatusOrderByDueDateAsc(orgId, status);
        return rows.stream().map(invoice -> new InvoiceView(invoice, byId.get(invoice.getCustomerId()))).toList();
    }

    /** "Today" is always computed in America/Sao_Paulo (see Clock bean). */
    public LocalDate today() {
        return LocalDate.now(clock);
    }

    private Invoice find(UUID orgId, UUID id) {
        return invoices.findByIdAndOrgId(id, orgId).orElseThrow(() -> new NotFoundException("Cobrança não encontrada"));
    }

    private Customer customerOf(Invoice invoice) {
        return customers.findById(invoice.getCustomerId())
                .orElseThrow(() -> new NotFoundException("Cliente não encontrado"));
    }
}
