import {Gpio} from 'onoff';
import {ShutterInterface} from './Shutter.js';
import {press, mkOutput} from '../Gpio.js';
import type {OnDispose} from '../runtime.js';

export class ThreeButtonShutter implements ShutterInterface {
  constructor(
    public readonly ident: string,
    private readonly openButton: Gpio,
    private readonly stopButton: Gpio,
    private readonly closeButton: Gpio,
  ) {
  }

  open(): void {
    press(this.openButton);
  }

  stop(): void {
    press(this.stopButton);
  }

  close(): void {
    press(this.closeButton);
  }
}

export function createThreeButtonShutter(
  ident: string,
  up: number,
  stop: number,
  down: number,
  onDispose: OnDispose,
): ThreeButtonShutter {
  return new ThreeButtonShutter(
    ident,
    mkOutput(up, onDispose),
    mkOutput(stop, onDispose),
    mkOutput(down, onDispose),
  );
}