import {ShutterState, isShutterPosition} from './Shutter.js';
import {readFileSync} from 'fs';
import {existsSync, writeFile} from 'node:fs';
import type {OnDispose} from '../runtime.js';
import {VeluxShutter} from './VeluxShutter.js';
import {mkInput, mkOutput} from '../Gpio.js';

export interface VeluxConfig {
  ident: string; // must match /[a-zA-Z][a-zA-Z0-9_-]*/ - underscores are replace with spaces in the friendly name
  up: number;
  down: number;
  input?: number | null;
}

export function createVeluxShutters(
  shutters: readonly VeluxConfig[],
  onDispose: OnDispose,
): readonly VeluxShutter[] {
  const persistenceFile = '/tmp/velux-shutter-state.json';
  let persistence: Partial<Record<string, { state?: ShutterState }>> = {};
  if (existsSync(persistenceFile)) {
    const file = readFileSync(persistenceFile).toString();
    try {
      persistence = JSON.parse(file);
    } catch (e) {
      console.error('Error parsing persistence file', e);
    }
  }

  return shutters.map((cfg): VeluxShutter => {
    const {ident, up, down, input} = cfg;
    const shutter = new VeluxShutter(
      ident,
      mkOutput(up, onDispose),
      mkOutput(down, onDispose),
      mkInput(input, onDispose),
      persistence[ident]?.state,
    );

    shutter.onStateChange((state) => {
      if (isShutterPosition(state)) {
        persistence[ident] ??= {};
        persistence[ident]!.state = state;
        writeFile(persistenceFile, JSON.stringify(persistence), (err) => {
          if (err) {
            console.error('Error writing persistence file', err);
          }
        });
      }
    });

    return shutter;
  });
}
