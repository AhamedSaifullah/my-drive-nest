import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QueueController } from './queue.controller';
import { SyncQueueService } from './sync-queue.service';
import { SYNC_QUEUE } from './queue.constants';
import { UserModule } from '../user/user.module';

function redisConnection(redisUrl: string) {
	const url = new URL(redisUrl);
	return {
		host: url.hostname,
		port: Number(url.port || 6379),
		...(url.username ? { username: decodeURIComponent(url.username) } : {}),
		...(url.password ? { password: decodeURIComponent(url.password) } : {}),
		...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
		...(url.protocol === 'rediss:' ? { tls: {} } : {}),
	};
}

@Module({
	imports: [
		ConfigModule,
		UserModule,
		BullModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
				defaultJobOptions: {
					attempts: 3,
					backoff: { type: 'exponential', delay: 1000 },
					removeOnComplete: 100,
					removeOnFail: 1000,
				},
			}),
		}),
		BullModule.registerQueue({ name: SYNC_QUEUE }),
	],
	controllers: [QueueController],
	providers: [SyncQueueService],
	exports: [SyncQueueService],
})
export class QueueModule {}
