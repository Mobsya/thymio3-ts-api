type ThymioCharacteristic = {
	serviceUUID: BluetoothServiceUUID,
	charUUID: BluetoothCharacteristicUUID,
	handler?: (event: Event) => void,
};

type SubRecord = {
	char: BluetoothRemoteGATTCharacteristic;
	handler?: (event: Event) => void;
};

export class BleSubscriptionManager {
	private gatt: BluetoothRemoteGATTServer;
	private characteristics: ThymioCharacteristic[];
	private subs = new Map<string, SubRecord>();

	constructor(
		gatt: BluetoothRemoteGATTServer,
		characteristics: ThymioCharacteristic[]
	) {
		this.gatt = gatt;
		this.characteristics = characteristics;
	}

	private key(
		serviceUUID: BluetoothServiceUUID,
		charUUID: BluetoothCharacteristicUUID,
	): string {
		return `${String(serviceUUID).toLowerCase()}::${String(charUUID).toLowerCase()}`;
	}

	/**
	 * Subscribe to notifications for a characteristic.
	 * Idempotent: calling twice returns the existing subscription without adding listeners twice.
	 */
	async subscribe(char: ThymioCharacteristic): Promise<BluetoothRemoteGATTCharacteristic> {
		if (!this.gatt?.connected) {
			throw new Error("GATT is not connected.");
		}

		const k = this.key(char.serviceUUID, char.charUUID);

		const existing = this.subs.get(k);
		if (existing) return existing.char;

		const service = await this.gatt.getPrimaryService(char.serviceUUID);
		const characteristic = await service.getCharacteristic(char.charUUID);

		await characteristic.startNotifications();

		/*
    const handler = (event: Event) => {
      const c = event.target as BluetoothRemoteGATTCharacteristic;
      // c.value is a DataView when notifications arrive
      if (!c.value) return;
      onValue(c.value, event);
    };

    characteristic.addEventListener("characteristicvaluechanged", handler);
    */

		if (char.handler) {
			try {
        characteristic.addEventListener("characteristicvaluechanged", char.handler);
			} catch (err) {
				// Roll back if enabling notifications fails
				characteristic.removeEventListener(
					"characteristicvaluechanged",
					char.handler,
				);
				throw err;
			}
		}

		this.subs.set(k, { char: characteristic, handler: char.handler });
		return characteristic;
	}

	async subscribeMany(chars: ThymioCharacteristic[]): Promise<void> {
		if (!this.gatt?.connected) {
			throw new Error("GATT is not connected.");
		}

    for (const char of chars) {
      await this.subscribe(char);
    }
  }

	async subscribeAll(): Promise<void> {
		return this.subscribeMany(this.characteristics);
	}

	/**
	 * Unsubscribe from one characteristic (stop notifications + remove listener).
	 * Returns true if there was an active subscription, false otherwise.
	 */
	async unsubscribe(characteristic: ThymioCharacteristic): Promise<boolean> {
		const k = this.key(characteristic.serviceUUID, characteristic.charUUID);
		const sub = this.subs.get(k);
		if (!sub) return false;

		const { char: foundChar, handler } = sub;

		if (handler) {
			// Stop app-level handling immediately
			foundChar.removeEventListener("characteristicvaluechanged", handler);
		}

		try {
			// May throw if disconnected; we still clear our map
			await foundChar.stopNotifications();
		} finally {
			this.subs.delete(k);
		}

		return true;
	}

	/**
	 * List active subscriptions for a given service.
	 * Returns keys in the form "service::characteristic".
	 */
	listByService(serviceUUID: BluetoothServiceUUID): string[] {
		const serviceKey = String(serviceUUID).toLowerCase();
		const prefix = `${serviceKey}::`;

		return Array.from(this.subs.keys()).filter((k) => k.startsWith(prefix));
	}

	/**
	 * Unsubscribe from all characteristics belonging to a given service.
	 * Continues even if one characteristic errors.
	 */
	async unsubscribeService(serviceUUID: BluetoothServiceUUID): Promise<{
		ok: string[];
		failed: Array<{ key: string; error: unknown }>;
	}> {
		const serviceKey = String(serviceUUID).toLowerCase();

		const entries = Array.from(this.subs.entries()).filter(([k]) =>
			k.startsWith(`${serviceKey}::`),
		);

		const ok: string[] = [];
		const failed: Array<{ key: string; error: unknown }> = [];

		for (const [k, { char, handler }] of entries) {
      if (handler) {
        // Stop app-level handling immediately
        char.removeEventListener("characteristicvaluechanged", handler);
      }

			try {
				await char.stopNotifications();
				ok.push(k);
			} catch (error) {
				failed.push({ key: k, error });
			} finally {
				this.subs.delete(k);
			}
		}

		return { ok, failed };
	}

	/**
	 * Unsubscribe from everything (without disconnecting).
	 * Continues even if one characteristic errors.
	 */
	async unsubscribeAll(): Promise<{
		ok: string[];
		failed: Array<{ key: string; error: unknown }>;
	}> {
		const entries = Array.from(this.subs.entries());

		const ok: string[] = [];
		const failed: Array<{ key: string; error: unknown }> = [];

		for (const [k, { char, handler }] of entries) {
			if (handler) {
				char.removeEventListener("characteristicvaluechanged", handler);
			}

			try {
				await char.stopNotifications();
				ok.push(k);
			} catch (error) {
				failed.push({ key: k, error });
			} finally {
				this.subs.delete(k);
			}
		}

		return { ok, failed };
	}

	/** List active subscriptions as "service::characteristic" keys. */
	list(): string[] {
		return Array.from(this.subs.keys());
	}

	getCharacteristic(
		serviceUUID: BluetoothServiceUUID,
		charUUID: BluetoothCharacteristicUUID,
	): BluetoothRemoteGATTCharacteristic {
		const c = this.subs.get(this.key(serviceUUID, charUUID))?.char;
		if (!c) {
			throw new Error(
				`No active subscription for ${String(serviceUUID)}::${String(charUUID)}.`,
			);
		}
		return c;
	}
}

///// How to use

/*
// After you connect:
const device = await navigator.bluetooth.requestDevice({
	filters: [{ services: ["battery_service"] }],
	optionalServices: ["device_information"], // etc
});
const server = await device.gatt.connect();

const subs = new BleSubscriptionManager(server);

// Subscribe
await subs.subscribe("battery_service", "battery_level", (dv) => {
	const level = dv.getUint8(0);
	console.log("Battery:", level, "%");
});

// Later: unsubscribe one
await subs.unsubscribe("battery_service", "battery_level");

// Or: unsubscribe all without disconnecting
const result = await subs.unsubscribeAll();
console.log(result);

// Disconnect only if you want
// device.gatt.disconnect();
*/
