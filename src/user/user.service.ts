import {
	ConflictException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { Logger } from '@nestjs/common';
import { RefreshSession, RefreshSessionDocument } from './schemas/refresh-session.schema';
import { TokenBlacklistService } from './token-blacklist.service';

@Injectable()
export class UserService {
	constructor(
		@InjectModel(User.name) private readonly userModel: Model<UserDocument>,
		@InjectModel(RefreshSession.name)
		private readonly refreshSessionModel: Model<RefreshSessionDocument>,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		private readonly tokenBlacklistService: TokenBlacklistService,
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
			...(await this.issueTokenPair(user)),
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
			...(await this.issueTokenPair(user)),
			user: this.publicUser(user),
		};
	}

	async refreshAccessToken(refreshToken: string) {
		const tokenHash = this.hashRefreshToken(refreshToken);
		const existingSession = await this.refreshSessionModel
			.findOne({ tokenHash })
			.select('+tokenHash')
			.exec();

		if (!existingSession) {
			throw new UnauthorizedException('invalid refresh token');
		}

		if (existingSession.revokedAt || existingSession.expiresAt <= new Date()) {
			if (existingSession.revokedAt) {
				await this.revokeRefreshFamily(existingSession.familyId);
				throw new UnauthorizedException('refresh token reuse detected');
			}
			await this.revokeRefreshSession(existingSession._id);
			throw new UnauthorizedException('refresh token has expired');
		}

		const user = await this.userModel.findById(existingSession.userId).exec();
		if (!user) throw new UnauthorizedException('user no longer exists');

		const nextRefreshToken = this.createRefreshToken();
		const nextSession = await this.refreshSessionModel.create({
			userId: user._id,
			familyId: existingSession.familyId,
			tokenHash: this.hashRefreshToken(nextRefreshToken),
			expiresAt: this.refreshExpiry(),
		});
		const rotated = await this.refreshSessionModel
			.findOneAndUpdate(
				{ _id: existingSession._id, revokedAt: null },
				{ $set: { revokedAt: new Date(), replacedBy: nextSession._id } },
				{ new: true },
			)
			.exec();

		if (!rotated) {
			await this.refreshSessionModel.deleteOne({ _id: nextSession._id }).exec();
			await this.revokeRefreshFamily(existingSession.familyId);
			throw new UnauthorizedException('refresh token reuse detected');
		}

		return {
			access_token: await this.createAccessToken(user),
			refresh_token: nextRefreshToken,
		};
	}

	async revokeRefreshSessions(userId: string) {
		await this.refreshSessionModel
			.updateMany(
				{ userId: new Types.ObjectId(userId), revokedAt: null },
				{ $set: { revokedAt: new Date() } },
			)
			.exec();
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
		}, { expiresIn: '15m' });
	}

	private async issueTokenPair(user: UserDocument) {
		const refreshToken = this.createRefreshToken();
		await this.refreshSessionModel.create({
			userId: user._id,
			familyId: randomBytes(24).toString('hex'),
			tokenHash: this.hashRefreshToken(refreshToken),
			expiresAt: this.refreshExpiry(),
		});
		return {
			access_token: await this.createAccessToken(user),
			refresh_token: refreshToken,
		};
	}

	private createRefreshToken() {
		return randomBytes(64).toString('base64url');
	}

	private hashRefreshToken(token: string) {
		return createHash('sha256').update(token).digest('hex');
	}

	private refreshExpiry() {
		const days = Number(this.configService.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
		if (!Number.isInteger(days) || days <= 0) {
			throw new Error('REFRESH_TOKEN_TTL_DAYS must be a positive integer');
		}
		return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	}

	private revokeRefreshSession(id: Types.ObjectId) {
		return this.refreshSessionModel
			.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date() } })
			.exec();
	}

	private revokeRefreshFamily(familyId: string) {
		return this.refreshSessionModel
			.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } })
			.exec();
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
