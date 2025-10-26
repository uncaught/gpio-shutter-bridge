import {createVeluxShutters, VeluxConfig, initRuntime, initMqtt, createThreeButtonShutter} from './src/index.js';

/**
 * This is an example for connecting to a Velux KLF150 with up to 5 shutters.
 * The up/down pins are all aligned on the left GPIO column and the inputs are on the right, except for shutter e.
 */
const veluxKlf150: VeluxConfig[] = [
  {ident: 'Velux_A', up: 2, down: 3, input: 14},
  {ident: 'Velux_B', up: 4, down: 17, input: 15},
  {ident: 'Velux_C', up: 27, down: 22, input: 18},
  {ident: 'Velux_D', up: 10, down: 9, input: 23},
  {ident: 'Velux_E', up: 11, down: 8, input: 24}, //same row!
];

/**
 * When using exactly 3 shutters, using the CDE socket with the 6x2 plug makes more sense:
 */
const veluxKlf150CDE: VeluxConfig[] = [
  {...veluxKlf150[0]!, ident: 'Velux_C'},
  {...veluxKlf150[1]!, ident: 'Velux_D'},
  {...veluxKlf150[2]!, ident: 'Velux_E'},
];

/**
 * This runtime implementation is also just an example - you can use your own implementation if you want.
 */
const {onDispose} = initRuntime();

/**
 * For my personal use, I have 3 shutters tied to the Velux KLF150 and another shutter controlled with
 * a 3-button remote, which I hacked and connected to the GPIO-pins 10/9/11:
 */
const shutters = [
  ...createVeluxShutters(veluxKlf150CDE, onDispose),
  createThreeButtonShutter('Balkon', 10, 9, 11, onDispose),
];

initMqtt(shutters, onDispose, {url: 'mqtts://mosquitto.local.correnz.net', rejectUnauthorized: false});
