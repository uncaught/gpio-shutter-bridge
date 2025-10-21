import {readFileSync} from 'fs';
import {existsSync, writeFile} from 'node:fs';
import type {OnDispose} from '../runtime.js';
import {VeluxShutter, Persistence} from './VeluxShutter.js';
import {mkInput, mkOutput} from '../Gpio.js';
import debounce from 'lodash.debounce';

export interface VeluxConfig {
  ident: string; // must match /[a-zA-Z][a-zA-Z0-9_-]*/ - underscores are replace with spaces in the friendly name
  up: number;
  down: number;
  input: number;
}

export function createVeluxShutters(
  shutters: readonly VeluxConfig[],
  onDispose: OnDispose,
): readonly VeluxShutter[] {
  const persistenceFile = '/tmp/velux-shutter-state.json';
  let storage: Partial<Record<string, Persistence>> = {};
  if (existsSync(persistenceFile)) {
    const file = readFileSync(persistenceFile).toString();
    try {
      storage = JSON.parse(file);
    } catch (e) {
      console.error('Error parsing persistence file', e);
    }
  }

  const save = debounce(() => {
    writeFile(persistenceFile, JSON.stringify(storage), (err) => {
      if (err) {
        console.error('Error writing persistence file', err);
      }
    });
  }, 200);

  return shutters.map((cfg): VeluxShutter => {
    const {ident, up, down, input} = cfg;
    const shutter = new VeluxShutter(
      ident,
      mkOutput(up, onDispose),
      mkOutput(down, onDispose),
      mkInput(input, onDispose),
      {
        get: () => storage[ident] ?? {},
        set: (obj) => {
          storage[ident] = {...storage[ident], ...obj};
          save();
        },
      },
    );

    onDispose(() => shutter.destroy());

    return shutter;
  });
}
