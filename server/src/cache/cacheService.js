/**
 * ActionFlow Server — Cache Service
 * Redis-backed cache with safe in-memory fallback.
 * Used for: normalization results, directory lookups,
 * LLM response caching (non-personal), classification results.
 */

import { config } from '../config.js';

// ─── In-Memory Fallback Store ─────────────────────────────────────────────────
class InMemoryCache {
  constructor() {
    this._store = new Map();
    this._expiry = new Map();
  }

  async get(key) {
    const exp = this._expiry.get(key);
    if (exp && Date.now() > exp) {
      this._store.delete(key);
      this._expiry.delete(key);
      return null;
    }
    return this._store.get(key) ?? null;
  }

  async set(key, value, ttlSeconds = 300) {
    this._store.set(key, value);
    if (ttlSeconds > 0) {
      this._expiry.set(key, Date.now() + ttlSeconds * 1000);
    }
  }

  async del(key) {
    this._store.delete(key);
    this._expiry.delete(key);
  }

  async flush() {
    this._store.clear();
    this._expiry.clear();
  }

  get size() { return this._store.size; }
  get type() { return 'memory'; }
}

// ─── Redis Client (lazy-loaded) ───────────────────────────────────────────────
class RedisCache {
  constructor(redisClient) {
    this._client = redisClient;
  }

  async get(key) {
    try {
      const raw = await this._client.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this._client.setex(key, ttlSeconds, serialized);
      } else {
        await this._client.set(key, serialized);
      }
    } catch (err) {
      console.warn('[Cache] Redis set failed:', err.message);
    }
  }

  async del(key) {
    try {
      await this._client.del(key);
    } catch { /* silent */ }
  }

  async flush() {
    try {
      await this._client.flushdb();
    } catch { /* silent */ }
  }

  get type() { return 'redis'; }
}

// ─── Cache Service Factory ────────────────────────────────────────────────────
class CacheService {
  constructor() {
    this._cache = new InMemoryCache();
    this._redisConnected = false;
    this._stats = { hits: 0, misses: 0, sets: 0 };
  }

  async initialize() {
    if (!config.redis.isAvailable) {
      console.log('[Cache] Redis connected:', false);
      return;
    }

    let client = null;
    try {
      // Dynamic import to avoid crash when ioredis is not installed
      const { default: Redis } = await import('ioredis');
      client = new Redis(config.redis.url, {
        maxRetriesPerRequest: 2,
        connectTimeout: 4000,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null; // Stop reconnecting after 3 attempts
          return Math.min(times * 1000, 3000);
        }
      });

      // Handle Redis errors to prevent unhandled EventEmitter crashes
      client.on('error', (err) => {
        console.warn('[Cache] Redis error:', err.message);
      });

      await client.connect();
      this._cache = new RedisCache(client);
      this._redisConnected = true;
      console.log('[Cache] Redis connected:', true);
    } catch (err) {
      console.log('[Cache] Redis connected:', false);
      if (client) {
        try {
          client.disconnect();
        } catch { /* silent */ }
      }
      this._cache = new InMemoryCache();
      this._redisConnected = false;
    }
  }

  /**
   * Get a cached value
   */
  async get(key) {
    const value = await this._cache.get(key);
    if (value !== null) {
      this._stats.hits++;
    } else {
      this._stats.misses++;
    }
    return value;
  }

  /**
   * Set a cached value with optional TTL (seconds)
   */
  async set(key, value, ttlSeconds = config.redis.cacheTtlSeconds) {
    this._stats.sets++;
    await this._cache.set(key, value, ttlSeconds);
  }

  async del(key) {
    await this._cache.del(key);
  }

  async flush() {
    await this._cache.flush();
  }

  getStats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      ...this._stats,
      hitRate: total > 0 ? Number((this._stats.hits / total).toFixed(3)) : 0,
      backendType: this._cache.type
    };
  }

  /**
   * Cache key builders — ensures consistent namespacing
   */
  static keys = {
    normalization: (hash) => `af:norm:${hash}`,
    classification: (hash) => `af:class:${hash}`,
    geminiResponse: (hash) => `af:gemini:${hash}`,
    directory: (tenantId) => `af:dir:${tenantId}`,
    projects: (tenantId) => `af:proj:${tenantId}`
  };
}

export const cacheService = new CacheService();

/**
 * Simple string hash for cache key generation
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}
