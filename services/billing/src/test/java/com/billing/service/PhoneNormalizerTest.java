package com.billing.service;

import com.billing.error.BusinessRuleException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PhoneNormalizerTest {

    @Test
    void addsTheCountryCodeToDddPlusNumber() {
        assertEquals("5511912345678", PhoneNormalizer.normalize("(11) 91234-5678"));
        assertEquals("552134567890", PhoneNormalizer.normalize("(21) 3456-7890"));
    }

    @Test
    void keepsAnExistingCountryCode() {
        assertEquals("5511912345678", PhoneNormalizer.normalize("+55 (11) 91234-5678"));
    }

    @Test
    void emptyMeansNoPhone() {
        assertNull(PhoneNormalizer.normalize(null));
        assertNull(PhoneNormalizer.normalize("  "));
    }

    @Test
    void rejectsNumbersThatAreNotBrazilian() {
        assertThrows(BusinessRuleException.class, () -> PhoneNormalizer.normalize("123"));
        assertThrows(BusinessRuleException.class, () -> PhoneNormalizer.normalize("+1 202 555 0143"));
    }
}
