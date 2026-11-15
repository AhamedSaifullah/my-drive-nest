import {
	IsDateString,
	IsEmail,
	IsNotEmpty,
	IsString,
	Matches,
	MinLength,
} from 'class-validator';

export class CreateUserDto {
	@IsString()
	@IsNotEmpty()
	firstName!: string;

	@IsString()
	@IsNotEmpty()
	lastName!: string;

	@IsDateString()
	dob!: string;

	@IsString()
	@IsNotEmpty()
	gender!: string;

	@IsEmail()
	email!: string;

	@IsString()
	@Matches(/^\+?[1-9]\d{7,14}$/, {
		message: 'phone must be a valid international phone number',
	})
	phone!: string;

	@IsString()
	@MinLength(8)
	password!: string;

	@IsString()
	@MinLength(8)
	conf_password!: string;
}
