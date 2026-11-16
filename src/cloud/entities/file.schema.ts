import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FileDocument = HydratedDocument<CloudFile>;

@Schema({ collection: 'files', timestamps: true, versionKey: false })
export class CloudFile {
	@Prop({ type: Types.ObjectId, ref: 'CloudAccount', required: true, index: true })
	cloudAccountId!: Types.ObjectId;

	@Prop({ required: true })
	providerFileId!: string;

	@Prop({ required: true })
	name!: string;

	@Prop()
	mimeType?: string;

	@Prop({ required: true, enum: ['image', 'video', 'audio', 'document', 'other'], index: true })
	category!: 'image' | 'video' | 'audio' | 'document' | 'other';

	@Prop({ type: Number })
	size?: number;

	@Prop({ type: Date, index: true })
	modifiedAt?: Date;

	@Prop()
	thumbnailUrl?: string;

	@Prop()
	parentId?: string;
}

export const CloudFileSchema = SchemaFactory.createForClass(CloudFile);
CloudFileSchema.index({ cloudAccountId: 1, providerFileId: 1 }, { unique: true });
CloudFileSchema.index({ cloudAccountId: 1, category: 1, modifiedAt: -1 });
