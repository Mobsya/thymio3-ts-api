import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ActuatorPanel from './actuator-panel';
import DeviceMemoryStatus from './device-memory-status';
import FirmwareUpdatePanel from './firmware-update-panel';
import FilesPanel from './files-panel';
import PythonEditor from './python-editor';
import SensorPanel from './sensor-panel';
import StdoutPanel from './stdout-panel';
import { session, useSession } from './use-session';
import { Tabs, Confirm } from './ui';
const EXAMPLES = {
  blink: `import thymio\nimport time\n\nled = thymio.LEDS_RGB(0)\nwhile True:\n    led.set_intensity(15, 0, 0)\n    time.sleep(0.5)\n    led.set_intensity(0, 0, 0)\n    time.sleep(0.5)\n`,
  sensors: `import thymio\nimport time\n\nbuttons = thymio.BUTTONS()\nwhile True:\n    print(buttons.get_status())\n    time.sleep(0.2)\n`
};
const TABS = [['controls', 'Controls'], ['python', 'Python'], ['files', 'Files'], ['device', 'Device']];
export default function App() {
  const s = useSession();
  const header = useRef(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--app-header-height', `${header.current.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(header.current);
    return () => { observer.disconnect(); root.style.removeProperty('--app-header-height'); };
  }, []);
  const [tab, setTab] = useState('controls');
  const [code, setCode] = useState(EXAMPLES.blink);
  const [dirty, setDirty] = useState(false);
  const [example, setExample] = useState(null);
  const [slot, setSlot] = useState('1');
  const [apiReady, setApiReady] = useState(Boolean(window.thymio));
  useEffect(() => session.start(), []);
  useEffect(() => {
    if (apiReady) return;
    const id = setInterval(() => {
      if (window.thymio) setApiReady(true);
    }, 250);
    return () => clearInterval(id);
  }, [apiReady]);
  const connected = s.connection === 'connected';
  const robotName = connected ? s.deviceName : s.connection === 'reconnecting' ? s.lastDeviceName : '';
  const connectionLabel = {
    connected: 'Connected', connecting: 'Connecting…',
    reconnecting: 'Reconnecting…', disconnected: 'Disconnected',
  }[s.connection];
  const disabled = !connected || Boolean(s.busy) || s.stopping || s.ota;
  const reason = !connected ? '' : s.ota ? 'Firmware transfer in progress. Hardware controls and telemetry are suspended.' : s.stopping ? 'Sending stop commands…' : s.busy ? `${s.busy}…` : '';
  function loadExample(key) {
    setCode(EXAMPLES[key]);
    setDirty(false);
  }
  return <div className="app-shell">
    <header ref={header} className="app-header">
      <div className={`robot-panel ${s.connection}`}>
        <div className="robot-identity" role="status" aria-live="polite">
          <div className="robot-connection"><span className="status-dot" aria-hidden="true" />{connectionLabel}</div>
          <div className="robot-name">{robotName ? <><span>Robot: </span><strong>{robotName}</strong></> : <strong>{s.connection === 'connecting' ? 'Connecting to robot' : 'No robot connected'}</strong>}</div>
        </div>
        <button className={`robot-connect-button ${connected ? 'secondary' : ''}`} disabled={!apiReady || !navigator.bluetooth || s.ota || s.stopping || ['connecting', 'reconnecting'].includes(s.connection)} onClick={connected ? session.disconnect : session.connect}>{connected ? 'Disconnect' : s.connection === 'connecting' ? 'Connecting…' : 'Connect robot'}</button>
      </div>
      <DeviceMemoryStatus key={s.connection} isConnected={connected} isActive={!s.ota && !s.busy && !s.stopping} />
    </header>
    {!navigator.bluetooth && <div className="banner error-box">This browser does not expose Web Bluetooth. Open this demo in a browser with Web Bluetooth support over HTTPS or localhost.</div>}
    {!apiReady && <div className="banner" role="status">Loading the robot API… If this persists, reload the page.</div>}
    {s.notice && <div className={`banner ${s.notice.error ? 'error-box' : 'notice'}`} role={s.notice.error ? 'alert' : 'status'}>{s.notice.text}</div>}
    <main className="workbench-layout">
      <section className="workspace surface" aria-label="Robot workspace">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Workspace" prefix="workspace" />
        {reason && <p className="hardware-help" role="status">{reason}</p>}
        <div className={`workspace-content ${tab === 'controls' ? 'workspace-controls' : ''}`}>
          <section role="tabpanel" id="workspace-panel-controls" aria-labelledby="workspace-controls" hidden={tab !== 'controls'}><ActuatorPanel disabled={disabled} /></section>
          <section role="tabpanel" id="workspace-panel-python" aria-labelledby="workspace-python" hidden={tab !== 'python'}>
            <div className="section-heading"><div><h2>Python</h2></div><span className="status-badge">{s.execution}</span></div>
            <div className="toolbar"><label>Example<select value="" onChange={e => dirty ? setExample(e.target.value) : loadExample(e.target.value)}><option value="" disabled>Load an example</option><option value="blink">Blink LEDs</option><option value="sensors">Read sensors</option></select></label><div className="row"><button disabled={disabled} onClick={() => session.runCode(code)}>▶ Run</button><button className="secondary" disabled={!connected || s.ota || s.stopping} onClick={session.stopCode}>■ Stop</button></div></div>
            <div className="editor-frame">{tab === 'python' && <PythonEditor value={code} onChange={value => {
                setCode(value ?? '');
                setDirty(true);
              }} />}</div>
            <details className="advanced"><summary>Script storage & interpreter</summary><div className="row wrap"><label>Script slot<input type="number" min="1" max="255" step="1" value={slot} onChange={e => setSlot(e.target.value)} /></label><button disabled={disabled || !Number.isInteger(Number(slot)) || Number(slot) < 1 || Number(slot) > 255} onClick={() => session.perform('Save script', api => api.saveScriptToPartition(Number(slot)))}>Save loaded script</button><button className="secondary" disabled={disabled} onClick={() => session.perform('Reset interpreter', api => api.softResetPythonInterpreter())}>Reset interpreter</button></div><p className="muted">Saves the script already loaded on the robot. Run your edited code before saving.</p></details>
          </section>
          <section role="tabpanel" id="workspace-panel-files" aria-labelledby="workspace-files" hidden={tab !== 'files'}><FilesPanel disabled={disabled} active={tab === 'files'} /></section>
          <section role="tabpanel" id="workspace-panel-device" aria-labelledby="workspace-device" hidden={tab !== 'device'}>
            <div className="section-heading"><div><h2>Device</h2></div></div>
            <dl className="device-facts"><div><dt>Robot</dt><dd>{s.deviceName || 'Not connected'}</dd></div><div><dt>ESP32 firmware</dt><dd>{s.firmware?.esp32_ver || '—'}</dd></div><div><dt>STM32 firmware</dt><dd>{s.firmware?.stm32_ver || '—'}</dd></div></dl>
            <FirmwareUpdatePanel disabled={disabled} />
          </section>
        </div>
        <StdoutPanel entries={s.output} onClear={session.clearOutput} expandedByDefault={tab === 'python'} />
      </section>
      <aside className="telemetry surface"><SensorPanel /></aside>
    </main>
    {example && <Confirm title="Replace edited code?" destructive={false} onClose={() => setExample(null)} onConfirm={() => loadExample(example)}>Your current edits will be replaced with the selected example.</Confirm>}
  </div>;
}
