import { useState } from 'react';
import { session, useSession } from './use-session';
import SensorFocusPanel from './sensor-focus-panel';
import { SENSOR_FOCUS_SENSOR_IDS } from './sensor-options';
import { Tabs } from './ui';

const SENSOR_TABS = [['values', 'Values'], ['trends', 'Trends']];

const TREND_READINGS = [
  ['Ground · left', v => v.groundSensors?.left],
  ['Ground · right', v => v.groundSensors?.right],
  ['Proximity · left', v => v.proximitySensors?.left],
  ['Proximity · front left', v => v.proximitySensors?.frontLeft],
  ['Proximity · center', v => v.proximitySensors?.center],
  ['Proximity · front right', v => v.proximitySensors?.frontRight],
  ['Proximity · right', v => v.proximitySensors?.right],
  ['Proximity · back left', v => v.proximitySensors?.backLeft],
  ['Proximity · back right', v => v.proximitySensors?.backRight],
  ['Microphone', v => v.microphoneVolume],
];

function Trend({
  history,
  name,
  read
}) {
  const values = history.map(read).filter(Number.isFinite);
  const max = Math.max(1, ...values),
    min = Math.min(0, ...values);
  const y = value => 76 - (value - min) / (max - min) * 64;
  const ticks = [max, (min + max) / 2, min];
  const points = values.map((value, index) => `${46 + index / Math.max(1, values.length - 1) * 246},${y(value)}`).join(' ');
  return <div className="trend">
    <div className="row between"><strong>{name}</strong><span>Raw values</span></div>
    <svg role="img" aria-label={`${name}, last ${values.length} samples, raw scale ${min} to ${max}`} viewBox="0 0 300 90">
      {ticks.map(value => <g key={value} className="trend-axis-tick">
        <text x="39" y={y(value)} textAnchor="end" dominantBaseline="middle">{value}</text>
        <path d={`M42 ${y(value)}H292`} className="trend-gridline" />
      </g>)}
      <path d="M46 12V76" className="trend-axis" />
      {values.length > 1 && <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />}
      {values.length === 1 && <circle cx="46" cy={y(values[0])} r="2.5" fill="currentColor" />}
    </svg>
  </div>;
}
export default function SensorPanel() {
  const s = useSession();
  const [selected, setSelected] = useState(SENSOR_FOCUS_SENSOR_IDS);
  const [selector, setSelector] = useState(false);
  const [tab, setTab] = useState('values');
  const disabled = s.connection !== 'connected' || s.ota || Boolean(s.busy) || s.stopping;
  const paused = ['Paused', 'Disconnected', 'Error'].includes(s.stream);
  return <section className="sensor-panel">
    <div className="telemetry-heading"><h2>Sensors</h2><span className="sensor-received">{s.lastSample ? `Received ${new Date(s.lastSample).toLocaleTimeString()}` : 'No samples yet'}</span></div>
    <div className="sensor-actions">
      <span className={`status-badge ${s.stream === 'Live' && !s.ota ? 'live' : ''}`}>{s.ota ? 'Suspended' : s.stream}</span>
      <button className="secondary" disabled={disabled || ['Starting…', 'Pausing…'].includes(s.stream)} onClick={() => session.streaming(paused)}>{paused ? 'Resume' : 'Pause'}</button>
      {tab === 'values' && <button className="secondary" aria-expanded={selector} onClick={() => setSelector(!selector)}>Choose sensors</button>}
    </div>
    <div id="sensor-body">
      <Tabs items={SENSOR_TABS} value={tab} onChange={setTab} label="Sensor view" prefix="sensors" />
      <div role="tabpanel" id="sensors-panel-values" aria-labelledby="sensors-values" hidden={tab !== 'values'}>
        <SensorFocusPanel mainSensors={s.main} otherSensors={s.other} focusedSensors={selected} onFocusedSensorsChange={setSelected} showSelector={selector} />
      </div>
      <div role="tabpanel" id="sensors-panel-trends" aria-labelledby="sensors-trends" hidden={tab !== 'trends'} className="trends"><h3>Recent samples</h3><p className="muted">Up to 60 samples. Scales follow the observed raw values.</p>{tab === 'trends' && TREND_READINGS.map(([name, read]) => <Trend key={name} history={s.history} name={name} read={read} />)}</div>
    </div>
  </section>;
}
