package com.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class AppUser {

    @Id
    private UUID id;

    /** Null while the person has an account but no administrator has added them to a company yet. */
    @Column(name = "org_id")
    private UUID orgId;

    @Column(nullable = false, length = 160)
    private String email;

    /** BCrypt hash. The password itself is never stored or logged. */
    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Role role;

    /** True after an administrator reset the password: the person must choose a new one before anything else. */
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AppUser() {
    }

    public AppUser(UUID orgId, Role role, String email, String passwordHash) {
        this.id = UUID.randomUUID();
        this.orgId = orgId;
        this.role = role;
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdAt = Instant.now();
    }

    /** An administrator adds this person to their company. */
    public void joinOrg(UUID orgId, Role role) {
        this.orgId = orgId;
        this.role = role;
    }

    /** Removed from the company: the account stays, without access to any data. */
    public void leaveOrg() {
        this.orgId = null;
        this.role = Role.MEMBER;
    }

    public void changeRole(Role role) { this.role = role; }

    /** The administrator's reset: a temporary password that has to be replaced at the next login. */
    public void resetPassword(String newHash) {
        this.passwordHash = newHash;
        this.mustChangePassword = true;
    }

    /** The person chose their own password. */
    public void changePassword(String newHash) {
        this.passwordHash = newHash;
        this.mustChangePassword = false;
    }

    public boolean isMustChangePassword() { return mustChangePassword; }

    public UUID getId() { return id; }
    public UUID getOrgId() { return orgId; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public Instant getCreatedAt() { return createdAt; }
}
