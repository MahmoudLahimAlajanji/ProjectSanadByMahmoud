import { Global, Module } from '@nestjs/common';
import { CacheVersionService } from './cache-version.service.js';

@Global()
@Module({ providers: [CacheVersionService], exports: [CacheVersionService] })
export class AppCacheModule {}
