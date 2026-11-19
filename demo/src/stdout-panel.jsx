import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { session } from './use-session';
export default function StdoutPanel({
  entries,
  onClear,
  expandedByDefault
}) {
  const [override, setOverride] = useState(null);
  const [preferredHeight, setPreferredHeight] = useState(220);
  const [ideLimit, setIdeLimit] = useState(480);
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const box = useRef(null);
  const open = override?.tab === expandedByDefault ? override.open : expandedByDefault;
  const minHeight = expandedByDefault ? 80 : 120;
  const maxHeight = expandedByDefault ? ideLimit : 480;
  const height = Math.max(minHeight, Math.min(preferredHeight, maxHeight));

  useLayoutEffect(() => {
    if (!expandedByDefault || !open) return;
    const output = box.current;
    const workspace = output.closest('.workspace');
    const editor = workspace.querySelector('.ide-body');
    if (!editor) return;
    function measure() {
      // All space outside the two panes belongs to toolbars, tabs and robot tools.
      const occupied = Array.from(workspace.children).reduce((sum, child) =>
        sum + child.getBoundingClientRect().height, 0);
      const chrome = occupied - editor.offsetHeight - output.offsetHeight;
      setIdeLimit(Math.max(80, Math.min(480, Math.floor(workspace.clientHeight - chrome - 140))));
    }
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [workspace, ...workspace.children, editor, output]) observer.observe(el);
    return () => observer.disconnect();
  }, [expandedByDefault, open]);
  const text = entries.map(e => e.value).join('');
  useEffect(() => {
    if (follow && open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, follow, open]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const resize = value => setPreferredHeight(Math.max(minHeight, Math.min(maxHeight, value)));
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      session.notify('Could not copy console output. Select the text and copy it manually.', true);
    }
  }
  return <section className="console-panel" aria-label="Console">
    {open && <div role="separator" className="console-resizer" tabIndex="0" aria-label="Console height" aria-orientation="horizontal" aria-valuemin={minHeight} aria-valuemax={maxHeight} aria-valuenow={height} onKeyDown={e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        resize(height + (e.key === 'ArrowUp' ? 20 : -20));
      }
    }} onPointerDown={e => {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.startY = e.clientY;
      e.currentTarget.dataset.startHeight = height;
    }} onPointerMove={e => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) resize(Number(e.currentTarget.dataset.startHeight) + Number(e.currentTarget.dataset.startY) - e.clientY);
    }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} />}
    <div className="console-toolbar"><button className="console-toggle" aria-expanded={open} aria-controls="console-output" onClick={() => setOverride({
        tab: expandedByDefault,
        open: !open
      })}>{open ? '▾' : '▸'} Console <span className="muted">{entries.length ? `${entries.length} messages` : 'No output'}</span></button><div className="row"><button className="secondary" aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? 'Following' : 'Follow output'}</button><button className="secondary" disabled={!entries.length} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button><button className="secondary" disabled={!entries.length} onClick={onClear}>Clear</button></div></div>
    <pre id="console-output" hidden={!open} ref={box} className="console-output" style={{
      height
    }} tabIndex="0" onScroll={e => {
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 24) setFollow(false);
    }}>{text || 'Run a script to see its output here.'}</pre>
  </section>;
}
