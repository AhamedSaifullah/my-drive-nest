import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CloudAccountDocument = HydratedDocument<CloudAccount>;

@Schema({ collection: 'cloud_accounts', timestamps: true, versionKey: false })
export class CloudAccount {
	@Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
	userId!: Types.ObjectId;

	@Prop({ required: true, enum: ['google'], index: true })
	provider!: 'google';

	@Prop({ required: true })
	providerAccountId!: string;

	@Prop({ required: true })
	encryptedAccessToken!: string;

	@Prop({ required: true })
	encryptedRefreshToken!: string;

	@Prop({ type: Date })
	expiresAt?: Date;

	@Prop({ required: true, enum: ['active', 'revoked'], default: 'active' })
	status!: 'active' | 'revoked';
}

export const CloudAccountSchema = SchemaFactory.createForClass(CloudAccount);
CloudAccountSchema.index({ userId: 1, provider: 1 }, { unique: true });
CloudAccountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
