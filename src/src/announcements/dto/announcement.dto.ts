import { PartialType, OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAnnouncementDto {

  @IsString()
   @IsNotEmpty()
    title: string;

  @IsString()
   @IsNotEmpty() 
   content: string;

  
  @IsOptional()
   @Type(() => Number) 
   @IsInt()
  programId?: number;
}

export class UpdateAnnouncementDto extends PartialType(
  OmitType(CreateAnnouncementDto, ['programId'] as const),
) {}
