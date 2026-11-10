package com.billing.domain;

public enum Role {
    /** Can add and remove people of the company. The person who created the company is the first ADMIN. */
    ADMIN,
    /** Sees and edits the company's customers and invoices, but does not manage people. */
    MEMBER
}
