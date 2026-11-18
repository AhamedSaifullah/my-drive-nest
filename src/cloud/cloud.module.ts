import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { CloudController } from './cloud.controller';
import { CloudAccountsController } from './cloud-accounts.controller';
import { CloudService } from './cloud.service';
import { CloudAccount, CloudAccountSchema } from './entities/cloud-account.schema';
import { CloudFile, CloudFileSchema } from './entities/file.schema';
import { OAuthState, OAuthStateSchema } from './entities/oauth-state.schema';
import { SyncJob, SyncJobSchema } from './entities/sync-job.schema';
import { TokenEncryptionService } from './token-encryption.service';
import { GoogleProvider } from './providers/google.provider';

@Module({
	imports: [
		ConfigModule,
		UserModule,
		MongooseModule.forFeature([
			{ name: CloudAccount.name, schema: CloudAccountSchema },
			{ name: CloudFile.name, schema: CloudFileSchema },
			{ name: OAuthState.name, schema: OAuthStateSchema },
			{ name: SyncJob.name, schema: SyncJobSchema },
		]),
	],
	controllers: [CloudController, CloudAccountsController],
	providers: [CloudService, TokenEncryptionService, GoogleProvider],
})
export class CloudModule {}
