package com.billing.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    long countByDemoTrue();

    /** Bulk delete; the database cascades to users, customers and invoices of those sandboxes. */
    @Modifying
    @Query("delete from Organization o where o.demo = true and o.createdAt < :before")
    int deleteDemoCreatedBefore(@Param("before") Instant before);
}
