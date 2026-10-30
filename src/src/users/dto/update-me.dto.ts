import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';


export class UpdateMeDto {
  @IsOptional()
   @IsString() 
   @IsNotEmpty()
    firstName?: string;

  @IsOptional() 
  @IsString()
   @IsNotEmpty()
    lastName?: string;

    
  @IsOptional()
  @Matches(/^(\+963|009|09)\d+$/)
  Phone?: string;
}
