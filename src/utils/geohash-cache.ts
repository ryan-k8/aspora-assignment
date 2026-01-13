export interface ICache<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache<T> implements ICache<T> {
  private cache = new Map<string, { value: T; expires: number }>();

  async get(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: T, ttlMs = 10 * 60 * 1000): Promise<void> {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
