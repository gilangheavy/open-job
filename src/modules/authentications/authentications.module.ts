import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationsController } from './authentications.controller';
import { AuthenticationsService } from './authentications.service';

@Module({
  imports: [
    // JwtModule registered without a default secret/expiry;
    // each sign/verify call supplies its own secret to support
    // two separate keys (ACCESS_TOKEN_KEY / REFRESH_TOKEN_KEY).
    JwtModule.register({}),
  ],
  controllers: [AuthenticationsController],
  providers: [AuthenticationsService],
})
export class AuthenticationsModule {}
