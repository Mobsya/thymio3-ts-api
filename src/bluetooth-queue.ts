const BLUETOOTH_OPERATION_CANCELLED_MESSAGE = "[Thymio 3 API] Bluetooth operation cancelled by stop operation";

type BluetoothTask<T> = {
  run: () => Promise<T> | T,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void,
  generation: number,
  connection: number,
  priority: boolean
};

const normalQueue: BluetoothTask<unknown>[] = [];
const priorityQueue: BluetoothTask<unknown>[] = [];
let runningTask: BluetoothTask<unknown> | undefined;
let cancellationGeneration = 0;
let connectionGeneration = 0;
const BUSY_RETRY_DELAYS_MS = [100, 200, 400, 800, 1600];

export function isBluetoothBusyError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NetworkError' &&
    /(?:GATT operation|Connection) already in progress/i.test(error.message);
}

// Call only after the link has been disconnected: an unresolved native call
// from that link must not hold up operations on the next connection.
export function resetBluetoothQueue(): void {
  connectionGeneration++;
  const error = new Error('[Thymio 3 API] Bluetooth disconnected');
  for (const task of [...priorityQueue.splice(0), ...normalQueue.splice(0)]) task.reject(error);
  runningTask?.reject(error);
  runningTask = undefined;
}

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
      connection: connectionGeneration,
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
  if (runningTask) return;

  const task = priorityQueue.shift() ?? normalQueue.shift();
  if (!task) return;

  runningTask = task;
  try {
    const result = await runTask(task);
    if (task.connection !== connectionGeneration) return;
    if (!task.priority && task.generation !== cancellationGeneration) {
      task.reject(createBluetoothOperationCancelledError());
    } else {
      task.resolve(result);
    }
  } catch (error) {
    task.reject(error);
  } finally {
    // A late completion from the previous link cannot unlock the new queue.
    if (runningTask === task) {
      runningTask = undefined;
      queueMicrotask(drainQueue);
    }
  }
}

async function runTask(task: BluetoothTask<unknown>): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    if (task.connection !== connectionGeneration ||
        (!task.priority && task.generation !== cancellationGeneration)) {
      throw createBluetoothOperationCancelledError();
    }
    try {
      return await task.run();
    } catch (error) {
      // Some stacks finish native teardown after their previous promise settles.
      // Retry only explicit busy rejections (the operation has not started),
      // retaining the queue lock. Other failures, including cancellation, pass through.
      const wait = BUSY_RETRY_DELAYS_MS[attempt];
      if (!isBluetoothBusyError(error) || wait === undefined) throw error;
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}
