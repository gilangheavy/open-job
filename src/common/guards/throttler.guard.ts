import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    return Promise.reject(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );
  }
}
