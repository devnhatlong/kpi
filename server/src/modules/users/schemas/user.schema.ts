
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Helper } from 'src/ultis/helpers';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
    @Prop()
    name!: string;

    @Prop()
    email!: string;

    @Prop()
    password!: string;

    @Prop()
    role!: string;

    @Prop()
    slug!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre<UserDocument>('validate', function () {
    if (this.name) {
        this.slug = Helper.slugify(this.name);
    }
});