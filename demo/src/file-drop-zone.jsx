import { useId, useState } from 'react';
import { session } from './use-session';

export default function FileDropZone({ file, onSelect, disabled, accept, label = 'Local file' }) {
  const nameId = useId();
  const [dragging, setDragging] = useState(false);

  function drop(event) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = event.dataTransfer.files;
    if (files.length === 1) onSelect(files[0]);
    if (files.length > 1) session.notify('Choose one file at a time.', true);
  }

  return <label className={`file-drop-zone${dragging && !disabled ? ' dragging' : ''}`}
    onDragOver={event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      setDragging(!disabled && event.dataTransfer.types.includes('Files'));
    }}
    onDragLeave={() => setDragging(false)} onDrop={drop}>
    <input type="file" aria-label={label} aria-describedby={file ? nameId : undefined}
      disabled={disabled} accept={accept}
      onChange={event => {
        if (event.target.files.length) onSelect(event.target.files[0]);
        event.target.value = '';
      }} />
    <span>Drop {accept ? `a ${accept} file` : 'a file'} here or <u>choose a file</u></span>
    {file && <strong id={nameId}>{file.name}</strong>}
  </label>;
}
