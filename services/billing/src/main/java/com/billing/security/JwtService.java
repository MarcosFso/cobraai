package com.billing.security;

import com.billing.domain.AppUser;
import com.billing.domain.Organization;
import org.springframework.lang.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final Duration ttl;

    public JwtService(JwtEncoder encoder, @Value("${app.jwt.ttl-hours}") long ttlHours) {
        this.encoder = encoder;
        this.ttl = Duration.ofHours(ttlHours);
    }

    /** The "org" claim is what every service uses to decide whose data a request may touch. */
    public String issue(AppUser user, @Nullable Organization org) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .issuer("billing-platform")
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("email", user.getEmail())
                .claim("demo", org != null && org.isDemo());
        if (org != null) { // a person not yet added to a company gets a token WITHOUT "org": the other services reject it
            builder.claim("org", org.getId().toString())
                    .claim("company", org.getName())
                    .claim("role", user.getRole().name());
        }
        JwtClaimsSet claims = builder.build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
