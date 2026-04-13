package com.accidentreport.rate;

import com.accidentreport.error.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class InMemoryRateLimiter {

    private final Map<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public void checkLimit(String key, int limit, Duration window, String message) {
        long now = System.currentTimeMillis();

        WindowCounter counter = counters.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.windowStartMillis >= window.toMillis()) {
                return new WindowCounter(now, 1);
            }
            existing.count += 1;
            return existing;
        });

        if (counter.count > limit) {
            throw new RateLimitExceededException(message);
        }
    }

    private static final class WindowCounter {
        private final long windowStartMillis;
        private int count;

        private WindowCounter(long windowStartMillis, int count) {
            this.windowStartMillis = windowStartMillis;
            this.count = count;
        }
    }
}
