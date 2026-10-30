import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApplicationStatus, Role } from '../generated/prisma/enums.js';
import { CacheVersionService } from '../common/cache/cache-version.service.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { PageDto, pageMeta } from '../common/pagination.dto.js';
import { ProgramsService } from '../programs/programs.service.js';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto.js';

const TTL = 30_000; // الكاش بينبطل فورًا بأي تعديل (bump)، فالـ TTL بس شبكة أمان

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheVersionService,
    private readonly programs: ProgramsService,
  ) {}

  async list(user: AuthUser, q: PageDto) {
    
    const key = await this.cache.key('announcements', user.id, q.page, q.limit);
    const cached = await this.cache.get(key);
    if (cached) return cached;

    let where: Prisma.AnnouncementWhereInput = {};
    if (user.role === Role.YOUTH) {
      where = {
        OR: [
          { programId: null },
          {
            program: {
              applications: { some: { userId: user.id, status: ApplicationStatus.ACCEPTED } },
            },
          },
        ],
      };
    } else if (user.role === Role.SUPERVISOR) {
      where = { 
        OR: 
        [{ programId: null }, 
          { program: { supervisorId: user.id } }
        ] };
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, content: true, createdAt: true,
          program: { select: { id: true, title: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    const result = { data, meta: pageMeta(total, q.page, q.limit) };
    await this.cache.set(key, result, TTL);
    return result;
  }

  async create(dto: CreateAnnouncementDto, user: AuthUser) {
    if (user.role === Role.SUPERVISOR && !dto.programId) {
      throw new ForbiddenException('Only admins can publish general announcements');
    }
    if (dto.programId) {
      await this.programs.assertCanManage(dto.programId, user); 
    }
    const a = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        programId: dto.programId ?? null,
        authorId: user.id,
      },
    });
    await this.cache.bump('announcements');
    return a;
  }

  private async assertCanEdit(id: number, user: AuthUser) {
    const a = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });
    if (!a) throw new NotFoundException('Announcement not found');
    if (user.role === Role.ADMIN) return;
    if (!a.programId) throw new ForbiddenException('General announcements are admin-only');
    await this.programs.assertCanManage(a.programId, user);
    
  }

  async update(id: number, dto: UpdateAnnouncementDto, user: AuthUser) {
    await this.assertCanEdit(id, user);
    const a = await this.prisma.announcement.update({ where: { id }, data: dto });
    await this.cache.bump('announcements'); 
    return a;
  }

  async remove(id: number, user: AuthUser) {
    await this.assertCanEdit(id, user);
    await this.prisma.announcement.delete({ where: { id } });
    await this.cache.bump('announcements');
    return { deleted: true };
  }
}
