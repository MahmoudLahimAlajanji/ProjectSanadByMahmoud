import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApplicationsService } from './applications.service.js';
import { CreateApplicationDto, DecisionDto, ListApplicationsDto } from './dto/application.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { PageDto } from '../common/pagination.dto.js';
import { PRIVATE_DIR, uploadOptions } from '../common/upload/upload.js';
import { CleanupFileOnError } from '../common/upload/cleanup-file-on-error.interceptor.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  
  @Roles(Role.YOUTH)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FileInterceptor('cv', uploadOptions('cv', PRIVATE_DIR, 'cv')), CleanupFileOnError)
  apply(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateApplicationDto,
    @UploadedFile() cv?: Express.Multer.File,
  )
   {
    return this.apps.apply(userId, dto, cv);
  }

  
  @Roles(Role.YOUTH)
  @Get('my')
  my(@CurrentUser('id') userId: number, @Query() q: PageDto) {
    return this.apps.my(userId, q);
  }

  @Roles(Role.YOUTH)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.apps.cancel(id, userId);
  }

  
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListApplicationsDto) {
    return this.apps.list(user, q);
  }

  
  @Roles(Role.ADMIN)
  @Patch(':id/decision')
  decide(@Param('id', ParseIntPipe) id: number, @Body() dto: DecisionDto) {
    return this.apps.decide(id, dto.status);
  }

  
  @Get(':id/cv')
  cv(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.apps.downloadCv(id, user);
  }
}
