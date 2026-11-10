package com.billing.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<AppUser, UUID> {

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<AppUser> findByOrgIdOrderByEmailAsc(UUID orgId);

    Optional<AppUser> findByIdAndOrgId(UUID id, UUID orgId);

    long countByOrgIdAndRole(UUID orgId, Role role);
}
