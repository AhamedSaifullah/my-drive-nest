import {
	IsDateString,
	IsEmail,
	IsOptional,
	IsString,
	Matches,
	MinLength,
} from 'class-validator';

export class UpdateUserDto {
	@IsOptional()
	@IsString()
	firstName?: string;

	@IsOptional()
	@IsString()
	lastName?: string;

	@IsOptional()
	@IsDateString()
	dob?: string;

	@IsOptional()
	@IsString()
	gender?: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	@Matches(/^\+?[1-9]\d{7,14}$/, {
		message: 'phone must be a valid international phone number',
	})
	phone?: string;

	@IsOptional()
	@IsString()
	@MinLength(8)
	password?: string;

	@IsOptional()
	@IsString()
	@MinLength(8)
	conf_password?: string;
}
