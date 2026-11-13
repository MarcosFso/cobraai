package com.billing.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class AuthRateLimitFilterTest {

    private int call(AuthRateLimitFilter f, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", path);
        req.setRequestURI(path);
        req.addHeader("X-Forwarded-For", ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, new MockFilterChain());
        return res.getStatus();
    }

    @Test
    void blocksAfterTheLimitAndAllowsAgainInTheNextMinute() throws Exception {
        long[] now = {1_000_000L};
        Clock clock = new Clock() {
            public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId z) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(now[0]); }
        };
        AuthRateLimitFilter f = new AuthRateLimitFilter(3, 3, 3, clock);
        for (int i = 0; i < 3; i++) assertThat(call(f, "/auth/login", "1.1.1.1")).isEqualTo(200);
        assertThat(call(f, "/auth/login", "1.1.1.1")).isEqualTo(429);
        assertThat(call(f, "/auth/login", "2.2.2.2")).as("outro endereço não é afetado").isEqualTo(200);
        assertThat(call(f, "/auth/register", "1.1.1.1")).as("cada rota tem seu limite").isEqualTo(200);
        now[0] += 61_000;
        assertThat(call(f, "/auth/login", "1.1.1.1")).isEqualTo(200);
    }

    @Test
    void ignoresAddressesTheClientForgedBeforeTheProxy() throws Exception {
        AuthRateLimitFilter f = new AuthRateLimitFilter(1, 1, 1, Clock.systemUTC());
        assertThat(call(f, "/auth/login", "9.9.9.9, 3.3.3.3")).isEqualTo(200);
        assertThat(call(f, "/auth/login", "8.8.8.8, 3.3.3.3")).isEqualTo(429);
    }
}
