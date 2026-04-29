import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import * as net from 'net';

@Injectable()
export class TcpHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async pingCheck(
    key: string,
    host: string,
    port: number,
  ): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const isAlive = await this.tcpPing(host, port);
    return isAlive
      ? indicator.up()
      : indicator.down({ message: `${key} is not reachable` });
  }

  private tcpPing(
    host: string,
    port: number,
    timeout = 3000,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket
        .on('connect', () => {
          socket.destroy();
          resolve(true);
        })
        .on('timeout', () => {
          socket.destroy();
          resolve(false);
        })
        .on('error', () => {
          socket.destroy();
          resolve(false);
        });
      socket.connect(port, host);
    });
  }
}
