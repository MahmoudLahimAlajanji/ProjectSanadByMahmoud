import { Injectable } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateSupervisorDto } from './dto/create-supervisor.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { pageMeta } from '../common/pagination.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  createSupervisor(dto: CreateSupervisorDto) {
    return this.auth.createUser(dto, Role.SUPERVISOR);
  }

  async list(q: ListUsersDto) {
    const where = q.role ? { role: q.role } : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { id: 'desc' },
        omit: { password: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: pageMeta(total, q.page, q.limit) };
  }

  updateMe(id: number, dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      omit: { password: true },
    });
  }
}
