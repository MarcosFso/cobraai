package com.billing.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Every query carries the organization id: a company can never reach another company's rows. */
public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    List<Customer> findByOrgIdOrderByNameAsc(UUID orgId);

    Optional<Customer> findByIdAndOrgId(UUID id, UUID orgId);

    boolean existsByOrgIdAndDocument(UUID orgId, String document);

    long countByOrgId(UUID orgId);
}
