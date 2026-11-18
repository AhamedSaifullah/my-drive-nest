import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FileDocument = HydratedDocument<CloudFile>;
export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'other';

@Schema({ collection: 'files', timestamps: true, versionKey: false })
export class CloudFile {
	@Prop({ type: Types.ObjectId, ref: 'User', required: true })
	userId!: Types.ObjectId;

	@Prop({ type: Types.ObjectId, ref: 'CloudAccount', required: true })
	cloudAccountId!: Types.ObjectId;

	@Prop({ required: true })
	providerFileId!: string;

	@Prop({ required: true })
	name!: string;

	@Prop()
	mimeType?: string;

	@Prop({ required: true, enum: ['image', 'video', 'audio', 'document', 'other'] })
	category!: FileCategory;

	@Prop({ type: Number })
	size?: number;

	@Prop({ type: Date })
	modifiedAt?: Date;

	@Prop()
	thumbnailUrl?: string;

	@Prop()
	parentId?: string;
}

export const CloudFileSchema = SchemaFactory.createForClass(CloudFile);
CloudFileSchema.index({ cloudAccountId: 1, providerFileId: 1 }, { unique: true });
CloudFileSchema.index({ userId: 1, category: 1, modifiedAt: -1 });
CloudFileSchema.index({ userId: 1, modifiedAt: -1 });
