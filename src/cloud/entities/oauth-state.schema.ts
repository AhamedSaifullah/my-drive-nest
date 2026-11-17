import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OAuthStateDocument = HydratedDocument<OAuthState>;

@Schema({ collection: 'oauth_states', timestamps: true, versionKey: false })
export class OAuthState {
	@Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
	userId!: Types.ObjectId;

	@Prop({ required: true, unique: true, select: false })
	nonceHash!: string;

	@Prop({ required: true, enum: ['google-link'], index: true })
	purpose!: 'google-link';

	@Prop({ required: true, type: Date })
	expiresAt!: Date;
}

export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
