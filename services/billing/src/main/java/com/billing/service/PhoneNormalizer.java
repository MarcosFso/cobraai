package com.billing.service;

import com.billing.error.BusinessRuleException;

/** Brazilian phone numbers, stored as digits with the country code (55) so a WhatsApp link can be built from them. */
public final class PhoneNormalizer {

    private PhoneNormalizer() {
    }

    /** Returns null for an empty value; throws for one that is not a Brazilian number. */
    public static String normalize(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            return null;
        }
        if (digits.length() == 10 || digits.length() == 11) {
            digits = "55" + digits; // DDD + number: add the country code
        }
        // 55 + DDD (2 digits, no zeros) + 9 digits starting with 9 (mobile) or 8 digits starting with 2-5 (landline)
        if (!digits.matches("^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$")) {
            throw new BusinessRuleException("Telefone inválido. Use o DDD e o número, por exemplo (11) 91234-5678");
        }
        return digits;
    }
}
