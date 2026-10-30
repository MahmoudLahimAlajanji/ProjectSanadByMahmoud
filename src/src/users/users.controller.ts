import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateSupervisorDto } from './dto/create-supervisor.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN)
  @Post('supervisors')
  createSupervisor(@Body() dto: CreateSupervisorDto) {
    return this.users.createSupervisor(dto);
  }

  @Roles(Role.ADMIN)
  @Get()
  list(@Query() q: ListUsersDto) {
    return this.users.list(q);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') id: number, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(id, dto);
  }
}
