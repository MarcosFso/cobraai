package com.billing.security;

import com.billing.domain.AppUser;
import com.billing.domain.Role;
import com.billing.domain.UserRepository;
import com.billing.error.ForbiddenException;
import com.billing.error.UnauthorizedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * The logged user. The token proves who the person is, but the company and the role are confirmed against the
 * database on every request: someone removed from a company loses access to this service immediately, even
 * while their old token is still valid.
 */
@Component
public class CurrentUser {

    private final UserRepository users;

    public CurrentUser(UserRepository users) {
        this.users = users;
    }

    /** The company of the caller. Controllers pass this to the services; nothing else decides whose data is read. */
    public UUID orgId() {
        return member().getOrgId();
    }

    /** The caller, who must belong to the company named in the token. */
    public AppUser member() {
        AppUser user = user();
        if (user.isMustChangePassword()) { // an administrator reset the password: even an older, still valid token stops here
            throw new UnauthorizedException("A sua senha foi redefinida. Entre de novo e escolha uma nova.");
        }
        String claim = jwt().getClaimAsString("org");
        if (claim == null || user.getOrgId() == null || !claim.equals(user.getOrgId().toString())) {
            throw new UnauthorizedException("Sem acesso a uma empresa. Entre de novo.");
        }
        return user;
    }

    /** The caller, who must be an administrator of the company named in the token. */
    public AppUser admin() {
        AppUser user = member();
        if (user.getRole() != Role.ADMIN) {
            throw new ForbiddenException("Só o administrador da empresa pode fazer isso");
        }
        return user;
    }

    /** The caller's account, even when it does not belong to any company yet. */
    public AppUser user() {
        UUID id;
        try {
            id = UUID.fromString(jwt().getSubject());
        } catch (IllegalArgumentException e) {
            throw new UnauthorizedException("Faça login para continuar");
        }
        return users.findById(id).orElseThrow(() -> new UnauthorizedException("Conta não encontrada. Entre de novo."));
    }

    /** The company name as it was when the token was issued. */
    public String tokenOrg() {
        return jwt().getClaimAsString("org");
    }

    public String tokenRole() {
        return jwt().getClaimAsString("role");
    }

    private Jwt jwt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token) {
            return token.getToken();
        }
        throw new UnauthorizedException("Faça login para continuar");
    }
}
