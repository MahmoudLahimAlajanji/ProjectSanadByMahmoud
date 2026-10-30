import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

const VERSION_TTL = 60 * 60 * 1000; 

@Injectable()
export class CacheVersionService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async key(ns: string, ...parts: (string | number)[]) {
    const v = (await this.cache.get<number>(`ver:${ns}`)) ?? 0;
    return `${ns}:v${v}:${parts.join(':')}`;
  }

  async bump(ns: string) {
    await this.cache.set(`ver:${ns}`, Date.now(), VERSION_TTL);
  }

  get<T>(key: string) {
    return this.cache.get<T>(key);
  }

  set(key: string, value: unknown, ttlMs: number) {
    return this.cache.set(key, value, ttlMs);
  }

  del(key: string) {
    return this.cache.del(key);
  }

  /** أي تغيير ببرنامج (تعديل، مقعد، جلسة...) لازم يمر من هون */
  async invalidateProgram(id: number) {
    await this.del(`program:${id}`);
    await this.bump('programs'); // كل صفحات الـ list/search
  }
}
