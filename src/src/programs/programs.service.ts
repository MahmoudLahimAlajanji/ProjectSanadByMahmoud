import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';

  import { PageDto, pageMeta } from '../common/pagination.dto.js';

import { createReadStream, existsSync } from 'fs';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { CacheVersionService } from '../common/cache/cache-version.service.js';
import { Role, ApplicationStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  CreateMaterialDto,
  CreateProgramDto,
  ListProgramsDto,
  UpdateProgramDto,
} from './dto/program.dto.js';
import {
  PRIVATE_DIR,
  PUBLIC_DIR,
  filePath,
  removeFile,
} from '../common/upload/upload.js';

const LIST_TTL = 30_000;
const DETAIL_TTL = 30_000;

// ما منرجّع password أبدًا: منختار حقول المشرف يدويًا (بدل include: { teacher: true })
const supervisorSelect = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheVersionService,
  ) {}

  
  async list(q: ListProgramsDto) {
    const key = await this.cache.key(
      'programs',
      JSON.stringify([q.page, q.limit, q.search ?? '', q.sortBy, q.sortOrder]),
    );
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const where = {
      isActive: true,
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' as const } },
          { description: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { [q.sortBy]: q.sortOrder },
        select: {
          id: true, title: true, description: true, imageUrl: true,
          seats: true, seatsLeft: true, createdAt: true,startsAt:true,endsAt:true,location:true,onlineUrl:true,
          supervisor: { select: supervisorSelect },
        },
      }),
      this.prisma.program.count({ where }),
    ]);
    const result = { data, meta: pageMeta(total, q.page, q.limit) };
    await this.cache.set(key, result, LIST_TTL);
    return result;
  }

  async findOne(id: number) {
    const key = `program:${id}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const program = await this.prisma.program.findFirst({
      where: { id, isActive: true },
      select: {
        id: true, title: true, description: true, imageUrl: true,
        seats: true, seatsLeft: true, createdAt: true,startsAt:true,endsAt:true,location:true,onlineUrl:true,
        supervisor: { select: supervisorSelect },
      },
    });
    if (!program) throw new NotFoundException('Program not found');
    await this.cache.set(key, program, DETAIL_TTL);
    return program;
  }


  async assertCanManage(programId: number, user: AuthUser) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      select: {
        id: true, supervisorId: true, isActive: true, seats: true, imageUrl: true,
        startsAt: true, endsAt: true,
      },
    });
    if (!program) throw new NotFoundException('Program not found');
    if (user.role !== Role.ADMIN && program.supervisorId !== user.id) {
      throw new ForbiddenException('This program belongs to another supervisor');
    }
    return program;
  }

  async create(dto: CreateProgramDto, user: AuthUser) {
    this.checkSession(dto, true);
    let supervisorId = user.id;
    if (user.role === Role.ADMIN) {
      if (!dto.supervisorId) throw new BadRequestException('supervisorId is required for admin');
      const sup = await this.prisma.user.findFirst({
        where: { id: dto.supervisorId, role: Role.SUPERVISOR },
        select: { id: true },
      });
      if (!sup) throw new BadRequestException('supervisorId is not a supervisor');
      supervisorId = sup.id;
    }
    const program = await this.prisma.program.create({
      data: {
        startsAt: dto.startsAt,
         endsAt: dto.endsAt, 
         location: dto.location,
         onlineUrl: dto.onlineUrl,
        title: dto.title,
        description: dto.description,
        seats: dto.seats,
        seatsLeft: dto.seats,
        supervisorId,
      },
    });
    await this.cache.bump('programs');
    return program;
  }

  async update(id: number, dto: UpdateProgramDto, user: AuthUser) {
    const current = await this.assertCanManage(id, user);
    const { seats, ...rest } = dto;

    
    this.checkSession(
      { startsAt: dto.startsAt ?? current.startsAt, endsAt: dto.endsAt ?? current.endsAt ?? undefined },
      false,
    );

    if (seats !== undefined && seats !== current.seats) {
      
      const delta = seats - current.seats;
      const r = await this.prisma.program.updateMany({
        where: { id, seats: current.seats, seatsLeft: { gte: -delta } },
        data: { seats, seatsLeft: { increment: delta } },
      });
      if (r.count === 0) {
        throw new ConflictException(
          'Cannot reduce seats below the number already reserved (or seats changed concurrently)',
        );
      }
    }
    if (Object.keys(rest).length) {
      await this.prisma.program.update({ where: { id }, data: rest });
    }
    await this.cache.invalidateProgram(id);
    return this.prisma.program.findUnique({ where: { id } });
  }

  async remove(id: number, user: AuthUser) {
    await this.assertCanManage(id, user);
    
    await this.prisma.program.update({ where: { id }, data: { isActive: false } });
    await this.cache.invalidateProgram(id);
    return { id, archived: true };
  }

  async setImage(id: number, user: AuthUser, fileName: string) {
    const program = await this.assertCanManage(id, user);
    const updated = await this.prisma.program.update({
      where: { id },
      data: { imageUrl: `/uploads/programs/${fileName}` },
    });
    
    if (program.imageUrl) {
      await removeFile(PUBLIC_DIR, 'programs', program.imageUrl.split('/').pop());
    }
    await this.cache.invalidateProgram(id);
    return updated;
  }


  private checkSession(dto: { startsAt?: Date; endsAt?: Date; location?: string; onlineUrl?: string }, full: boolean) {
    if (full && !dto.location && !dto.onlineUrl) {
      throw new BadRequestException('Provide location or onlineUrl');
    }
    if (dto.startsAt && dto.endsAt && dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }


  // ---------- المواد ----------
  private async assertCanReadMaterials(programId: number, user: AuthUser) {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.SUPERVISOR) {
      await this.assertCanManage(programId, user);
      return;
    }
    const accepted = await this.prisma.application.findFirst({
      where: { userId: user.id, programId, status: ApplicationStatus.ACCEPTED },
      select: { id: true },
    });
    if (!accepted) {
      throw new ForbiddenException('Materials are available after your application is accepted');
    }
  }

  async listMine(user: AuthUser, q: PageDto) {
    const where = user.role === Role.ADMIN ? {} : { supervisorId: user.id };
    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, imageUrl: true, isActive: true,
          seats: true, seatsLeft: true, startsAt: true, endsAt: true,
          location: true, onlineUrl: true,
          _count: { select: { applications: true } },
        },
      }),
      this.prisma.program.count({ where }),
    ]);
    return { data, meta: pageMeta(total, q.page, q.limit) };
  }
  async addMaterial(programId: number, dto: CreateMaterialDto, file: Express.Multer.File | undefined, user: AuthUser) {
    await this.assertCanManage(programId, user);
    if (!file) throw new BadRequestException('file is required');
    return this.prisma.material.create({
      data: {
        programId,
        title: dto.title,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
      },
      omit: { fileName: true },
    });
  }

  async listMaterials(programId: number, user: AuthUser) {
    await this.assertCanReadMaterials(programId, user);
    return this.prisma.material.findMany({
      where: { programId },
      orderBy: { createdAt: 'desc' },
      omit: { fileName: true },
    });
  }

  async downloadMaterial(programId: number, materialId: number, user: AuthUser) {
    await this.assertCanReadMaterials(programId, user);
    const m = await this.prisma.material.findFirst({ where: { id: materialId, programId } });
    if (!m) throw new NotFoundException('Material not found');
    const path = filePath(PRIVATE_DIR, 'materials', m.fileName);
    if (!existsSync(path)) throw new NotFoundException('File missing on disk');
    return new StreamableFile(createReadStream(path), {
      type: m.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(m.originalName)}`,
    });
  }

  async removeMaterial(programId: number, materialId: number, user: AuthUser) {
  await this.assertCanManage(programId, user);
  const m = await this.prisma.material.findFirst({ where: { id: materialId, programId } });
  if (!m) throw new NotFoundException('Material not found');
  await this.prisma.material.delete({ where: { id: m.id } });
  await removeFile(PRIVATE_DIR, 'materials', m.fileName);
  return { deleted: true };
}

}
