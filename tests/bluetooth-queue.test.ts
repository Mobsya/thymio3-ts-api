import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, flushMicrotasks } from './helpers/fake-bluetooth';

describe('Bluetooth operation queue', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('runs normal Bluetooth calls serially', async () => {
    const { queueBluetoothCall } = await import('../src/bluetooth-queue');
    const order: string[] = [];
    const releaseFirst = createDeferred();

    const first = queueBluetoothCall(async () => {
      order.push('first:start');
      await releaseFirst.promise;
      order.push('first:end');
      return 1;
    });
    const second = queueBluetoothCall(() => {
      order.push('second');
      return 2;
    });

    await flushMicrotasks();
    expect(order).toEqual(['first:start']);

    releaseFirst.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it.each(['GATT operation', 'Connection'])('retries a transient %s busy error without overlapping later work', async (operation) => {
    vi.useFakeTimers();
    const { queueBluetoothCall } = await import('../src/bluetooth-queue');
    const busy = new DOMException(`${operation} already in progress.`, 'NetworkError');
    const run = vi.fn().mockRejectedValueOnce(busy).mockResolvedValue('ready');
    const next = vi.fn();
    const first = queueBluetoothCall(run);
    const second = queueBluetoothCall(next);
    await flushMicrotasks();
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await expect(first).resolves.toBe('ready');
    await second;
    expect(run).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('bounds busy retries and propagates other errors immediately', async () => {
    vi.useFakeTimers();
    const { queueBluetoothCall } = await import('../src/bluetooth-queue');
    const busy = new DOMException('GATT operation already in progress.', 'NetworkError');
    const run = vi.fn().mockRejectedValue(busy);
    const rejected = expect(queueBluetoothCall(run)).rejects.toBe(busy);
    await vi.advanceTimersByTimeAsync(3100);
    await rejected;
    expect(run).toHaveBeenCalledTimes(6);
    const cancelled = new DOMException('User cancelled', 'NotFoundError');
    const cancel = vi.fn().mockRejectedValue(cancelled);
    await expect(queueBluetoothCall(cancel)).rejects.toBe(cancelled);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not retry old busy work after disconnect', async () => {
    vi.useFakeTimers();
    const { queueBluetoothCall, resetBluetoothQueue } = await import('../src/bluetooth-queue');
    const run = vi.fn().mockRejectedValue(new DOMException('GATT operation already in progress.', 'NetworkError'));
    const rejected = expect(queueBluetoothCall(run)).rejects.toThrow('Bluetooth disconnected');
    await flushMicrotasks();
    resetBluetoothQueue();
    await rejected;
    await queueBluetoothCall(() => 'new connection');
    await vi.advanceTimersByTimeAsync(3100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancels old work on disconnect and ignores late completions while a new call runs', async () => {
    const { queueBluetoothCall, queuePriorityBluetoothCall, resetBluetoothQueue } = await import('../src/bluetooth-queue');
    const oldNativeCall = createDeferred();
    const oldCall = queueBluetoothCall(() => oldNativeCall.promise);
    const pendingRun = vi.fn();
    const pending = queueBluetoothCall(pendingRun);
    const pendingPriority = queuePriorityBluetoothCall(pendingRun);
    const rejected = [oldCall, pending, pendingPriority].map(call => expect(call).rejects.toThrow('Bluetooth disconnected'));

    resetBluetoothQueue();
    await Promise.all(rejected);
    expect(pendingRun).not.toHaveBeenCalled();

    const newNativeCall = createDeferred();
    const newCall = queueBluetoothCall(() => newNativeCall.promise);
    const nextRun = vi.fn();
    const nextCall = queueBluetoothCall(nextRun);
    oldNativeCall.resolve();
    await flushMicrotasks();
    expect(nextRun).not.toHaveBeenCalled();
    newNativeCall.resolve();
    await Promise.all([newCall, nextCall]);
    expect(nextRun).toHaveBeenCalledTimes(1);
  });

  it('cancels queued/running normal calls when a priority operation runs', async () => {
    const { queueBluetoothCall, runPriorityBluetoothCall } = await import('../src/bluetooth-queue');
    const order: string[] = [];
    const releaseFirst = createDeferred();

    const first = queueBluetoothCall(async () => {
      order.push('first');
      await releaseFirst.promise;
      return 'normal';
    });
    const second = queueBluetoothCall(() => 'second');

    await flushMicrotasks();

    const priority = runPriorityBluetoothCall(() => {
      order.push('priority');
      return 'priority';
    });

    await expect(second).rejects.toThrow('[Thymio 3 API] Bluetooth operation cancelled by stop operation');

    releaseFirst.resolve();

    await expect(first).rejects.toThrow('[Thymio 3 API] Bluetooth operation cancelled by stop operation');
    await expect(priority).resolves.toBe('priority');
    expect(order).toEqual(['first', 'priority']);
  });
});
