import { useState } from 'react';
import { THYMIO_CLASSES, THYMIO_MODULE_MEMBERS } from './thymio-python-intellisense';
import { Tabs } from './ui';

import { EXAMPLES } from './python-examples';

const argumentsByName = {
  id: '0', left: '0', right: '0', red: '16', green: '0', blue: '0',
  angle: '90', speed: '100', duration: '5', frequency: '440', vol: '5',
  name: '"sound.wav"', dev_addr: '0x38', reg_addr: '0xAC',
  data: 'bytes([0x33, 0x00])', size: '2',
};

function call(entry) {
  const args = entry.parameters.filter(p => !p.name.includes('='))
    .map(p => argumentsByName[p.name] ?? p.name);
  return entry.name + '(' + args.join(', ') + ')';
}

const reference = Object.values(THYMIO_MODULE_MEMBERS)
  .filter(entry => entry.name !== 'FILESYSTEM') // Omitted from the published library guide.
  .map(device => {
    const variable = device.name.toLowerCase();
    const expression = 'thymio.' + call(device);
    const setup = device.kind === 'constructor' ? variable + ' = ' + expression : expression;
    const entries = [{ ...device, snippet: 'import thymio\n' + setup }];
    for (const method of Object.values(THYMIO_CLASSES[device.name]?.methods ?? {})) {
      const invocation = variable + '.' + call(method);
      const line = method.returnType ? 'print(' + invocation + ')' : invocation;
      entries.push({ ...method, snippet: 'import thymio\n' + setup + '\n' + line });
    }
    return { name: device.name, description: device.description, entries };
  });
reference.push({
  name: 'Sound events', description: 'Handle playback and recording completion callbacks.',
  entries: ['PLAY_COMPLETED', 'RECORD_COMPLETED'].map(event => ({
    name: event, signature: '@onevent("' + event + '")', parameters: [],
    description: 'Register a callback with the Thymio event loop.',
    snippet: 'import uasyncio as asyncio\nfrom thymio_events import ThymioEvents, onevent\n\nevents = ThymioEvents()\n\n@onevent("' + event + '")\ndef completed():\n    print("' + event + '")\n\nasync def main():\n    while True:\n        await asyncio.sleep(1)\n\nasyncio.run(main())',
  })),
});

export function PythonLibrary({ onInsert, onLoad, ready }) {
  const [tab, setTab] = useState('reference');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState('');
  const [preview, setPreview] = useState(EXAMPLES[0]);
  const term = query.trim().toLowerCase();
  const groups = reference.map(group => {
    if ((group.name + ' ' + group.description).toLowerCase().includes(term)) return group;
    return { ...group, entries: group.entries.filter(entry =>
      (entry.signature + ' ' + entry.description).toLowerCase().includes(term)) };
  }).filter(group => group.entries.length);
  return <>
    <Tabs items={LIBRARY_TABS} value={tab} onChange={setTab} label="Thymio library" prefix="library" />
    <section role="tabpanel" id="library-panel-reference" aria-labelledby="library-reference" hidden={tab !== 'reference'}>
      <input type="search" aria-label="Search Thymio reference" placeholder="Search the library" value={query} onChange={e => { setQuery(e.target.value); setExpanded(''); }} />
      {!groups.length && <p>No matching entries.</p>}
      {groups.map(group => <details key={group.name} open={term ? true : undefined}>
        <summary>{group.name}</summary>
        {group.entries.map(entry => {
          const key = group.name + '.' + entry.name;
          return <div className="api-entry" key={key}>
            <button className="api-link" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? '' : key)}>{entry.signature}</button>
            {expanded === key && <div className="api-doc">
              <p>{entry.description}</p>
              {entry.parameters.map(p => <p key={p.name}><code>{p.name}</code> {p.documentation}</p>)}
              {entry.returnType && <p>Returns <code>{entry.returnType}</code></p>}
              <pre>{entry.snippet}</pre>
              <button className="secondary" disabled={!ready} onClick={() => onInsert(entry.snippet)}>Insert at cursor</button>
            </div>}
          </div>;
        })}
      </details>)}
    </section>
    <section role="tabpanel" id="library-panel-examples" aria-labelledby="library-examples" hidden={tab !== 'examples'}>
      <label>Example<select aria-label="Example" value={preview.filename} onChange={e => setPreview(EXAMPLES.find(item => item.filename === e.target.value))}>{EXAMPLES.map(item => <option key={item.filename} value={item.filename}>{item.title}</option>)}</select></label>
      <pre>{preview.code}</pre><button className="secondary" onClick={() => onLoad(preview)}>Load example</button>
    </section>
  </>;
}
const LIBRARY_TABS = [['reference', 'Reference'], ['examples', 'Examples']];
