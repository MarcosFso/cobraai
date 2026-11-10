package com.billing.service;

import com.billing.domain.Customer;
import com.billing.domain.CustomerRepository;
import com.billing.domain.Organization;
import com.billing.domain.OrganizationRepository;
import com.billing.domain.RecurringInvoice;
import com.billing.domain.RecurringInvoiceRepository;
import com.billing.error.BusinessRuleException;
import com.billing.error.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Monthly charges. Creating one issues the first invoice right away; the daily job issues the following ones a few
 * days before each due date. Every invoice goes through {@link InvoiceService}, so it has its outbox event like any
 * other and the report and notification services need no special case.
 */
@Service
public class RecurringService {

    public record RecurringView(RecurringInvoice recurring, Customer customer) {
    }

    public static final int DEMO_MAX_RECURRING = 10;

    private static final Logger log = LoggerFactory.getLogger(RecurringService.class);

    private final RecurringInvoiceRepository recurrings;
    private final CustomerRepository customers;
    private final OrganizationRepository organizations;
    private final InvoiceService invoices;
    private final int advanceDays;

    public RecurringService(RecurringInvoiceRepository recurrings, CustomerRepository customers,
                            OrganizationRepository organizations, InvoiceService invoices,
                            @Value("${app.recurring.advance-days}") int advanceDays) {
        this.recurrings = recurrings;
        this.customers = customers;
        this.organizations = organizations;
        this.invoices = invoices;
        this.advanceDays = advanceDays;
    }

    @Transactional
    public InvoiceView create(UUID orgId, UUID customerId, String description, long amountCents, LocalDate firstDueDate) {
        if (amountCents <= 0) {
            throw new BusinessRuleException("O valor precisa ser maior que zero");
        }
        if (firstDueDate.isBefore(invoices.today())) {
            throw new BusinessRuleException("O primeiro vencimento não pode estar no passado");
        }
        customers.findByIdAndOrgId(customerId, orgId).orElseThrow(() -> new NotFoundException("Cliente não encontrado"));
        if (organizations.findById(orgId).map(Organization::isDemo).orElse(false)
                && recurrings.countByOrgIdAndActiveTrue(orgId) >= DEMO_MAX_RECURRING) {
            throw new BusinessRuleException("Limite da demonstração atingido (" + DEMO_MAX_RECURRING + " cobranças recorrentes)");
        }

        RecurringInvoice recurring = recurrings.saveAndFlush(
                new RecurringInvoice(orgId, customerId, description.trim(), amountCents, firstDueDate));
        log.info("Recurring invoice created recurringId={} orgId={}", recurring.getId(), orgId);
        return invoices.issue(orgId, customerId, description, amountCents, firstDueDate, recurring.getId());
    }

    @Transactional(readOnly = true)
    public List<RecurringView> list(UUID orgId) {
        Map<UUID, Customer> byId = customers.findByOrgIdOrderByNameAsc(orgId).stream()
                .collect(Collectors.toMap(Customer::getId, Function.identity()));
        return recurrings.findByOrgIdOrderByCreatedAtDesc(orgId).stream()
                .map(r -> new RecurringView(r, byId.get(r.getCustomerId()))).toList();
    }

    /** Stops future invoices. The ones already issued stay as they are. */
    @Transactional
    public RecurringView stop(UUID orgId, UUID id) {
        RecurringInvoice recurring = recurrings.findByIdAndOrgId(id, orgId)
                .orElseThrow(() -> new NotFoundException("Cobrança recorrente não encontrada"));
        recurring.stop();
        recurrings.saveAndFlush(recurring);
        log.info("Recurring invoice stopped recurringId={} orgId={}", id, orgId);
        return new RecurringView(recurring, customers.findById(recurring.getCustomerId()).orElse(null));
    }

    /** Ids of active recurring charges whose next invoice is due on or before the horizon. */
    @Transactional(readOnly = true)
    public List<UUID> findDue(LocalDate horizon) {
        return recurrings.findByActiveTrueAndNextDueDateLessThanEqual(horizon).stream().map(RecurringInvoice::getId).toList();
    }

    public LocalDate horizon() {
        return invoices.today().plusDays(advanceDays);
    }

    /**
     * Issues the next invoice of one recurring charge, if it is due within the horizon, and moves the charge to the
     * following month. One transaction per charge. Returns false when there was nothing to issue, so the caller can
     * loop until a charge is up to date. The version column makes two simultaneous runs issue a month only once.
     */
    @Transactional
    public boolean issueNext(UUID id, LocalDate horizon) {
        RecurringInvoice recurring = recurrings.findById(id).orElse(null);
        if (recurring == null || !recurring.isActive() || recurring.getNextDueDate().isAfter(horizon)) {
            return false;
        }
        invoices.issue(recurring.getOrgId(), recurring.getCustomerId(), recurring.getDescription(),
                recurring.getAmountCents(), recurring.getNextDueDate(), recurring.getId());
        recurring.advance();
        recurrings.saveAndFlush(recurring);
        log.info("Recurring invoice issued recurringId={} orgId={} nextDue={}", id, recurring.getOrgId(), recurring.getNextDueDate());
        return true;
    }
}
