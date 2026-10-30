import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ProgramsService } from './programs.service.js';
import {
  CreateMaterialDto,
   CreateProgramDto, 
  ListProgramsDto, UpdateProgramDto, 
} from './dto/program.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { PRIVATE_DIR, PUBLIC_DIR, removeFile, uploadOptions } from '../common/upload/upload.js';
import { PageDto } from '../common/pagination.dto.js';
import { CleanupFileOnError } from '../common/upload/cleanup-file-on-error.interceptor.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  // ---- متاح لكل مستخدم مسجّل ----
  @Get()
  list(@Query() q: ListProgramsDto) {
    return this.programs.list(q);
  }

  // لازم يكون قبل ':id' وإلا بيتفسّر "mine" كـ id ويرجع 400
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: PageDto) {
    return this.programs.listMine(user, q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.programs.findOne(id);
  }

  // ---- مشرف (برامجه) / أدمن ----
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProgramDto, @CurrentUser() user: AuthUser) {
    return this.programs.create(dto, user);
  }

  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProgramDto, @CurrentUser() user: AuthUser) {
    return this.programs.update(id, dto, user);
  }

  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.programs.remove(id, user);
  }

  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image', uploadOptions('image', PUBLIC_DIR, 'programs')), CleanupFileOnError)
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('image is required');
    try {
      return await this.programs.setImage(id, user, file.filename);
    } catch (e) {
      await removeFile(PUBLIC_DIR, 'programs', file.filename); // 403/404 => ما منخلّي ملف يتيم
      throw e;
    }
  }


  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/materials')
  @UseInterceptors(FileInterceptor('file', uploadOptions('material', PRIVATE_DIR, 'materials')), CleanupFileOnError)
  async addMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      return await this.programs.addMaterial(id, dto, file, user);
    } catch (e) {
      await removeFile(PRIVATE_DIR, 'materials', file?.filename);
      throw e;
    }
  }

  @Get(':id/materials')
  listMaterials(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.programs.listMaterials(id, user);
  }

  @Get(':id/materials/:materialId/download')
  download(
    @Param('id', ParseIntPipe) id: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.programs.downloadMaterial(id, materialId, user);
  }

  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @Delete(':id/materials/:materialId')
  removeMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.programs.removeMaterial(id, materialId, user);
  }
}
