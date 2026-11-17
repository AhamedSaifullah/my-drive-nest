import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { CloudAccount, CloudAccountSchema } from './entities/cloud-account.schema';
import { CloudFile, CloudFileSchema } from './entities/file.schema';
import { OAuthState, OAuthStateSchema } from './entities/oauth-state.schema';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
	imports: [
		ConfigModule,
		UserModule,
		MongooseModule.forFeature([
			{ name: CloudAccount.name, schema: CloudAccountSchema },
			{ name: CloudFile.name, schema: CloudFileSchema },
			{ name: OAuthState.name, schema: OAuthStateSchema },
		]),
	],
	controllers: [CloudController],
	providers: [CloudService, TokenEncryptionService],
})
export class CloudModule {}
