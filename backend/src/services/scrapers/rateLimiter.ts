export class RateLimiter {
  private lastRunAt = 0;

  constructor(private readonly minDelayMs: number) {}

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRunAt;
    const remaining = this.minDelayMs - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, remaining);
      });
    }

    this.lastRunAt = Date.now();
  }
}
