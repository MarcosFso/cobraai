package com.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

/**
 * A charge that repeats every month (a retainer, a monthly fee). It remembers the day of the month it was created
 * for (anchor) so a charge for day 31 goes to the 28th in February and back to the 31st in March.
 */
@Entity
@Table(name = "recurring_invoices")
public class RecurringInvoice {

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

    @Column(name = "anchor_day", nullable = false)
    private int anchorDay;

    /** Due date of the NEXT invoice to be issued. */
    @Column(name = "next_due_date", nullable = false)
    private LocalDate nextDueDate;

    @Column(nullable = false)
    private boolean active;

    /** Optimistic lock: two job runs cannot issue the same month twice. */
    @Version
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected RecurringInvoice() {
    }

    /** {@code firstDueDate} is the due date of the first invoice (issued right away); this keeps the next one. */
    public RecurringInvoice(UUID orgId, UUID customerId, String description, long amountCents, LocalDate firstDueDate) {
        this.id = UUID.randomUUID();
        this.orgId = orgId;
        this.customerId = customerId;
        this.description = description;
        this.amountCents = amountCents;
        this.anchorDay = firstDueDate.getDayOfMonth();
        this.nextDueDate = monthAfter(firstDueDate, anchorDay);
        this.active = true;
        this.createdAt = Instant.now();
    }

    /** Test and seed helper: a recurring charge whose NEXT invoice is due on {@code nextDueDate}. */
    public static RecurringInvoice startingAt(UUID orgId, UUID customerId, String description, long amountCents, LocalDate nextDueDate) {
        RecurringInvoice recurring = new RecurringInvoice(orgId, customerId, description, amountCents, nextDueDate);
        recurring.nextDueDate = nextDueDate;
        return recurring;
    }

    /** After issuing the invoice for {@link #getNextDueDate()}, moves to the following month. */
    public void advance() {
        this.nextDueDate = monthAfter(nextDueDate, anchorDay);
    }

    public void stop() {
        this.active = false;
    }

    static LocalDate monthAfter(LocalDate date, int anchorDay) {
        YearMonth next = YearMonth.from(date).plusMonths(1);
        return next.atDay(Math.min(anchorDay, next.lengthOfMonth()));
    }

    public UUID getId() { return id; }
    public UUID getOrgId() { return orgId; }
    public UUID getCustomerId() { return customerId; }
    public String getDescription() { return description; }
    public long getAmountCents() { return amountCents; }
    public int getAnchorDay() { return anchorDay; }
    public LocalDate getNextDueDate() { return nextDueDate; }
    public boolean isActive() { return active; }
    public Instant getCreatedAt() { return createdAt; }
}
