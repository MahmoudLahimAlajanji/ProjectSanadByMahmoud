import { IsEnum, IsOptional } from 'class-validator';
import { PageDto } from '../../common/pagination.dto.js';
import { Role } from '../../generated/prisma/enums.js';

export class ListUsersDto extends PageDto {
  @IsOptional() 
  @IsEnum(Role)
   role?: Role;
}
