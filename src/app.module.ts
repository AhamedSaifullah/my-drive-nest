import { APP_GUARD } from '@nestjs/core';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { CloudModule } from './cloud/cloud.module';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './config/env.validation';
import { QueueModule } from './queue/queue.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
		ThrottlerModule.forRoot({
			throttlers: [{ ttl: 60_000, limit: 100, blockDuration: 60_000 }],
		}),
		MongooseModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const uri = configService.get<string>('MONGODB_URI');
				if (!uri) {
					throw new Error(
						'MONGODB_URI is required. Add your MongoDB Atlas URI to .env',
					);
				}
				return { uri };
			},
		}),
		UserModule,
		CloudModule,
		QueueModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		{ provide: APP_GUARD, useClass: ThrottlerGuard },
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(RequestLoggingMiddleware).forRoutes('*');
	}
}
