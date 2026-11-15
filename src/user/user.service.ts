import {
	ConflictException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { Logger } from '@nestjs/common';

@Injectable()
export class UserService {
	constructor(
		@InjectModel(User.name) private readonly userModel: Model<UserDocument>,
		private readonly jwtService: JwtService,
	) {}

	private readonly logger = new Logger(UserService.name);

	async create(createUserDto: CreateUserDto) {
		this.logger.log('createUserDto::::inside');
		if (createUserDto.password !== createUserDto.conf_password) {
			throw new ConflictException(
				'password and conf_password must match',
			);
		}

		const email = createUserDto.email.toLowerCase().trim();
		const phone = createUserDto.phone.trim();
		const existingUser = await this.userModel.exists({
			$or: [{ email }, { phone }],
		});
		if (existingUser) {
			throw new ConflictException('email or phone is already registered');
		}

		const user = await this.userModel.create({
			firstName: createUserDto.firstName.trim(),
			lastName: createUserDto.lastName.trim(),
			dob: new Date(createUserDto.dob),
			gender: createUserDto.gender.trim(),
			email,
			phone,
			password: await bcrypt.hash(createUserDto.password, 12),
		});

		return {
			...this.publicUser(user),
			access_token: await this.createAccessToken(user),
		};
	}

	async login(loginUserDto: LoginUserDto) {
		const username = loginUserDto.username.trim();
		const user = await this.userModel
			.findOne({
				$or: [{ email: username.toLowerCase() }, { phone: username }],
			})
			.select('+password')
			.exec();

		if (
			!user ||
			!(await bcrypt.compare(loginUserDto.password, user.password))
		) {
			throw new UnauthorizedException('invalid username or password');
		}

		return {
			access_token: await this.createAccessToken(user),
			user: this.publicUser(user),
		};
	}

	async details(userId: string) {
		const user = await this.userModel.findById(userId).exec();
		if (!user) {
			throw new UnauthorizedException('user no longer exists');
		}
		return this.publicUser(user);
	}

	async update(userId: string, updateUserDto: UpdateUserDto) {
		if (
			updateUserDto.password !== undefined &&
			updateUserDto.password !== updateUserDto.conf_password
		) {
			throw new ConflictException(
				'password and conf_password must match',
			);
		}

		const updateData: Record<string, unknown> = {};
		if (updateUserDto.firstName !== undefined) {
			updateData.firstName = updateUserDto.firstName.trim();
		}
		if (updateUserDto.lastName !== undefined) {
			updateData.lastName = updateUserDto.lastName.trim();
		}
		if (updateUserDto.dob !== undefined) {
			updateData.dob = new Date(updateUserDto.dob);
		}
		if (updateUserDto.gender !== undefined) {
			updateData.gender = updateUserDto.gender.trim();
		}
		if (updateUserDto.email !== undefined) {
			updateData.email = updateUserDto.email.toLowerCase().trim();
		}
		if (updateUserDto.phone !== undefined) {
			updateData.phone = updateUserDto.phone.trim();
		}
		if (updateUserDto.password !== undefined) {
			updateData.password = await bcrypt.hash(updateUserDto.password, 12);
		}

		if (
			updateUserDto.email !== undefined ||
			updateUserDto.phone !== undefined
		) {
			const duplicateUser = await this.userModel.exists({
				_id: { $ne: userId },
				$or: [
					...(updateData.email ? [{ email: updateData.email }] : []),
					...(updateData.phone ? [{ phone: updateData.phone }] : []),
				],
			});
			if (duplicateUser) {
				throw new ConflictException(
					'email or phone is already registered',
				);
			}
		}

		const user = await this.userModel
			.findByIdAndUpdate(userId, updateData, {
				new: true,
				runValidators: true,
			})
			.exec();
		if (!user) {
			throw new UnauthorizedException('user no longer exists');
		}
		return this.publicUser(user);
	}

	private createAccessToken(user: UserDocument) {
		return this.jwtService.signAsync({
			sub: user._id.toString(),
			email: user.email,
		});
	}

	private publicUser(user: UserDocument) {
		return {
			id: user._id.toString(),
			firstName: user.firstName,
			lastName: user.lastName,
			dob: user.dob,
			gender: user.gender,
			email: user.email,
			phone: user.phone,
		};
	}
}
