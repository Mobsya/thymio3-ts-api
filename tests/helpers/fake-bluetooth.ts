/// <reference types="web-bluetooth" />

export type WriteHook = (
  data: Uint8Array<ArrayBuffer>,
  characteristic: FakeBluetoothCharacteristic
) => void | Promise<void>;

type FakeCharacteristicOptions = {
  writeWithoutResponse?: boolean,
  maxWriteWithoutResponseBytes?: number,
  rejectWriteWithoutResponse?: boolean,
  onWriteWithResponse?: WriteHook,
  onWriteWithoutResponse?: WriteHook
};

export class FakeBluetoothCharacteristic extends EventTarget {
  value?: DataView<ArrayBuffer>;
  properties: BluetoothCharacteristicProperties;
  writesWithResponse: Uint8Array<ArrayBuffer>[] = [];
  writesWithoutResponse: Uint8Array<ArrayBuffer>[] = [];
  writeWithoutResponseAttempts: Uint8Array<ArrayBuffer>[] = [];
  startNotificationsCount = 0;
  stopNotificationsCount = 0;
  notificationsStarted = false;
  onWriteWithResponse?: WriteHook;
  onWriteWithoutResponse?: WriteHook;
  private maxWriteWithoutResponseBytes?: number;
  private rejectWriteWithoutResponse: boolean;

  constructor(options: FakeCharacteristicOptions = {}) {
    super();
    this.properties = {
      writeWithoutResponse: options.writeWithoutResponse ?? false,
    } as BluetoothCharacteristicProperties;
    this.maxWriteWithoutResponseBytes = options.maxWriteWithoutResponseBytes;
    this.rejectWriteWithoutResponse = options.rejectWriteWithoutResponse ?? false;
    this.onWriteWithResponse = options.onWriteWithResponse;
    this.onWriteWithoutResponse = options.onWriteWithoutResponse;
  }

  async writeValueWithResponse(value: BufferSource): Promise<void> {
    const data = copyBufferSource(value);
    this.writesWithResponse.push(data);
    await this.onWriteWithResponse?.(data, this);
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    const data = copyBufferSource(value);
    this.writeWithoutResponseAttempts.push(data);

    if (
      this.rejectWriteWithoutResponse ||
      (
        this.maxWriteWithoutResponseBytes !== undefined &&
        data.byteLength > this.maxWriteWithoutResponseBytes
      )
    ) {
      throw new Error(`Rejected write without response of ${data.byteLength} bytes`);
    }

    this.writesWithoutResponse.push(data);
    await this.onWriteWithoutResponse?.(data, this);
  }

  async startNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    this.startNotificationsCount++;
    this.notificationsStarted = true;
    return this.asBluetoothCharacteristic();
  }

  async stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    this.stopNotificationsCount++;
    this.notificationsStarted = false;
    return this.asBluetoothCharacteristic();
  }

  setValue(data: Uint8Array | number[]): void {
    const bytes = copyBytes(data);
    this.value = new DataView(bytes.buffer);
  }

  emitValue(data: Uint8Array | number[]): void {
    this.setValue(data);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }

  asBluetoothCharacteristic(): BluetoothRemoteGATTCharacteristic {
    return this as unknown as BluetoothRemoteGATTCharacteristic;
  }
}

export class FakeBluetoothService {
  constructor(
    private readonly characteristics: Map<BluetoothCharacteristicUUID, FakeBluetoothCharacteristic>
  ) {}

  async getCharacteristic(uuid: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic> {
    const characteristic = this.characteristics.get(uuid);
    if (!characteristic) {
      throw new Error(`Unknown characteristic ${String(uuid)}`);
    }
    return characteristic.asBluetoothCharacteristic();
  }
}

export class FakeBluetoothServer {
  connected: boolean;

  constructor(
    private readonly services: Map<BluetoothServiceUUID, FakeBluetoothService>,
    connected = true
  ) {
    this.connected = connected;
  }

  async connect(): Promise<BluetoothRemoteGATTServer> {
    this.connected = true;
    return this.asBluetoothServer();
  }

  disconnect(): void {
    this.connected = false;
  }

  async getPrimaryService(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService> {
    const service = this.services.get(uuid);
    if (!service) {
      throw new Error(`Unknown service ${String(uuid)}`);
    }
    return service as unknown as BluetoothRemoteGATTService;
  }

  asBluetoothServer(): BluetoothRemoteGATTServer {
    return this as unknown as BluetoothRemoteGATTServer;
  }
}

export class FakeBluetoothDevice extends EventTarget {
  gatt?: BluetoothRemoteGATTServer;

  constructor(readonly name: string | undefined, server?: FakeBluetoothServer) {
    super();
    this.gatt = server?.asBluetoothServer();
  }

  asBluetoothDevice(): BluetoothDevice {
    return this as unknown as BluetoothDevice;
  }
}

export function copyBufferSource(value: BufferSource): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(value.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }

  return new Uint8Array(value.slice(0));
}

export function copyBytes(data: Uint8Array | number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

export function bytesOf(value: Uint8Array<ArrayBuffer>): number[] {
  return Array.from(value);
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export function collectDocumentEventDetails<T>(eventName: string): {
  details: T[],
  stop: () => void
} {
  const details: T[] = [];
  const listener = (event: Event) => {
    details.push((event as CustomEvent<T>).detail);
  };
  document.addEventListener(eventName, listener);

  return {
    details,
    stop: () => document.removeEventListener(eventName, listener),
  };
}

export function createDeferred<T = void>(): {
  promise: Promise<T>,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
