import { useRef, useState } from 'react';
import { RgbColorPicker } from 'react-colorful';
import { PRESETS } from './presets';
import { session, useSession } from './use-session';
import AudioPanel from './audio-panel';
const GROUPS = [['circleLEDs', 'Circle'], ['frontLegoLEDs', 'Front'], ['rearLegoLEDs', 'Rear'], ['buttonLEDs', 'Buttons']];
const COLORS = [['flRGB', 'Front left'], ['frRGB', 'Front right'], ['blRGB', 'Rear left'], ['brRGB', 'Rear right'], ['smallBottomRGB', 'Bottom'], ['smallBackRGB', 'Back']];
const SOUNDS = ['No sound', 'A3', 'Alarm', 'B3', 'Bad', 'Beep', 'Blop', 'Bye', 'C3', 'D3', 'Detect', 'E3', 'F3', 'Fall', 'G3', 'Good', 'Magic', 'Notify', 'Ping', 'Tick'];
const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || 0));
function ColorControl({
  name,
  value,
  onChange,
  disabled
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const rgb = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v * 17]));
  return <div className={`color-control ${open ? 'expanded' : ''}`} onKeyDown={e => {
    if (e.key === 'Escape') {
      setOpen(false);
      trigger.current.focus();
    }
  }}>
    <button ref={trigger} disabled={disabled} className="color-trigger" aria-expanded={open} onClick={() => setOpen(!open)}><span className="swatch" style={{
        backgroundColor: `rgb(${rgb.r},${rgb.g},${rgb.b})`
      }} /><span>{name}<small>R {value.r} · G {value.g} · B {value.b}</small></span><span aria-hidden="true">{open ? '−' : '+'}</span></button>
    {open && <fieldset disabled={disabled} className="picker"><RgbColorPicker color={rgb} onChange={color => onChange(Object.fromEntries(Object.entries(color).map(([k, v]) => [k, Math.round(v / 17)])))} /><div className="row">{['r', 'g', 'b'].map(k => <label key={k}>{k.toUpperCase()}<input aria-label={`${name} ${k.toUpperCase()}`} type="number" min="0" max="15" value={value[k]} onChange={e => onChange({
            ...value,
            [k]: clamp(e.target.value, 0, 15)
          })} /></label>)}</div></fieldset>}
  </div>;
}
export default function ActuatorPanel({ disabled }) {
  const { actuators: a, connection, ota, stopping } = useSession();
  const update = session.updateActuators;

  return (
    <div className="control-panel">
      <div className="controls-toolbar">
        <div className="presets" role="group" aria-label="Presets">
          <span className="muted">Presets</span>
          {PRESETS.map(p => (
            <button disabled={disabled} key={p.id} className="secondary" title={p.desc} onClick={() => update(p.data)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className="danger stop-robot" disabled={connection !== 'connected' || ota || stopping} onClick={session.stopRobot}>{stopping ? 'Stopping…' : '■ Stop robot'}</button>
      </div>

      <div className="controls-grid">
        <section className="control-section movement-section" aria-labelledby="movement-heading">
          <div className="section-heading">
            <h2 id="movement-heading">Movement</h2>
            <button className="secondary" disabled={disabled} onClick={() => update({ motorLeft: 0, motorRight: 0 })}>Stop motors</button>
          </div>
          <fieldset disabled={disabled} className="motor-controls">
            {[['motorLeft', 'Left'], ['motorRight', 'Right']].map(([key, name]) => (
              <div className="motor-control" key={key}>
                <label htmlFor={`${key}-slider`}>{name}</label>
                <div className="motor-range-field">
                  <input id={`${key}-slider`} aria-label={`${name} motor speed`} type="range" min="-1000" max="1000" value={a[key]} onChange={e => update({ [key]: Number(e.target.value) })} />
                  <div className="range-labels" aria-hidden="true"><span>−1000</span><span>0</span><span>+1000</span></div>
                </div>
                <input aria-label={`${name} motor numeric speed`} type="number" min="-1000" max="1000" value={a[key]} onChange={e => update({ [key]: clamp(e.target.value, -1000, 1000) })} />
              </div>
            ))}
          </fieldset>
          <div className="motor-directions"><span>← Reverse</span><span>Forward →</span></div>
        </section>

        <section className="control-section lights-section" aria-labelledby="lights-heading">
          <div className="section-heading"><h2 id="lights-heading">Lights</h2><span className="muted">Intensity 0–15</span></div>
          {GROUPS.map(([key, name]) => (
            <div className="led-group" key={key}>
              <fieldset disabled={disabled}>
                <label className="group-slider">
                  <strong>{name}</strong>
                  <input aria-label={`${name} all LED intensity`} type="range" min="0" max="15" value={Math.round(a[key].reduce((x, y) => x + y, 0) / a[key].length)} onChange={e => update({ [key]: a[key].map(() => Number(e.target.value)) })} />
                  <span>{a[key].every(v => v === a[key][0]) ? a[key][0] : 'Mixed'}</span>
                </label>
              </fieldset>
              <details>
                <summary>Individual LEDs</summary>
                <fieldset disabled={disabled} className="individual-leds">
                  {a[key].map((value, index) => (
                    <label key={index}>LED {index + 1}
                      <input aria-label={`${name} LED ${index + 1} intensity`} type="number" min="0" max="15" value={value} onChange={e => update({ [key]: a[key].map((v, i) => i === index ? clamp(e.target.value, 0, 15) : v) })} />
                    </label>
                  ))}
                </fieldset>
              </details>
            </div>
          ))}
          <h3 className="spaced-heading">RGB LEDs</h3>
          <div className="color-grid">
            {COLORS.map(([key, name]) => (
              <ColorControl key={key} name={name} value={a[key]} disabled={disabled} onChange={value => update({ [key]: value })} />
            ))}
          </div>
          <fieldset disabled={disabled} className="auxiliary-leds">
            <label className="group-slider">
              <span>Receiver</span>
              <input aria-label="Receiver LED intensity" type="range" min="0" max="15" value={a.receiverLED} onChange={e => update({ receiverLED: Number(e.target.value) })} />
              <output>{a.receiverLED}</output>
            </label>
            <label className="row">
              <input type="checkbox" checked={a.microphoneLED} onChange={e => update({ microphoneLED: e.target.checked })} />
              Microphone LED {a.microphoneLED ? 'on' : 'off'}
            </label>
          </fieldset>
        </section>

        <section className="control-section sound-section" aria-labelledby="sound-heading">
          <div className="section-heading"><h2 id="sound-heading">Sound</h2></div>
          <label className="sound-select">Built-in sound
            <select disabled={disabled} value={a.sound} onChange={e => update({ sound: Number(e.target.value) })}>
              {SOUNDS.map((sound, i) => <option key={sound} value={i}>{sound}</option>)}
            </select>
          </label>
          <AudioPanel disabled={disabled} />
        </section>
      </div>
    </div>
  );
}
