import {Gpio} from 'onoff';
import {
  ShutterState,
  ShutterInterfaceWithState,
  ShutterInterfaceWithPosition,
  isShutterPosition,
  ShutterPosition,
  isShutterAction,
  ShutterAction,
} from './Shutter.js';
import {press} from '../Gpio.js';

export interface Persistence {
  lastFullCloseDurations?: number[];
  lastFullOpenDurations?: number[];
  position?: number;
  state?: ShutterPosition;
}

interface Store {
  get: () => Persistence;
  set: (value: Partial<Persistence>) => void;
}

const lastDurationsToKeep = 10;

function minMaxPercentage(num: number): number {
  return Math.min(Math.max(num, 0), 100);
}

export class VeluxShutter implements ShutterInterfaceWithState, ShutterInterfaceWithPosition {
  private lastActionStartTime: number = 0;
  private prevPositionState: ShutterPosition = 'unknown';
  private positioningTimeout: NodeJS.Timeout | null = null;
  private position: number = 42; //unknown initially
  private positionListeners: Set<(position: number) => void> = new Set();
  private prevState: ShutterState = 'unknown';
  private preStopState: ShutterState = 'unknown';
  private state: ShutterState = 'unknown';
  private stateListeners: Set<(state: ShutterState) => void> = new Set();

  constructor(
    public readonly ident: string,
    private readonly up: Gpio,
    private readonly down: Gpio,
    private readonly input: Gpio,
    private readonly store: Store,
  ) {
    const persistence = this.store.get();
    if (typeof persistence.position === 'number' && (persistence.position <= 100 && persistence.position >= 0)) {
      this.position = +persistence.position; //"+" makes sure we have integers only
    }
    if (persistence.state && isShutterPosition(persistence.state)) {
      this.state = persistence.state;
      this.prevPositionState = this.state;
    }

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

  private notifyStateChange(): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in state listener', err);
      }
    });
  }

  private notifyPositionChange(): void {
    this.positionListeners.forEach(listener => {
      try {
        listener(this.position);
      } catch (err) {
        console.error('Error in position listener', err);
      }
    });
  }

  private storeDuration(key: 'lastFullCloseDurations' | 'lastFullOpenDurations', duration: number): void {
    if (duration > 0) {
      let array = this.store.get()[key] ?? [];
      array.unshift(duration);
      array = array.slice(0, lastDurationsToKeep);
      this.store.set({[key]: array});
    }
  }

  private getAverageDuration(action: ShutterAction): number {
    let lastDurations: number[] = [];
    if (action === 'opening') {
      lastDurations = this.store.get().lastFullOpenDurations ?? [];
    }
    if (action === 'closing') {
      lastDurations = this.store.get().lastFullCloseDurations ?? [];
    }
    if (lastDurations.length) {
      const sum = lastDurations.reduce((a, b) => a + b, 0);
      return sum / lastDurations.length;
    }

    return 0;
  }

  private getPositionDelta(prevState: ShutterState, duration: number): number {
    if (isShutterAction(prevState) && duration > 0) {
      const avg = this.getAverageDuration(prevState);
      if (avg > 0) {
        return minMaxPercentage(Math.round(duration / avg * 100));
      }
    }

    return 0;
  }

  private setState(state: ShutterState): void {
    this.prevState = this.state;
    this.state = state;
    this.notifyStateChange();

    if (state === 'stopping') {
      this.preStopState = this.prevState;
    }

    if (state === 'opening' || state === 'closing') {
      this.lastActionStartTime = Date.now();

      //If we apply another action while already running one, we can no longer determine the full duration:
      if (isShutterAction(this.prevState)) {
        this.lastActionStartTime = 0;
      }
    }

    if (isShutterPosition(state)) {
      const duration = this.lastActionStartTime ? (Date.now() - this.lastActionStartTime) : 0;

      if (state === 'closed') {
        this.position = 0;
      } else if (state === 'open') {
        this.position = 100;
      } else if (state === 'in-between') {
        const prevPosition = this.position;
        const delta = this.getPositionDelta(this.preStopState, duration);
        if (this.preStopState === 'opening') {
          this.position = minMaxPercentage(this.position + delta);
        } else if (this.preStopState === 'closing') {
          this.position = minMaxPercentage(this.position - delta);
        }
      }
      this.notifyPositionChange();
      this.store.set({state, position: this.position});

      let prevPositionState = this.prevPositionState;
      this.prevPositionState = state;
      if (prevPositionState === 'open' && state === 'closed') {
        this.storeDuration('lastFullCloseDurations', duration);
      }
      if (prevPositionState === 'closed' && state === 'open') {
        this.storeDuration('lastFullOpenDurations', duration);
      }
    }
  }

  private clearPositioningTimeout(): void {
    if (this.positioningTimeout) {
      clearTimeout(this.positioningTimeout);
      this.positioningTimeout = null;
    }
  }

  open(): void {
    this.clearPositioningTimeout();
    this.setState('opening');
    press(this.up);
  }

  stop(): void {
    this.clearPositioningTimeout();
    this.setState('stopping');
    press(this.up, this.down);
  }

  close(): void {
    this.clearPositioningTimeout();
    this.setState('closing');
    press(this.down);
  }

  setPosition(position: number): void {
    this.clearPositioningTimeout();
    if (position === 0) {
      this.close();
    } else if (position === 100) {
      this.open();
    } else if (position > 0 && position < 100) {
      let timeout = 0;
      if (position > this.position) {
        timeout = this.getAverageDuration('opening') * (position - this.position) / 100;
        this.open();
      } else {
        timeout = this.getAverageDuration('closing') * (this.position - position) / 100;
        this.close();
      }
      if (timeout) {
        this.positioningTimeout = setTimeout(() => this.stop(), timeout);
      }
    }
  }

  getPosition(): number {
    return this.position;
  }

  getState() {
    return this.state;
  }

  onPositionChange(cb: (position: number) => void): () => void {
    this.positionListeners.add(cb);
    return () => this.positionListeners.delete(cb);
  }

  onStateChange(cb: (state: ShutterState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  destroy(): void {
    this.clearPositioningTimeout();
  }
}