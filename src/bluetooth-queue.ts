type BluetoothTask<T> = () => Promise<T> | T;

class BluetoothPromiseQueue {
  private chain: Promise<unknown> = Promise.resolve();

  add<T>(task: BluetoothTask<T>): Promise<T> {
    const run = () => Promise.resolve().then(task);
    const result = this.chain.then(run, run);

    this.chain = result.catch(() => {
      // Prevent one failed task from breaking the whole queue
      return undefined;
    });

    return result;
  }

  reset(): void {
    this.chain = Promise.resolve();
  }
}

export const bluetoothPromiseQueue = new BluetoothPromiseQueue();
