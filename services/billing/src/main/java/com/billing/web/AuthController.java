package com.billing.web;

import com.billing.domain.AppUser;
import com.billing.security.CurrentUser;
import com.billing.service.AuthService;
import com.billing.web.Dtos.AuthResponse;
import com.billing.web.Dtos.ChangePasswordRequest;
import com.billing.web.Dtos.LoginRequest;
import com.billing.web.Dtos.MeResponse;
import com.billing.web.Dtos.RegisterRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService auth;
    private final CurrentUser currentUser;

    public AuthController(AuthService auth, CurrentUser currentUser) {
        this.auth = auth;
        this.currentUser = currentUser;
    }

    /** Creates a company and its first user. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return AuthResponse.from(auth.register(request.company(), request.email(), request.password()));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return AuthResponse.from(auth.login(request.email(), request.password()));
    }

    /** "Entrar como visitante": a fresh sandbox company with sample data. */
    @PostMapping("/demo")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse demo() {
        return AuthResponse.from(auth.startDemo());
    }

    /** The person chooses a new password (also how a temporary password set by an administrator is replaced). */
    @PostMapping("/password")
    public AuthResponse changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        return AuthResponse.from(auth.changePassword(currentUser.user().getId(), request.currentPassword(), request.newPassword()));
    }

    @GetMapping("/me")
    public MeResponse me() {
        AppUser user = currentUser.user();
        AuthService.AuthResult fresh = auth.refresh(user.getId());
        String org = user.getOrgId() == null ? null : user.getOrgId().toString();
        boolean stale = !java.util.Objects.equals(currentUser.tokenOrg(), org)
                || !java.util.Objects.equals(currentUser.tokenRole(), fresh.role());
        return new MeResponse(fresh.email(), fresh.company(), fresh.demo(), fresh.role(), fresh.pending(),
                fresh.mustChangePassword(), stale ? fresh.token() : null);
    }
}
