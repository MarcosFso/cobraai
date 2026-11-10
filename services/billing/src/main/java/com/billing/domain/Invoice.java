package com.billing.domain;

import com.billing.error.InvalidTransitionException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "invoices")
public class Invoice {

    @Id
    private UUID id;

    @Column(name = "org_id", nullable = false, updatable = false)
    private UUID orgId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(nullable = false, length = 200)
    private String description;

    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private InvoiceStatus status;

    @Column(name = "paid_at")
    private Instant paidAt;

    /** Optimistic lock: two simultaneous "pay" requests cannot both succeed. */
    @Version
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Invoice() {
    }

    public Invoice(UUID orgId, UUID customerId, String description, long amountCents, LocalDate dueDate) {
        this.id = UUID.randomUUID();
        this.orgId = orgId;
        this.customerId = customerId;
        this.description = description;
        this.amountCents = amountCents;
        this.dueDate = dueDate;
        this.status = InvoiceStatus.OPEN;
        this.createdAt = Instant.now();
    }

    /** Sample data for the demo sandbox: an invoice that already went through part of its life. */
    public static Invoice seeded(UUID orgId, UUID customerId, String description, long amountCents, LocalDate dueDate,
                                 InvoiceStatus status, Instant createdAt, Instant paidAt) {
        Invoice invoice = new Invoice(orgId, customerId, description, amountCents, dueDate);
        invoice.status = status;
        invoice.createdAt = createdAt;
        invoice.paidAt = paidAt;
        return invoice;
    }

    /** OPEN or OVERDUE -> PAID. */
    public void pay(Instant now) {
        if (status != InvoiceStatus.OPEN && status != InvoiceStatus.OVERDUE) {
            throw new InvalidTransitionException(id, status, "pay");
        }
        this.status = InvoiceStatus.PAID;
        this.paidAt = now;
    }

    /** OPEN or OVERDUE -> CANCELED. */
    public void cancel() {
        if (status != InvoiceStatus.OPEN && status != InvoiceStatus.OVERDUE) {
            throw new InvalidTransitionException(id, status, "cancel");
        }
        this.status = InvoiceStatus.CANCELED;
    }

    /** OPEN -> OVERDUE, only when the due date is before {@code today}. Returns true if it changed. */
    public boolean markOverdue(LocalDate today) {
        if (status != InvoiceStatus.OPEN || !dueDate.isBefore(today)) {
            return false;
        }
        this.status = InvoiceStatus.OVERDUE;
        return true;
    }

    public UUID getId() { return id; }
    public UUID getOrgId() { return orgId; }
    public UUID getCustomerId() { return customerId; }
    public String getDescription() { return description; }
    public long getAmountCents() { return amountCents; }
    public LocalDate getDueDate() { return dueDate; }
    public InvoiceStatus getStatus() { return status; }
    public Instant getPaidAt() { return paidAt; }
    public Instant getCreatedAt() { return createdAt; }
}
