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

	@Prop({ required: true, trim: true })
	email!: string;

	@Prop({ required: true, trim: true })
	displayName!: string;

	@Prop()
	encryptedAccessToken!: string;

	@Prop()
	encryptedRefreshToken!: string;

	@Prop()
	tokenKeyVersion!: string;

	@Prop({ type: Date })
	expiresAt?: Date;

	@Prop({ required: true, enum: ['active', 'unlinked', 'revoked'], default: 'active' })
	status!: 'active' | 'unlinked' | 'revoked';
}

export const CloudAccountSchema = SchemaFactory.createForClass(CloudAccount);
CloudAccountSchema.index({ userId: 1, provider: 1 }, { unique: true });
CloudAccountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
