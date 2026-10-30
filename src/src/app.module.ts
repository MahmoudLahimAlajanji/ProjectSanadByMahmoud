import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { AppCacheModule } from './common/cache/cache.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ProgramsModule } from './programs/programs.module.js';
import { ApplicationsModule } from './applications/applications.module.js';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { SeedModule } from './seed/seed.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 100 }],
  skipIf: () => process.env.THROTTLE_DISABLED === 'true',
}),
    CacheModule.register({ isGlobal: true, ttl: 30_000 }),
    PrismaModule,
    AppCacheModule,
    AuthModule,
    UsersModule,
    ProgramsModule,
    ApplicationsModule,
    AnnouncementsModule,
    SeedModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
