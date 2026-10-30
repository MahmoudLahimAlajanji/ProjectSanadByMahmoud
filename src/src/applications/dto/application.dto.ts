import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsEnum } from 'class-validator';
import { PageDto } from '../../common/pagination.dto.js';
import { ApplicationStatus } from '../../generated/prisma/enums.js';

export class CreateApplicationDto {
  
  @Type(() => Number) @IsInt() programId: number;
}

export class DecisionDto {
  @IsIn([ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED])
  status: 'ACCEPTED' | 'REJECTED';
}

export class ListApplicationsDto extends PageDto {

  @IsOptional()
   @IsEnum(ApplicationStatus) 
   status?: ApplicationStatus;

  @IsOptional()
   @Type(() => Number) 
   @IsInt()
    programId?: number;
}
