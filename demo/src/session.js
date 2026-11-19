export const defaultActuators = () => ({
  circleLEDs: Array(8).fill(0),
  frontLegoLEDs: Array(8).fill(0),
  rearLegoLEDs: Array(8).fill(0),
  flRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  frRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  blRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  brRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  smallBottomRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  smallBackRGB: {
    r: 0,
    g: 0,
    b: 0
  },
  motorLeft: 0,
  motorRight: 0,
  sound: 0,
  buttonLEDs: Array(4).fill(0),
  receiverLED: 0,
  microphoneLED: false
});
const message = error => error instanceof Error ? error.message : String(error);

// One controller owns hardware work, independently of which tab is visible.
export function createSession(getApi = () => window.thymio, events = document) {
  let state = {
    connection: 'disconnected',
    deviceName: '',
    lastDeviceName: '',
    firmware: null,
    notice: null,
    busy: '',
    ota: false,
    stopping: false,
    execution: 'Idle',
    stream: 'Disconnected',
    main: null,
    other: null,
    lastSample: null,
    history: [],
    output: [],
    actuators: defaultActuators()
  };
  let epoch = 0,
    operation = 0,
    runGeneration = 0,
    timer,
    pending,
    sending = false,
    outputId = 0;
  let intentionalDisconnect = false,
    connecting = false,
    streamGeneration = 0,
    suppressExecution = false;
  const listeners = new Set();
  const patch = change => {
    state = {
      ...state,
      ...change
    };
    listeners.forEach(fn => fn());
  };
  const cancelActuators = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  const available = () => state.connection === 'connected' && !state.ota && !state.stopping;
  const notify = (text, error = false) => patch({
    notice: {
      text,
      error
    }
  });
  async function perform(label, fn, {
    firmware = false
  } = {}) {
    if (!available() || state.busy) return {
      ok: false
    };
    const token = ++operation,
      generation = epoch;
    cancelActuators();
    patch({
      busy: label,
      ota: firmware,
      notice: null
    });
    const valid = () => generation === epoch && token === operation;
    try {
      const value = await fn(getApi(), valid);
      if (!valid()) return {
        ok: false
      };
      return {
        ok: true,
        value
      };
    } catch (error) {
      if (valid()) notify(`${label}: ${message(error)}`, true);
      return {
        ok: false
      };
    } finally {
      if (valid()) patch({
        busy: '',
        ota: false
      });
    }
  }
  async function streaming(enabled) {
    if (!available() || state.busy) return;
    const generation = epoch,
      token = ++streamGeneration;
    patch({
      stream: enabled ? 'Starting…' : 'Pausing…'
    });
    try {
      await getApi()[enabled ? 'startAllSensorStreaming' : 'stopSensorStreaming']();
      if (generation === epoch && token === streamGeneration && (!enabled || state.stream !== 'Live')) patch({
        stream: enabled ? 'Waiting for data' : 'Paused'
      });
    } catch (error) {
      if (generation === epoch && token === streamGeneration) {
        patch({
          stream: 'Error'
        });
        notify(`Sensors: ${message(error)}`, true);
      }
    }
  }
  async function connected(event) {
    const wasConnected = state.connection === 'connected';
    const generation = ++epoch;
    suppressExecution = false;
    ++operation;
    ++runGeneration;
    ++streamGeneration;
    cancelActuators();
    sending = false;
    patch({
      main: null,
      other: null,
      history: [],
      lastSample: null,
      firmware: null,
      busy: '',
      ota: false,
      stopping: false,
      execution: 'Idle',
      actuators: defaultActuators(),
      connection: event.detail ? 'connected' : intentionalDisconnect || connecting ? 'disconnected' : wasConnected ? 'reconnecting' : state.connection,
      deviceName: event.detail ? getApi()?.getDeviceName?.() || 'Thymio' : '',
      lastDeviceName: event.detail ? getApi()?.getDeviceName?.() || 'Thymio' : state.lastDeviceName,
      stream: event.detail ? 'Starting…' : 'Disconnected'
    });
    if (!event.detail) return;
    void streaming(true);
    try {
      const firmware = await getApi().getFirmwareInfo();
      if (generation === epoch) patch({
        firmware
      });
    } catch (error) {
      if (generation === epoch) notify(`Device info: ${message(error)}`, true);
    }
  }
  async function flush() {
    timer = undefined;
    if (sending || !pending || !available() || state.busy) return;
    const data = pending,
      generation = epoch;
    pending = null;
    sending = true;
    try {
      await getApi().setActuatorState(data);
    } catch (error) {
      if (generation === epoch && !state.stopping) notify(`Controls: ${message(error)}`, true);
    } finally {
      if (generation === epoch) {
        sending = false;
        if (pending && available()) timer = setTimeout(flush, 100);
      }
    }
  }
  function updateActuators(values) {
    if (!available() || state.busy) return;
    const next = {
      ...state.actuators,
      ...values
    };
    if (values.buttonLEDS) {
      next.buttonLEDs = values.buttonLEDS;
      delete next.buttonLEDS;
    }
    patch({
      actuators: next
    });
    pending = next;
    if (!timer && !sending) timer = setTimeout(flush, 100);
  }
  async function stopRobot() {
    if (!available()) return;
    const generation = epoch;
    ++operation;
    ++runGeneration;
    ++streamGeneration;
    suppressExecution = true;
    cancelActuators();
    const stopped = {
      ...state.actuators,
      motorLeft: 0,
      motorRight: 0,
      sound: 0
    };
    patch({
      stopping: true,
      busy: '',
      actuators: stopped,
      notice: null
    });
    const failures = [];
    for (const [name, action] of [['Python', () => getApi().stopScriptExecution()], ['Motors', () => getApi().setActuatorState(stopped)], ['Audio', () => getApi().stopAudioFile()]]) {
      if (generation !== epoch) return;
      try {
        await action();
      } catch (error) {
        failures.push(`${name}: ${message(error)}`);
      }
    }
    if (generation === epoch) {
      patch({
        stopping: false,
        execution: failures.some(f => f.startsWith('Python:')) ? 'Unknown' : 'Idle'
      });
      if (failures.length) notify(`Stop incomplete. ${failures.join('; ')}`, true);
    }
  }
  async function runCode(code) {
    if (!available() || state.busy) return;
    suppressExecution = false;
    const token = ++runGeneration;
    const result = await perform('Run script', async (api, valid) => {
      patch({
        execution: 'Uploading…'
      });
      await api.sendPythonScript(code);
      if (!valid() || token !== runGeneration) return;
      await api.executeLoadedScript();
      if (valid() && token === runGeneration) patch({
        execution: 'Running'
      });
    });
    if (!result.ok && token === runGeneration) patch({
      execution: 'Error'
    });
  }
  const handlers = {
    'thymio-connected': connected,
    'thymio-prompt-manual-reconnection': () => {
      connected({
        detail: false
      });
      patch({
        connection: 'disconnected'
      });
      notify('Connection lost. Connect again to retry.', true);
    },
    'thymio-python-execution-status': e => {
      if (state.connection === 'connected' && !state.stopping && state.execution !== 'Uploading…' && (!e.detail || !suppressExecution)) patch({
        execution: e.detail ? 'Running' : 'Idle'
      });
    },
    'thymio-std-out-values': e => {
      if (state.connection === 'connected') patch({
        output: [...state.output.slice(-1999), {
          id: ++outputId,
          value: String(e.detail ?? '')
        }]
      });
    },
    'thymio-sensor-values': e => {
      if (!available() || ['Paused', 'Pausing…'].includes(state.stream)) return;
      const time = Date.now();
      patch({
        main: e.detail,
        lastSample: time,
        stream: 'Live',
        history: [...state.history.slice(-59), {
          time,
          ...e.detail
        }]
      });
    },
    'thymio-sensor-other-values': e => {
      if (available() && !['Paused', 'Pausing…'].includes(state.stream)) patch({
        other: e.detail,
        lastSample: Date.now()
      });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start() {
      Object.entries(handlers).forEach(([name, fn]) => events.addEventListener(name, fn));
      return () => {
        Object.entries(handlers).forEach(([name, fn]) => events.removeEventListener(name, fn));
        cancelActuators();
      };
    },
    async connect() {
      if (!getApi()?.requestAndConnect) return notify('Robot API is loading. Try again shortly.', true);
      connecting = true;
      patch({
        connection: 'connecting',
        notice: null
      });
      try {
        await getApi().requestAndConnect();
      } catch (error) {
        notify(`Connection: ${message(error)}`, true);
      } finally {
        connecting = false;
        if (!getApi()?.isConnected()) {
          patch({
            connection: 'disconnected'
          });
          notify('No robot connected. Check Bluetooth and choose a powered-on Thymio.');
        }
      }
    },
    async disconnect() {
      intentionalDisconnect = true;
      cancelActuators();
      try {
        await getApi().disconnect();
        patch({
          connection: 'disconnected'
        });
      } catch (error) {
        notify(`Disconnect: ${message(error)}`, true);
      } finally {
        intentionalDisconnect = false;
      }
    },
    perform,
    updateActuators,
    stopRobot,
    runCode,
    streaming,
    notify,
    clearOutput: () => patch({
      output: []
    }),
    async stopCode() {
      if (!available()) return;
      suppressExecution = true;
      ++runGeneration;
      ++operation;
      cancelActuators();
      patch({
        busy: ''
      });
      await perform('Stop script', async (api, valid) => {
        await api.stopScriptExecution();
        if (valid()) patch({
          execution: 'Idle'
        });
      });
    },
    async cancelFirmware() {
      if (!state.ota) return;
      try {
        await getApi().stopFirmwareUpload();
      } catch (error) {
        notify(`Cancel update: ${message(error)}`, true);
      }
    }
  };
}
