package com.billing.security;

import com.billing.error.UnauthorizedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** The logged user, read from the verified token of the current request. */
@Component
public class CurrentUser {

    /** The company of the caller. Controllers pass this to the services; nothing else decides whose data is read. */
    public UUID orgId() {
        String org = jwt().getClaimAsString("org");
        if (org == null) {
            throw new UnauthorizedException("Token sem empresa");
        }
        return UUID.fromString(org);
    }

    public String email() {
        return jwt().getClaimAsString("email");
    }

    public String company() {
        return jwt().getClaimAsString("company");
    }

    public boolean demo() {
        return Boolean.TRUE.equals(jwt().getClaim("demo"));
    }

    private Jwt jwt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            return token.getToken();
        }
        throw new UnauthorizedException("Faça login para continuar");
    }
}
