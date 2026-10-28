export class RateLimit {
  private readonly entries = new Map<string, { count: number; expires: number }>();
  constructor(
    private readonly maximum: number,
    private readonly intervalMs = 60000,
    private readonly now = Date.now,
  ) {}
  allow(key: string): boolean {
    const now = this.now();
    for (const [id, value] of this.entries) if (value.expires <= now) this.entries.delete(id);
    const entry = this.entries.get(key);
    if (entry) {
      entry.count++;
      return entry.count <= this.maximum;
    }
    if (this.entries.size >= 1000) return false;
    this.entries.set(key, { count: 1, expires: now + this.intervalMs });
    return true;
  }
}
