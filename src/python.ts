import { createPayloadPackets } from "./utils";

export async function sendPythonScript(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
  script: string
) {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createPayloadPackets(scriptDataArray);

  for (const packet of packets) {
    await pythonCharacteristic.writeValueWithResponse(packet);
  }
}

export async function executeLoadedScript(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
) {
  const packet = new Uint8Array([0x02]);

  await pythonCharacteristic.writeValueWithResponse(packet);
}

export async function stopScriptExecution(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
) {
  const packet = new Uint8Array([0x03]);

  await pythonCharacteristic.writeValueWithResponse(packet);
}

export async function saveScriptToPartition(
	pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
	scriptId: number
) {
	const id = 0x04;
	const packet = new Uint8Array([id, scriptId]);

	await pythonCharacteristic.writeValueWithResponse(packet);
}

export async function softResetPythonInterpreter(
	pythonCharacteristic: BluetoothRemoteGATTCharacteristic
) {
	const packet = new Uint8Array([0x05]);

	await pythonCharacteristic.writeValueWithResponse(packet);
}

export function handlePythonResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;
	if (value) {
		const id = value.getUint8(0);

		if (id === 0x01) {
			const loadResult = value.getUint8(1);
			const resultMessages: {[index: number]: string} = {
				0: "✅ Script loaded successfully.",
				1: "❌ CRC mismatch.",
				2: "⚠️ Partial upload.",
				3: "❌ Wrong sequence.",
				4: "❌ Script too big (2 KB limit).",
				// Add more error codes if needed
			};

			console.log(
				`[Notification] Script Loaded: ${resultMessages[loadResult] || "Unknown error code: " + loadResult}`
			);
		} else if (id === 0x02) {
			const result = value.getUint8(1);

			const exception = (result & 0b00000001) !== 0;
			const scriptRunning = (result & 0b00000010) !== 0;

			console.log("[Notification] Script Terminated:");
			if (!exception && !scriptRunning) {
				console.log("✅ Script terminated normally.");
			} else {
				if (exception) console.log("❌ Script terminated with exception.");
				if (scriptRunning)
					console.log("⚠️ Another script was already running.");
			}
		} else {
			console.warn(
				`[Notification] Unknown ID: 0x${id.toString(16).padStart(2, "0")}`
			);
		}
	}
}
