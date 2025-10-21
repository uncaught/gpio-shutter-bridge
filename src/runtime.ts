export type OnDispose = (disposable: () => void | Promise<void>) => () => void;

export function initRuntime(): { exit: (err?: Error | unknown) => Promise<void>; onDispose: OnDispose } {
  const disposables = new Set<() => void | Promise<void>>();

  const onDispose: OnDispose = (cb) => {
    disposables.add(cb);
    return () => disposables.delete(cb);
  };

  async function exit(err?: Error | unknown): Promise<void> {
    for (const disposable of disposables) {
      try {
        await disposable();
      } catch (e) {
        console.error('Error in disposable', e);
      }
    }
    if (err) {
      console.error(err);
      process.exit(1);
    } else {
      process.exit(0);
    }
  }

  process.on('SIGINT', () => exit());
  process.on('SIGTERM', () => exit());
  process.on('uncaughtException', (err) => exit(err));
  process.on('unhandledRejection', (err) => exit(err));

  return {exit, onDispose};
}
