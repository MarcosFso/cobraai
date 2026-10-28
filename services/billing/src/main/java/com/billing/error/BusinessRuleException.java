package com.billing.error;

/** Mapped to 400 Bad Request (e.g. due date in the past, invalid CPF/CNPJ). */
public class BusinessRuleException extends RuntimeException {

    public BusinessRuleException(String message) {
        super(message);
    }
}
