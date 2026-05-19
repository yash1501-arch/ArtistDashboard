export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === options.attempts) break;

      const exponentialDelay = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * options.baseDelayMs);
      const delay = Math.min(options.maxDelayMs, exponentialDelay + jitter);

      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw lastError;
}
