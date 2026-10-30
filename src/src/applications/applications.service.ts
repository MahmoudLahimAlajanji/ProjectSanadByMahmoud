import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApplicationStatus, Role } from '../generated/prisma/enums.js';
import { CacheVersionService } from '../common/cache/cache-version.service.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { PageDto, pageMeta } from '../common/pagination.dto.js';
import { CreateApplicationDto, ListApplicationsDto } from './dto/application.dto.js';
import { PRIVATE_DIR, filePath, removeFile } from '../common/upload/upload.js';

const publicSelect = {
  id: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  programId: true,
  cvOriginalName: true,
} satisfies Prisma.ApplicationSelect;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheVersionService,
  ) {}

  async apply(userId: number, dto: CreateApplicationDto, cv?: Express.Multer.File) {
    try {
      const program = await this.prisma.program.findFirst({
        where: { id: dto.programId, isActive: true },
        select: { id: true },
      });
      if (!program) throw new NotFoundException('Program not found');

      const application = await this.prisma.$transaction(async (tx) => {
        const seat = await tx.program.updateMany({
          where: { id: dto.programId,isActive:true, seatsLeft: { gt: 0 } },
          data: { seatsLeft: { decrement: 1 } },
        });
        if (seat.count === 0) throw new ConflictException('No seats left');
        return tx.application.create({
          data: {
            userId,
            programId: dto.programId,
            cvFile: cv?.filename,
            cvOriginalName: cv?.originalname,
          },
          select: publicSelect,
        });
      });
      await this.afterChange(dto.programId);
      return application;
    } catch (e) {
      await removeFile(PRIVATE_DIR, 'cv', cv?.filename); 
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You already applied to this program');
      }
      throw e;
    }
  }

  async my(userId: number, q: PageDto) {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          ...publicSelect,
          program: { select: { id: true, title: true, imageUrl: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { data, meta: pageMeta(total, q.page, q.limit) };
  }

  
  async list(user: AuthUser, q: ListApplicationsDto) {
    const where: Prisma.ApplicationWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.programId && { programId: q.programId }),
      ...(user.role === Role.SUPERVISOR && { program: { supervisorId: user.id } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          ...publicSelect,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          program: { select: { id: true, title: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { data, meta: pageMeta(total, q.page, q.limit) };
  }

  async cancel(id: number, userId: number) {
    const programId = await this.prisma.$transaction(async (tx) => {
      const r = await tx.application.updateMany({
        where: {
          id,
          userId,
          status: { in: [ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED] },
        },
        data: { status: ApplicationStatus.CANCELLED, decidedAt: new Date() },
      });
      if (r.count === 0) return null;
      const app = await tx.application.findUniqueOrThrow({
        where: { id },
        select: { programId: true },
      });
      
      await tx.program.update({
        where: { id: app.programId },
        data: { seatsLeft: { increment: 1 } },
      });
      return app.programId;
    });

    if (programId === null) {
      const exists = await this.prisma.application.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!exists) throw new NotFoundException('Application not found');
      throw new ConflictException(`Cannot cancel an application in status ${exists.status}`);
    }
    await this.afterChange(programId);
    return { id, status: ApplicationStatus.CANCELLED };
  }

  async decide(id: number, status: 'ACCEPTED' | 'REJECTED') {
    const programId = await this.prisma.$transaction(async (tx) => {
      // ذري: القرار بيتطبق مرة وحدة بس على طلب PENDING
      const r = await tx.application.updateMany({
        where: { id, status: ApplicationStatus.PENDING },
        data: { status, decidedAt: new Date() },
      });
      if (r.count === 0) return null;
      const app = await tx.application.findUniqueOrThrow({
        where: { id },
        select: { programId: true },
      });
      if (status === 'REJECTED') {
        await tx.program.update({
          where: { id: app.programId },
          data: { seatsLeft: { increment: 1 } }, // الرفض بيرجّع المقعد
        });
      }
      return app.programId;
    });

    if (programId === null) {
      const exists = await this.prisma.application.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!exists) throw new NotFoundException('Application not found');
      throw new ConflictException(`Application already ${exists.status}`);
    }
    await this.afterChange(programId);
    return { id, status };
  }

  async downloadCv(id: number, user: AuthUser) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      select: {
        userId: true,
        cvFile: true,
        cvOriginalName: true,
        program: { select: { supervisorId: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    const allowed =
      user.role === Role.ADMIN ||
      (user.role === Role.SUPERVISOR && app.program.supervisorId === user.id) ||
      (user.role === Role.YOUTH && app.userId === user.id);
    if (!allowed) throw new ForbiddenException();
    if (!app.cvFile) throw new NotFoundException('No CV attached');
    const path = filePath(PRIVATE_DIR, 'cv', app.cvFile);
    if (!existsSync(path)) throw new NotFoundException('File missing on disk');
    return new StreamableFile(createReadStream(path), {
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(app.cvOriginalName ?? 'cv')}`,
    });
  }

  // عدد المقاعد تغيّر، والإعلانات الخاصة بتتغير مع القبول: منبطل الكاش
  private async afterChange(programId: number) {
    await this.cache.invalidateProgram(programId);
    await this.cache.bump('announcements');
  }
}
