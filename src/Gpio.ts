import {Gpio} from 'onoff';
import type {OnDispose} from './runtime.js';
import {execSync} from 'child_process';

async function sleep(wait: number) {
  await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function press(...outputs: readonly Gpio[]) {
  outputs.forEach((output) => output.writeSync(1));
  await sleep(200);
  outputs.forEach((output) => output.writeSync(0));
}

export function mkOutput(pin: number, onDispose: OnDispose): Gpio {
  const gpio = new Gpio(pin, 'out');
  onDispose(() => {
    gpio.writeSync(0);
    gpio.unexport();
  });
  return gpio;
}

export function mkInput(pin: number, onDispose: OnDispose): Gpio {
  //Setting to pull-up - the `onoff`-library doesn't do that.
  // I'm doing this because the inputs were floating high without any pull, so I just stick with it.
  // We assume the input pin is closed to ground, causing it to change to low.
  try {
    execSync(`raspi-gpio set ${pin} pu`);
  } catch {
    try {
      execSync(`pinctrl set ${pin} pu`); //newer tool, replacing raspi-gpio, might need root though
    } catch {
      console.error('Unable to set pull-up on GPIO input');
    }
  }

  const gpio = new Gpio(pin, 'in', 'both');
  onDispose(() => gpio.unexport());

  //Double check that the input is high:
  const value = gpio.readSync();
  if (value !== Gpio.HIGH) {
    console.error(`Expected GPIO ${pin} to be high (3V), but it was low (0V)`);
  }

  return gpio;
}
