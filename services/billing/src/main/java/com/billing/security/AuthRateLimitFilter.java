package com.billing.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limits how many times one address can call the public auth endpoints per minute (fixed window, in memory).
 * It slows down password guessing and mass sign-ups. It is per instance: with several instances behind a load
 * balancer the shared state would have to move to Redis (documented in the README).
 * Behind Caddy the real address comes in X-Forwarded-For; the last entry is the one the proxy added itself.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000;

    private record Window(long start, int count) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Map<String, Integer> limits;
    private final Clock clock;

    @Autowired(required = false)
    public AuthRateLimitFilter(@Value("${app.rate-limit.login-per-minute:10}") int login,
                               @Value("${app.rate-limit.register-per-minute:10}") int register,
                               @Value("${app.rate-limit.demo-per-minute:20}") int demo) {
        this(login, register, demo, Clock.systemUTC());
    }

    AuthRateLimitFilter(int login, int register, int demo, Clock clock) {
        this.limits = Map.of("/auth/login", login, "/auth/register", register, "/auth/demo", demo);
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !limits.containsKey(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        long now = clock.millis();
        if (windows.size() > 10_000) {
            windows.values().removeIf(w -> now - w.start() >= WINDOW_MS);
        }
        int limit = limits.get(path);
        Window w = windows.compute(clientIp(request) + " " + path,
                (k, old) -> old == null || now - old.start() >= WINDOW_MS ? new Window(now, 1) : new Window(old.start(), old.count() + 1));
        if (w.count() > limit) {
            long retry = Math.max(1, (WINDOW_MS - (now - w.start()) + 999) / 1000);
            response.setStatus(429);
            response.setHeader("Retry-After", Long.toString(retry));
            response.setContentType("application/json;charset=UTF-8");
            response.getOutputStream().write(("{\"message\":\"Muitas tentativas. Espere " + retry + " segundos e tente de novo.\"}")
                    .getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(request, response);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] parts = forwarded.split(",");
            return parts[parts.length - 1].trim();
        }
        return request.getRemoteAddr();
    }
}
