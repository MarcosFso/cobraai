package com.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A company. Everything else (customers, invoices) belongs to exactly one organization. */
@Entity
@Table(name = "organizations")
public class Organization {

    @Id
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    /** A throwaway sandbox created by "Entrar como visitante"; removed after a day. */
    @Column(nullable = false)
    private boolean demo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Organization() {
    }

    public Organization(String name, boolean demo) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.demo = demo;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public boolean isDemo() { return demo; }
    public Instant getCreatedAt() { return createdAt; }
}
