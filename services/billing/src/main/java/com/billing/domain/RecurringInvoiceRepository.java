package com.billing.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecurringInvoiceRepository extends JpaRepository<RecurringInvoice, UUID> {

    List<RecurringInvoice> findByOrgIdOrderByCreatedAtDesc(UUID orgId);

    Optional<RecurringInvoice> findByIdAndOrgId(UUID id, UUID orgId);

    long countByOrgIdAndActiveTrue(UUID orgId);

    /** Used only by the job, which works on every company. */
    List<RecurringInvoice> findByActiveTrueAndNextDueDateLessThanEqual(LocalDate horizon);
}
