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

interface Durations {
  bottomSignalDurations?: number[];
  topFullCloseDurations?: number[];
  topFullOpenDurations?: number[];
}

export interface Persistence extends Durations {
  position?: number;
  state?: ShutterPosition;
}

interface Store {
  get: () => Persistence;
  set: (value: Partial<Persistence>) => void;
}

const durationsToKeep = 20;
const getBottomDurations = (d: number[]) => d.sort((a, b) => a - b).slice(0, durationsToKeep);
const getLastDurations = (d: number[]) => d.slice(-durationsToKeep);
const getTopDurations = (d: number[]) => d.sort((a, b) => b - a).slice(0, durationsToKeep);
const durationHandlers: Record<keyof Durations, (d: number[]) => number[]> = {
  bottomSignalDurations: getBottomDurations,
  topFullCloseDurations: getTopDurations,
  topFullOpenDurations: getTopDurations,
};

function minMaxPercentage(num: number): number {
  return Math.min(Math.max(num, 0), 100);
}

export class VeluxShutter implements ShutterInterfaceWithState, ShutterInterfaceWithPosition {
  private lastActionStartTime: number = 0;
  private lastStoppingStartTime: number = 0;
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
    if (typeof persistence.position === 'number' && persistence.position <= 100 && persistence.position >= 0) {
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
    this.stateListeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in state listener', err);
      }
    });
  }

  private notifyPositionChange(): void {
    this.positionListeners.forEach((listener) => {
      try {
        listener(this.position);
      } catch (err) {
        console.error('Error in position listener', err);
      }
    });
  }

  private storeDuration(key: keyof Durations, duration: number): void {
    if (duration > 0) {
      this.store.set({[key]: durationHandlers[key]([...(this.store.get()[key] ?? []), duration])});
    }
  }

  private getAverageDuration(key: keyof Durations): number {
    const storedDurations = this.store.get()[key] ?? [];
    if (storedDurations.length) {
      const sum = storedDurations.reduce((a, b) => a + b, 0);
      return sum / storedDurations.length;
    }
    return 0;
  }

  private getEstimatedActionDuration(action: ShutterAction): number {
    const signalDuration = this.getAverageDuration('bottomSignalDurations');
    let avg = 0;
    if (action === 'opening') {
      avg = this.getAverageDuration('topFullOpenDurations');
    }
    if (action === 'closing') {
      avg = this.getAverageDuration('topFullCloseDurations');
    }
    return avg > 0 ? Math.max(0, avg - signalDuration) : 0;
  }

  private getPositionDelta(prevState: ShutterState, duration: number): number {
    if (isShutterAction(prevState) && duration > 0) {
      const avg = this.getEstimatedActionDuration(prevState);
      if (avg > 0) {
        return minMaxPercentage(Math.round((duration / avg) * 100));
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
      this.lastStoppingStartTime = Date.now();
    } else if (state === 'in-between') {
      //Measure the time it takes between a manual "stop" and the following stopped signal.
      // This gives us an estimate on how long the KLF 150 takes to send it for any operation.
      const stopDuration = this.lastStoppingStartTime ? Date.now() - this.lastStoppingStartTime : 0;
      this.storeDuration('bottomSignalDurations', stopDuration);
    } else {
      this.lastStoppingStartTime = 0;
    }

    if (state === 'opening' || state === 'closing') {
      this.lastActionStartTime = Date.now();

      //If we apply another action while already running one, we can no longer determine the full duration:
      if (isShutterAction(this.prevState)) {
        this.lastActionStartTime = 0;
      }
    }

    if (isShutterPosition(state)) {
      const signalDuration = this.getAverageDuration('bottomSignalDurations');
      const measuredDuration = this.lastActionStartTime ? Date.now() - this.lastActionStartTime : 0;
      const positionDuration = measuredDuration > 0 ? Math.max(0, measuredDuration - signalDuration) : 0;

      if (state === 'closed') {
        const delta = this.getPositionDelta(this.prevState, positionDuration);
        if (delta) {
          this.position = minMaxPercentage(this.position - delta);
          this.position = this.position < 3 ? 0 : this.position;
        } else {
          this.position = 0;
        }
      } else if (state === 'open') {
        const delta = this.getPositionDelta(this.prevState, positionDuration);
        if (delta) {
          this.position = minMaxPercentage(this.position + delta);
          this.position = this.position > 97 ? 100 : this.position;
        } else {
          this.position = 100;
        }
      } else if (state === 'in-between') {
        const delta = this.getPositionDelta(this.preStopState, positionDuration);
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
        this.storeDuration('topFullCloseDurations', measuredDuration);
      }
      if (prevPositionState === 'closed' && state === 'open') {
        this.storeDuration('topFullOpenDurations', measuredDuration);
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
        timeout = (this.getEstimatedActionDuration('opening') * (position - this.position)) / 100;
        this.open();
      } else {
        timeout = (this.getEstimatedActionDuration('closing') * (this.position - position)) / 100;
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
