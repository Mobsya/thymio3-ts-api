const BLUETOOTH_OPERATION_CANCELLED_MESSAGE = "[Thymio 3 API] Bluetooth operation cancelled by stop operation";

type BluetoothTask<T> = {
  run: () => Promise<T> | T,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void,
  generation: number,
  priority: boolean
};

const normalQueue: BluetoothTask<unknown>[] = [];
const priorityQueue: BluetoothTask<unknown>[] = [];
let isRunning = false;
let cancellationGeneration = 0;

export function queueBluetoothCall<T>(fn: () => Promise<T> | T): Promise<T> {
  return enqueue(normalQueue, fn);
}

export function queuePriorityBluetoothCall<T>(fn: () => Promise<T> | T): Promise<T> {
  return enqueue(priorityQueue, fn, true);
}

export function runPriorityBluetoothCall<T>(
  fn: () => Promise<T> | T,
  _reason = "stop operation"
): Promise<T> {
  cancellationGeneration++;
  rejectPendingBluetoothCalls();
  return enqueue(priorityQueue, fn, true);
}

function enqueue<T>(
  queue: BluetoothTask<unknown>[],
  fn: () => Promise<T> | T,
  priority = false
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: fn,
      resolve: resolve as (value: unknown) => void,
      reject,
      generation: cancellationGeneration,
      priority
    });
    drainQueue();
  });
}

function rejectPendingBluetoothCalls(): void {
  let task = normalQueue.shift();
  while (task) {
    task.reject(createBluetoothOperationCancelledError());
    task = normalQueue.shift();
  }
}

function createBluetoothOperationCancelledError(): Error {
  return new Error(BLUETOOTH_OPERATION_CANCELLED_MESSAGE);
}

async function drainQueue(): Promise<void> {
  if (isRunning) return;

  const task = priorityQueue.shift() ?? normalQueue.shift();
  if (!task) return;

  isRunning = true;
  try {
    const result = await task.run();
    if (!task.priority && task.generation !== cancellationGeneration) {
      task.reject(createBluetoothOperationCancelledError());
    } else {
      task.resolve(result);
    }
  } catch (error) {
    task.reject(error);
  } finally {
    isRunning = false;
    queueMicrotask(drainQueue);
  }
}
