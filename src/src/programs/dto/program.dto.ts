import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { PageDto } from '../../common/pagination.dto.js';

export class CreateProgramDto {
  @IsString()
   @IsNotEmpty() 
   title: string;

  @IsString()
   @IsNotEmpty() 
   description: string;

  @Type(() => Number) @IsInt() @Min(1)
  seats: number;

  @Type(() => Date) @IsDate() startsAt: Date;

@IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;

@IsOptional() @IsString() @IsNotEmpty() location?: string;

@IsOptional() @IsUrl() onlineUrl?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  supervisorId?: number;
}

export class UpdateProgramDto extends PartialType(
  OmitType(CreateProgramDto, ['supervisorId'] as const),
) {}

export class ListProgramsDto extends PageDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['id', 'title', 'createdAt', 'seatsLeft'])
  sortBy: 'id' | 'title' | 'createdAt' | 'seatsLeft' = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}


export class CreateMaterialDto {
  @IsString() @IsNotEmpty() title: string;
}


