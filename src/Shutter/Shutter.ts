export const shutterPositions = ['open', 'closed', 'in-between', 'unknown'] as const;
export type ShutterPosition = typeof shutterPositions[number];

export const shutterActions = ['opening', 'closing', 'stopping'] as const;
export type ShutterAction = typeof shutterActions[number];

export const shutterStates = [...shutterPositions, ...shutterActions] as const;
export type ShutterState = typeof shutterStates[number];

export function isShutterPosition(state: unknown): state is ShutterPosition {
  return !!state && shutterPositions.includes(state as ShutterPosition);
}

export function isShutterAction(state: unknown): state is ShutterAction {
  return !!state && shutterActions.includes(state as ShutterAction);
}

export interface ShutterInterface {
  ident: string; // must match /[a-zA-Z][a-zA-Z0-9_-]*/ - underscores are replace with spaces in the friendly name

  open(): void;

  close(): void;

  stop(): void;
}

export interface ShutterInterfaceWithState extends ShutterInterface {
  getState(): ShutterState;

  onStateChange(cb: (state: ShutterState) => void): () => void;
}

export function isShutterWithState(shutter: ShutterInterface): shutter is ShutterInterfaceWithState {
  return 'getState' in shutter && 'onStateChange' in shutter;
}
