import { THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID } from "./constants";
import { queueBluetoothCall, runPriorityBluetoothCall } from "./bluetooth-queue";
import { createPayloadPackets } from "./utils";

export async function sendPythonScript(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
  script: string
) {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createPayloadPackets(scriptDataArray);

  for (const packet of packets) {
    await queueBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet));
  }
}

export async function executeLoadedScript(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
) {
  const packet = new Uint8Array([0x02]);

  await queueBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet));
}

export async function stopScriptExecution(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
) {
  const packet = new Uint8Array([0x03]);

  await runPriorityBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet));
}

export async function saveScriptToPartition(
	pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
	scriptId: number
) {
	if(!scriptId) {
		throw new Error("Script ID must not be empty");
	}

	return new Promise<void>((resolve, reject) => {
		const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      // We only care about the save to partition response (0x05)
      if (id === 0x05) {
				const result = view.getInt8(1);

				pythonCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

				switch(result) {
					case 0:
						resolve();
						break;
					case 1:
						reject(`[Python save file to partition]: ${scriptId} not found`);
						break;
					case 2:
						reject(`[Python save file to partition]: unknown error`);
						break;
				}
			}
		};

		pythonCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

		const id = 0x04;
		const packet = new Uint8Array([id, scriptId]);

		queueBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet)).catch(err => {
			pythonCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
			reject(err);
		});
	});
}

export async function softResetPythonInterpreter(
	pythonCharacteristic: BluetoothRemoteGATTCharacteristic
) {
	const packet = new Uint8Array([0x05]);

	await queueBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet));
}

export function handlePythonResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;
	if (value) {
		const id = value.getUint8(0);

		if (id === 0x01) {
			const loadResult = value.getUint8(1);

			switch(loadResult) {
				case 0:
					dispatchExecutionStatusEvent(true);
					console.log("[Python execution]: ✅ Script loaded successfully.");
					break;
				case 1:
					console.log("[Python execution]: ❌ CRC mismatch.");
					break;
				case 2:
					console.log("[Python execution]: ⚠️ Partial upload.");
					break;
				case 3:
					console.log("[Python execution]: ❌ Wrong sequence.");
					break;
				case 4:
					console.log("[Python execution]: ❌ Script too big (2 KB limit).");
					break;
				default:
					throw new Error("[Python execution]: Unknown return code.")
			}
		} else if (id === 0x02) {
			const result = value.getUint8(1);

			const exception = (result & 0b00000001) !== 0;
			const scriptRunning = (result & 0b00000010) !== 0;

			let terminationReason;
			if (!exception && !scriptRunning) {
				terminationReason = "✅ Script terminated normally.";
			} else {
				if (exception) {
					terminationReason = "❌ Script terminated with exception.";
				}
				else if (scriptRunning) {
					terminationReason = "⚠️ Another script was already running.";
				}
			}
			console.log(`[Python execution]: Script Terminated: ${terminationReason}`);

			dispatchExecutionStatusEvent(false);
		} else {
			console.warn(
				`[Notification] Unknown ID: 0x${id.toString(16).padStart(2, "0")}`
			);
		}
	}
}

function dispatchExecutionStatusEvent(executing: boolean) {
	const executionStatusEvent = new CustomEvent(THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID, {
		detail: executing
	});
	document.dispatchEvent(executionStatusEvent);
}
