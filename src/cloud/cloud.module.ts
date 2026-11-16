import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { CloudAccount, CloudAccountSchema } from './entities/cloud-account.schema';
import { CloudFile, CloudFileSchema } from './entities/file.schema';

@Module({
	imports: [
		ConfigModule,
		UserModule,
		MongooseModule.forFeature([
			{ name: CloudAccount.name, schema: CloudAccountSchema },
			{ name: CloudFile.name, schema: CloudFileSchema },
		]),
	],
	controllers: [CloudController],
	providers: [CloudService],
})
export class CloudModule {}
