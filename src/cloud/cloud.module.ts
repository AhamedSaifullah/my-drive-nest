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
import { QueueModule } from '../queue/queue.module';
import { InitialSyncService } from './initial-sync.service';
import { SyncProcessor } from '../queue/sync.processor';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
	imports: [
		ConfigModule,
		UserModule,
		QueueModule,
		MongooseModule.forFeature([
			{ name: CloudAccount.name, schema: CloudAccountSchema },
			{ name: CloudFile.name, schema: CloudFileSchema },
			{ name: OAuthState.name, schema: OAuthStateSchema },
			{ name: SyncJob.name, schema: SyncJobSchema },
		]),
	],
	controllers: [CloudController, CloudAccountsController, SyncController, FilesController],
	providers: [CloudService, TokenEncryptionService, GoogleProvider, InitialSyncService, SyncProcessor, SyncScheduler, FilesService],
})
export class CloudModule {}
