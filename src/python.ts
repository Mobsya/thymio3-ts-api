import { THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID, THYMIO_PYTHON_LOAD_RESULT_EVENT_ID } from "./constants";
import { queueBluetoothCall, runPriorityBluetoothCall } from "./bluetooth-queue";
import { createPayloadPackets } from "./utils";

const PYTHON_LOAD_SUCCESS_RESPONSE_ID = 0x01;
const PYTHON_LOAD_ACK_TIMEOUT_MS = 10_000;

type PythonLoadResult = {
  success: boolean,
  code: number,
  message: string
};

export async function sendPythonScript(
  pythonCharacteristic: BluetoothRemoteGATTCharacteristic,
  script: string
): Promise<void> {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createPayloadPackets(scriptDataArray);

  return new Promise<void>(async (resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      pythonCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    const settle = (callback: () => void) => {
      if (settled) return;

      settled = true;
      cleanup();
      callback();
    };

    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const id = value.getUint8(0);
      if (id !== PYTHON_LOAD_SUCCESS_RESPONSE_ID) return;

      const loadResult = getPythonLoadResult(value.getUint8(1));
      dispatchPythonLoadResultEvent(loadResult);

      if (loadResult.success) {
        dispatchExecutionStatusEvent(true);
        settle(resolve);
      } else {
        settle(() => reject(new Error(`[Python upload]: ${loadResult.message}`)));
      }
    };

    pythonCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      for (const packet of packets) {
        await queueBluetoothCall(() => pythonCharacteristic.writeValueWithResponse(packet));
        if (settled) return;
      }

      timeoutId = setTimeout(() => {
        settle(() => reject(new Error("[Python upload]: Timed out waiting for load ACK")));
      }, PYTHON_LOAD_ACK_TIMEOUT_MS);
    } catch (err) {
      settle(() => reject(err));
    }
  });
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

		if (id === 0x02) {
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
		} else if (id !== PYTHON_LOAD_SUCCESS_RESPONSE_ID) {
			console.warn(
				`[Notification] Unknown ID: 0x${id.toString(16).padStart(2, "0")}`
			);
		}
	}
}

function getPythonLoadResult(code: number): PythonLoadResult {
  switch(code) {
    case 0:
      return { success: true, code, message: "Script loaded successfully" };
    case 1:
      return { success: false, code, message: "CRC mismatch" };
    case 2:
      return { success: false, code, message: "Partial upload" };
    case 3:
      return { success: false, code, message: "Wrong sequence" };
    case 4:
      return { success: false, code, message: "Script too big" };
    default:
      return { success: false, code, message: `Unknown response code ${code}` };
  }
}

function dispatchPythonLoadResultEvent(result: PythonLoadResult) {
  const pythonLoadResultEvent = new CustomEvent(THYMIO_PYTHON_LOAD_RESULT_EVENT_ID, {
    detail: {
      success: result.success,
      code: result.code,
      message: result.message
    }
  });
  document.dispatchEvent(pythonLoadResultEvent);
}

function dispatchExecutionStatusEvent(executing: boolean) {
	const executionStatusEvent = new CustomEvent(THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID, {
		detail: executing
	});
	document.dispatchEvent(executionStatusEvent);
}
