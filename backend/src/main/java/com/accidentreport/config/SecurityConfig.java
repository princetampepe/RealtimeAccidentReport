package com.accidentreport.config;

import com.accidentreport.security.FirebaseAuthFilter;
import com.accidentreport.security.JsonAuthenticationEntryPoint;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   FirebaseAuthFilter firebaseAuthFilter,
                                                   JsonAuthenticationEntryPoint authenticationEntryPoint,
                                                   @Value("${app.security.require-auth:true}") boolean requireAuth) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/h2-console/**").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/accidents/**").permitAll();

                    if (requireAuth) {
                        auth.requestMatchers(HttpMethod.POST, "/api/accidents/**").authenticated();
                        auth.requestMatchers(HttpMethod.PUT, "/api/accidents/**").authenticated();
                        auth.requestMatchers(HttpMethod.DELETE, "/api/accidents/**").authenticated();
                    }

                    auth.anyRequest().permitAll();
                })
                .addFilterBefore(firebaseAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()));

        return http.build();
    }
}
