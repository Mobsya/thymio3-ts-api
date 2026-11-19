import { useEffect, useRef } from 'react';
export function Tabs({
  items,
  value,
  onChange,
  label,
  prefix
}) {
  function navigate(event, index) {
    const keys = {
      ArrowRight: (index + 1) % items.length,
      ArrowLeft: (index + items.length - 1) % items.length,
      Home: 0,
      End: items.length - 1
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = items[keys[event.key]][0];
    onChange(next);
    document.getElementById(`${prefix}-${next}`).focus();
  }
  return <div className="tabs" role="tablist" aria-label={label}>{items.map(([id, name], index) => <button key={id} id={`${prefix}-${id}`} role="tab" aria-selected={value === id} aria-controls={`${prefix}-panel-${id}`} tabIndex={value === id ? 0 : -1} onKeyDown={e => navigate(e, index)} onClick={() => onChange(id)}>{name}</button>)}</div>;
}
export function Confirm({
  title,
  children,
  onConfirm,
  onClose,
  destructive = true
}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-title" onCancel={onClose}>
    <h2 id="confirm-title">{title}</h2><p>{children}</p>
    <div className="row end"><button autoFocus className="secondary" onClick={onClose}>Cancel</button><button className={destructive ? 'danger' : ''} onClick={() => {
        onConfirm();
        onClose();
      }}>Confirm</button></div>
  </dialog>;
}
