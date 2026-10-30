import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  
  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: skipping admin seed');
      return;
    }
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) return;
    await this.prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'Sanad',
        email,
        username: this.config.get<string>('ADMIN_USERNAME') ?? 'admin',
        password: await bcrypt.hash(password, 10),
        role: Role.ADMIN,
      },
    });
    this.logger.log(`Admin seeded: ${email}`);
  }
}
