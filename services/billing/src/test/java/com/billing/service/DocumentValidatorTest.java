package com.billing.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentValidatorTest {

    @Test
    void acceptsValidCpf() {
        assertTrue(DocumentValidator.isValid("52998224725"));
    }

    @Test
    void acceptsValidCnpj() {
        assertTrue(DocumentValidator.isValid("11222333000181"));
    }

    @Test
    void rejectsWrongCheckDigits() {
        assertFalse(DocumentValidator.isValid("52998224726"));
        assertFalse(DocumentValidator.isValid("11222333000182"));
    }

    @Test
    void rejectsRepeatedDigitsAndWrongLength() {
        assertFalse(DocumentValidator.isValid("11111111111"));
        assertFalse(DocumentValidator.isValid("1234"));
        assertFalse(DocumentValidator.isValid(""));
    }

    @Test
    void digitsOnlyRemovesMask() {
        assertEquals("52998224725", DocumentValidator.digitsOnly("529.982.247-25"));
    }
}
