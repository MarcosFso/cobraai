package com.billing.service;

/** Validates CPF (11 digits) and CNPJ (14 digits) using their check digits. */
public final class DocumentValidator {

    private static final int[] CNPJ_W1 = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
    private static final int[] CNPJ_W2 = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};

    private DocumentValidator() {
    }

    /** Keeps only the digits ("123.456.789-09" -> "12345678909"). */
    public static String digitsOnly(String raw) {
        return raw == null ? "" : raw.replaceAll("\\D", "");
    }

    public static boolean isValid(String digits) {
        if (digits == null || !digits.matches("\\d+") || digits.chars().distinct().count() == 1) {
            return false;
        }
        return switch (digits.length()) {
            case 11 -> isValidCpf(digits);
            case 14 -> isValidCnpj(digits);
            default -> false;
        };
    }

    private static boolean isValidCpf(String d) {
        return cpfDigit(d, 9) == d.charAt(9) - '0' && cpfDigit(d, 10) == d.charAt(10) - '0';
    }

    private static int cpfDigit(String d, int length) {
        int sum = 0;
        for (int i = 0; i < length; i++) {
            sum += (d.charAt(i) - '0') * (length + 1 - i);
        }
        int result = (sum * 10) % 11;
        return result == 10 ? 0 : result;
    }

    private static boolean isValidCnpj(String d) {
        return cnpjDigit(d, CNPJ_W1) == d.charAt(12) - '0' && cnpjDigit(d, CNPJ_W2) == d.charAt(13) - '0';
    }

    private static int cnpjDigit(String d, int[] weights) {
        int sum = 0;
        for (int i = 0; i < weights.length; i++) {
            sum += (d.charAt(i) - '0') * weights[i];
        }
        int rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    }
}
