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
