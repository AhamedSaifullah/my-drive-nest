import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ collection: 'refresh_sessions', timestamps: true, versionKey: false })
export class RefreshSession {
	@Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
	userId!: Types.ObjectId;

	@Prop({ required: true, index: true })
	familyId!: string;

	@Prop({ required: true, unique: true, select: false })
	tokenHash!: string;

	@Prop({ type: Date, required: true, index: true })
	expiresAt!: Date;

	@Prop({ type: Date, default: null })
	revokedAt?: Date;

	@Prop({ type: Types.ObjectId, ref: 'RefreshSession', default: null })
	replacedBy?: Types.ObjectId;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshSessionSchema.index({ familyId: 1, revokedAt: 1 });
