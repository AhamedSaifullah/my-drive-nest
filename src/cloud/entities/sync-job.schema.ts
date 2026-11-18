import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SyncJobDocument = HydratedDocument<SyncJob>;

@Schema({ collection: 'sync_jobs', timestamps: true, versionKey: false })
export class SyncJob {
	@Prop({ type: Types.ObjectId, ref: 'CloudAccount', required: true })
	cloudAccountId!: Types.ObjectId;

	@Prop({ required: true, enum: ['initial', 'incremental'] })
	type!: 'initial' | 'incremental';

	@Prop({ required: true, enum: ['queued', 'running', 'completed', 'failed'] })
	status!: 'queued' | 'running' | 'completed' | 'failed';

	@Prop({ type: Number, default: 0 })
	processedCount!: number;

	@Prop({ type: Number, default: 0 })
	createdCount!: number;

	@Prop({ type: Number, default: 0 })
	updatedCount!: number;

	@Prop({ type: Number, default: 0 })
	deletedCount!: number;

	@Prop()
	error?: string;

	@Prop()
	pageToken?: string;

	@Prop({ type: Date })
	startedAt?: Date;

	@Prop({ type: Date })
	completedAt?: Date;
}

export const SyncJobSchema = SchemaFactory.createForClass(SyncJob);
SyncJobSchema.index({ cloudAccountId: 1, createdAt: -1 });
SyncJobSchema.index({ status: 1, createdAt: -1 });
