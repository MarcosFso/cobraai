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

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 14, unique = true)
    private String document;

    @Column(nullable = false, length = 160)
    private String email;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Customer() {
    }

    public Customer(String name, String document, String email) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.document = document;
        this.email = email;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDocument() { return document; }
    public String getEmail() { return email; }
    public Instant getCreatedAt() { return createdAt; }
}
