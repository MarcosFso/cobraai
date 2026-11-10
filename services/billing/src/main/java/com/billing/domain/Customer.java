package com.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "customers")
public class Customer {

    @Id
    private UUID id;

    @Column(name = "org_id", nullable = false, updatable = false)
    private UUID orgId;

    @Column(nullable = false, length = 120)
    private String name;

    /** CPF or CNPJ, digits only. Unique per company (see the migration), not globally. */
    @Column(nullable = false, length = 14)
    private String document;

    @Column(nullable = false, length = 160)
    private String email;

    /** Brazilian number with country code, digits only (e.g. 5511912345678). Optional. */
    @Column(length = 13)
    private String phone;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Customer() {
    }

    public Customer(UUID orgId, String name, String document, String email, String phone) {
        this.id = UUID.randomUUID();
        this.orgId = orgId;
        this.name = name;
        this.document = document;
        this.email = email;
        this.phone = phone;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getOrgId() { return orgId; }
    public String getName() { return name; }
    public String getDocument() { return document; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public Instant getCreatedAt() { return createdAt; }
}
