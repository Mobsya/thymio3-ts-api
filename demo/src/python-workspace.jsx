import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PythonEditor from './python-editor';
import { EXAMPLES } from './python-examples';
import { PythonLibrary } from './python-library';
import { Confirm } from './ui';
import { session, useSession } from './use-session';
import './python-workspace.css';

const DRAFT_KEY = 'thymio.demo.python.draft.v1';
function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (typeof saved?.code === 'string' && typeof saved.filename === 'string') return saved;
  } catch { /* Storage can be unavailable in private browsing. */ }
  return { filename: 'main.py', code: EXAMPLES[0].code, dirty: false };
}

function RobotTools({ disabled }) {
  const [slot, setSlot] = useState('1');
  const valid = Number.isInteger(Number(slot)) && +slot >= 1 && +slot <= 255;
  return <div className="ide-tools" role="group" aria-label="Robot tools">
      <label>Script slot<input type="number" min="1" max="255" step="1" value={slot} onChange={e => setSlot(e.target.value)} /></label>
      <button className="secondary" disabled={disabled || !valid} onClick={() => session.perform('Save script', api => api.saveScriptToPartition(Number(slot)))}>Save loaded script to robot</button>
      <button className="secondary" disabled={disabled} onClick={() => session.perform('Reset interpreter', api => api.softResetPythonInterpreter())}>Reset interpreter</button>
  </div>;
}

export default function PythonWorkspace({ active, disabled }) {
  const s = useSession();
  const [draft, setDraft] = useState(restoreDraft);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState(null);
  const [wide, setWide] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editor, setEditor] = useState(null);
  const root = useRef(null);
  const dialog = useRef(null);
  const input = useRef(null);
  const dirty = useRef(draft.dirty);
  const open = wide ? pinned : drawer;

  useLayoutEffect(() => {
    if (!active) return;
    function measure() { setWide(root.current.clientWidth >= 720); }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    const el = dialog.current;
    if (!wide && drawer && active) el.showModal();
    return () => { if (el.open) el.close(); };
  }, [wide, drawer, active]);

  function save(next) {
    dirty.current = next.dirty;
    setDraft(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      setSaveFailed(false);
    } catch { setSaveFailed(true); }
  }

  function replace(next) {
    save({ filename: next.filename, code: next.code, dirty: false });
    setDrawer(false);
    editor?.setPosition({ lineNumber: 1, column: 1 });
    editor?.focus();
  }
  function requestReplace(next) {
    if (dirty.current) setPending(next);
    else replace(next);
  }
  async function openFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.py$/i.test(file.name)) return session.notify('Choose a Python (.py) file.', true);
    try {
      requestReplace({ filename: file.name, code: await file.text() });
    } catch { session.notify('Could not read the Python file.', true); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([draft.code], { type: 'text/x-python;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = draft.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function insert(snippet) {
    const selection = editor.getSelection();
    editor.pushUndoStop();
    editor.executeEdits('library', [{ range: selection, text: snippet, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    if (dialog.current.open) dialog.current.close();
    setDrawer(false);
    editor.focus();
  }
  const library = <PythonLibrary ready={Boolean(editor)} onInsert={insert} onLoad={requestReplace} />;
  return <div ref={root} className="python-ide">
    <div className="ide-toolbar">
      <button className="secondary ide-library-toggle" aria-expanded={open}
        aria-controls={wide ? 'ide-library-pane' : 'ide-library-drawer'}
        onClick={() => wide ? setPinned(!pinned) : setDrawer(!drawer)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"><rect x="1" y="2" width="14" height="12" rx="2" /><path d="M6 2v12" /></svg>
        Library
      </button>
      <button className="secondary" onClick={() => input.current.click()}>Open .py</button>
      <input hidden ref={input} aria-label="Open Python file" type="file" accept=".py" onChange={openFile} />
      <button className="secondary" onClick={download}>Download .py</button>
      <div className="ide-run">
        <span className="execution-pill" data-state={s.execution} role="status" aria-label="Script execution">
          <span className="execution-light" aria-hidden="true" />{s.execution}
        </span>
        <button disabled={disabled} onClick={() => session.runCode(draft.code)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 1v10l9-5z" /></svg>
          Run on robot
        </button>
        <button className="danger-quiet" disabled={s.connection !== 'connected' || s.ota || s.stopping} onClick={session.stopCode}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1" /></svg>
          Stop
        </button>
      </div>
    </div>
    <div className="ide-body">
      {wide && <div id="ide-library-pane" className="ide-library-track" data-open={pinned} inert={!pinned} aria-hidden={!pinned}>
        <aside className="ide-library">{library}</aside>
      </div>}
      <div className="ide-editor"><PythonEditor value={draft.code} onReady={setEditor} saveFailed={saveFailed} footerTools={<RobotTools disabled={disabled} />}
        onChange={value => { if (draft.code !== value) save({ ...draft, code: value ?? '', dirty: true }); }} /></div>
    </div>
    <dialog id="ide-library-drawer" className="ide-library ide-drawer" ref={dialog} aria-label="Thymio library" closedby="any" onCancel={() => setDrawer(false)}>
      {!wide && library}
    </dialog>
    {pending && <Confirm title="Replace edited code?" destructive={false} onClose={() => setPending(null)} onConfirm={() => replace(pending)}>Replace the current draft with {pending.filename}?</Confirm>}
  </div>;
}
