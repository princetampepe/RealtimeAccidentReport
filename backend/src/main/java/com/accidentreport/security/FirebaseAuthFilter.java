package com.accidentreport.security;

import com.accidentreport.error.ApiErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class FirebaseAuthFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;
    private final boolean firebaseEnabled;
    private final boolean requireAuth;

    public FirebaseAuthFilter(ObjectMapper objectMapper,
                              @Value("${firebase.enabled:false}") boolean firebaseEnabled,
                              @Value("${app.security.require-auth:true}") boolean requireAuth) {
        this.objectMapper = objectMapper;
        this.firebaseEnabled = firebaseEnabled;
        this.requireAuth = requireAuth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7).trim();
        if (!StringUtils.hasText(token)) {
            writeUnauthorized(response, request.getRequestURI(), "Missing bearer token");
            return;
        }

        if (!firebaseEnabled) {
            if (requireAuth) {
                writeUnauthorized(response, request.getRequestURI(), "Token verification is unavailable because firebase.enabled=false");
                return;
            }
            filterChain.doFilter(request, response);
            return;
        }

        try {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);

            String role = String.valueOf(decoded.getClaims().getOrDefault("role", "USER"));
            boolean adminClaim = Boolean.TRUE.equals(decoded.getClaims().get("admin"));
            boolean admin = adminClaim || "ADMIN".equalsIgnoreCase(role);

            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(Locale.ROOT)));
            if (admin) {
                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            }

            AuthenticatedUser principal = new AuthenticatedUser(decoded.getUid(), decoded.getEmail(), admin);
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(principal, token, authorities);
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);

            filterChain.doFilter(request, response);
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            writeUnauthorized(response, request.getRequestURI(), "Invalid or expired Firebase token");
        }
    }

    private void writeUnauthorized(HttpServletResponse response, String path, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        ApiErrorResponse payload = new ApiErrorResponse(
                Instant.now(),
                HttpServletResponse.SC_UNAUTHORIZED,
                "Unauthorized",
                message,
                path,
                null
        );
        response.getWriter().write(objectMapper.writeValueAsString(payload));
    }
}
