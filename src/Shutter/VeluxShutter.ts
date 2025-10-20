import {Gpio} from 'onoff';
import {ShutterInterface, ShutterState, shutterStates} from './Shutter.js';
import {press} from '../Gpio.js';

export class VeluxShutter implements ShutterInterface {
  private state: ShutterState = 'unknown';
  private listeners: Set<(state: ShutterState) => void> = new Set();

  constructor(
    public readonly ident: string,
    private readonly up: Gpio,
    private readonly down: Gpio,
    private readonly input?: Gpio | null,
    lastKnownState?: string | null,
  ) {
    if (lastKnownState && shutterStates.includes(lastKnownState as ShutterState)) {
      this.state = lastKnownState as ShutterState;
    }

    if (this.input) {
      this.input.watch((err, value) => {
        if (err) {
          console.error('Error watching input', err);
        } else if (value === Gpio.LOW) {
          if (this.state === 'opening') {
            this.setState('open');
          } else if (this.state === 'closing') {
            this.setState('closed');
          } else if (this.state === 'stopping') {
            this.setState('in-between');
          }
        }
      });
    }
  }

  private setState(state: ShutterState): void {
    if (!this.input) {
      //Without an input, we can't manage the state with any confidence.
      return;
    }

    this.state = state;
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in state listener', err);
      }
    });
  }

  open(): void {
    this.setState('opening');
    press(this.up);
  }

  close(): void {
    this.setState('closing');
    press(this.down);
  }

  stop(): void {
    this.setState('stopping');
    press(this.up, this.down);
  }

  getState() {
    return this.state;
  }

  onStateChange(cb: (state: ShutterState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}