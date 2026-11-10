package com.billing.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    List<Invoice> findByOrgIdOrderByDueDateDesc(UUID orgId);

    List<Invoice> findByOrgIdAndStatusOrderByDueDateAsc(UUID orgId, InvoiceStatus status);

    Optional<Invoice> findByIdAndOrgId(UUID id, UUID orgId);

    long countByOrgId(UUID orgId);

    /** Used only by the daily job, which works on every company. */
    List<Invoice> findByStatusAndDueDateBefore(InvoiceStatus status, LocalDate date);
}
