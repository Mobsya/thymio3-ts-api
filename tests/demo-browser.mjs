// Run against a local demo server: node tests/demo-browser.mjs
// Optional: PLAYWRIGHT_EXECUTABLE_PATH, DEMO_URL, DEMO_SCREENSHOT_DIR.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.argv[2];
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error' && /cannot be a descendant|cannot contain|unique.*key/.test(msg.text())) errors.push(msg.text()); });
const shots = process.env.DEMO_SCREENSHOT_DIR || process.argv[3];
if (shots) await mkdir(shots, { recursive: true });
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true });
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(`thymio-${name}`, { detail }));
  const test = window.demoTest = { connected: false, calls: [], files: [{ name: 'main.py', size: 128 }, { name: 'notes.txt', size: 42 }], uploadPending: false, memoryCalls: [], memoryFails: false, memoryPending: false, memoryConcurrent: 0, memoryMaxConcurrent: 0, robotName: 'THYMIO-42' };
  const call = name => async (...args) => { test.calls.push([name, ...args]); };
  window.thymio = {
    isConnected: () => test.connected,
    requestAndConnect: async () => { test.connected = true; emit('connected', true); },
    disconnect: async () => { test.connected = false; emit('connected', false); },
    getDeviceName: () => test.robotName,
    getFirmwareInfo: async () => ({ esp32_ver: 'v1.12.0', stm32_ver: 'v1.2.0' }),
    getMemoryInfo: async () => {
      test.memoryCalls.push(Date.now());
      test.memoryConcurrent++;
      test.memoryMaxConcurrent = Math.max(test.memoryMaxConcurrent, test.memoryConcurrent);
      try {
        if (test.memoryPending) await new Promise(resolve => { test.finishMemory = resolve; });
        if (test.memoryFails) throw new Error('Memory unavailable in test');
        return { ram_bytes_free: 245760 - test.memoryCalls.length * 128, flash_bytes_free: 1048576 };
      } finally { test.memoryConcurrent--; }
    },
    startAllSensorStreaming: call('resume'), stopSensorStreaming: call('pause'),
    setActuatorState: call('actuators'), stopScriptExecution: call('stopScript'), stopAudioFile: call('stopAudio'),
    sendPythonScript: async code => { test.calls.push(['uploadScript', code]); if (test.uploadPending) await new Promise(resolve => { test.finishUpload = resolve; }); },
    executeLoadedScript: call('execute'), saveScriptToPartition: call('saveScript'), softResetPythonInterpreter: call('reset'),
    listFiles: async () => test.files,
    uploadFile: async file => { test.calls.push(['uploadFile', file.name]); emit('file-upload-progress', { percentage: 50 }); },
    saveFile: async name => { test.files.push({ name, size: 3 }); },
    deleteFile: async name => { test.files = test.files.filter(f => f.name !== name); },
    eraseAllFiles: async () => { test.files = []; }, freeMemory: call('freeMemory'),
    downloadFile: async () => new TextEncoder().encode('hello'),
    uploadAudioFile: call('uploadAudio'), playAudioFile: call('playAudio'), recordAudio: call('record'), playFrequency: call('tone'),
    isNewerFirmwareAvailable: async () => true,
    updateFirmware: async () => { emit('ota-upload-progress', { percentage: 50 }); await new Promise(resolve => { test.finishFirmware = resolve; }); },
    uploadFirmware: call('uploadFirmware'), stopFirmwareUpload: call('cancelFirmware'),
  };
  test.emit = emit;
});
const tab = name => page.getByRole('tab', { name, exact: true });
async function screenshot(name) { if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); } }
try {
  await page.goto(process.env.DEMO_URL || process.argv[4] || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  assert(await page.getByRole('button', { name: '■ Stop robot', exact: true }).isDisabled());
  assert.equal(await page.locator('.control-panel').getByRole('button', { name: '■ Stop robot', exact: true }).count(), 1);
  assert.equal(await page.locator('.app-header').getByRole('button', { name: '■ Stop robot', exact: true }).count(), 0);
  assert.equal(await page.locator('.robot-panel').getByRole('button', { name: 'Connect robot', exact: true }).count(), 1);
  assert.equal(await page.locator('.robot-name').innerText(), 'No robot connected');
  assert.equal(await page.locator('.device-memory-status').count(), 1);
  assert.deepEqual(await page.locator('.device-memory-graph-label strong').allTextContents(), ['—', '—']);
  assert.equal(await page.locator('.device-memory-line').count(), 0);
  assert.equal(await page.locator('.sensor-received').innerText(), 'No samples yet');
  assert.equal(await page.getByRole('region', { name: 'Acceleration', exact: true }).getByRole('img', { name: 'Waiting', exact: true }).count(), 3);
  assert.equal(await page.getByRole('region', { name: 'Buttons', exact: true }).getByRole('img', { name: 'Waiting', exact: true }).count(), 5);
  await screenshot('disconnected');
  await page.getByRole('button', { name: 'Connect robot', exact: true }).click();
  await page.getByText('THYMIO-42', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.robot-connection').textContent(), 'Connected');
  assert.equal(await page.locator('.robot-panel').getByRole('button', { name: 'Disconnect', exact: true }).count(), 1);
  await page.waitForFunction(() => Number(document.querySelector('.device-memory-chart').dataset.sampleCount) >= 2);
  assert.equal(await page.locator('.app-header .brand, .app-header .brand-mark').count(), 0);
  assert.equal(await page.getByText('Thymio 3', { exact: true }).count(), 0);
  const headerHeight = await page.locator('.app-header').evaluate(el => el.getBoundingClientRect().height);
  const graphSpace = await page.evaluate(() => ({
    padding: parseFloat(getComputedStyle(document.querySelector('.app-header')).paddingTop),
    plots: [...document.querySelectorAll('.device-memory-plot')].map(el => el.getBoundingClientRect().height),
  }));
  assert.equal(await page.locator('.workbench-layout').evaluate(el => parseFloat(getComputedStyle(el).marginTop)), 6);
  assert(graphSpace.padding <= 2 && graphSpace.plots.every(height => height >= 56), 'Graphs should use the header height');
  assert(headerHeight >= 80 && headerHeight <= 84, `Desktop header height: ${headerHeight}`);
  assert.equal(await page.getByRole('img', { name: /^RAM free history/ }).count(), 1);
  assert.equal(await page.getByRole('img', { name: /^Flash free history/ }).count(), 1);
  await page.evaluate(() => { window.demoTest.emit('sensor-values', { colorSensor: { h: 125, s: 65, v: 80 }, groundSensors: { left: 350, right: 420 }, buttons: { left: true, right: false, center: false, back: false, forward: true }, proximitySensors: { left: 140, frontLeft: 800, center: 2400, frontRight: 650, right: 110, backLeft: 0, backRight: 0 }, microphoneVolume: 84, accelerationRaw: { x: -123, y: 0, z: 980 }, gyroRaw: { x: 0, y: -10, z: 1 }, tvRemote: 0 }); window.demoTest.emit('sensor-other-values', { colorRaw: { red: 100, green: 200, blue: 300, clear: 1000 }, colorDetected: 2, groundAmbient: { left: 100, right: 110 }, groundReflected: { left: 450, right: 530 }, angleDegrees: -90, eventFlags: { tapDetected: true, freefallDetected: false, clapDetected: false }, motor: { leftSpeed: -100, rightSpeed: 100, leftPwmDuty: -20, rightPwmDuty: 20 }, batteryVoltage: 3900 }); });
  const sensors = page.locator('.sensor-panel');
  assert.equal(await sensors.getByText('TELEMETRY', { exact: true }).count(), 0);
  assert.equal(await sensors.getByRole('button', { name: /Collapse|Expand/ }).count(), 0);
  assert.match(await sensors.locator('.sensor-received').innerText(), /^Received /);
  assert.deepEqual(await sensors.getByRole('region', { name: 'Acceleration', exact: true }).locator('.sensor-focus-reading').allTextContents(), ['-123', '0', '980']);
  assert.deepEqual(await sensors.getByRole('region', { name: 'Events', exact: true }).locator('.sensor-focus-reading').allTextContents(), ['true', 'false', 'false']);
  assert.equal(await sensors.getByRole('region', { name: 'Buttons', exact: true }).locator('.sensor-compact-reading').count(), 5);
  assert.equal(await sensors.getByRole('progressbar').count(), 7);
  assert.deepEqual(await sensors.getByRole('table', { name: 'Motor feedback readings' }).locator('td').allTextContents(), ['-100', '-20', '100', '20']);
  const sensorHeight = await sensors.evaluate(el => el.getBoundingClientRect().height);
  assert(sensorHeight <= 1619 * .7, `Sensor panel should be at least 30% shorter than the 1619px baseline; got ${sensorHeight}`);
  console.log(`Populated sensor panel: ${Math.round(sensorHeight)}px (baseline 1619px)`);
  if (shots) await sensors.screenshot({ path: `${shots}/compact-sensors.png` });
  await sensors.getByRole('button', { name: 'Pause', exact: true }).click();
  await sensors.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.evaluate(() => window.demoTest.emit('sensor-values', { accelerationRaw: { x: 999 } }));
  assert.equal(await sensors.getByRole('region', { name: 'Acceleration', exact: true }).locator('.sensor-focus-reading').first().innerText(), '-123');
  await sensors.getByRole('button', { name: 'Resume', exact: true }).click();
  await sensors.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await sensors.getByRole('button', { name: 'Choose sensors' }).focus();
  await page.keyboard.press('Enter');
  await sensors.getByRole('checkbox', { name: 'Gyro', exact: true }).uncheck();
  await sensors.getByRole('tab', { name: 'Trends', exact: true }).click();
  await sensors.getByRole('tab', { name: 'Values', exact: true }).click();
  assert.equal(await sensors.getByRole('checkbox', { name: 'Gyro', exact: true }).isChecked(), false);
  assert.equal(await sensors.getByRole('region', { name: 'Gyro', exact: true }).count(), 0);
  assert(await sensors.getByRole('region', { name: 'Acceleration', exact: true }).evaluate(el => el.clientWidth >= el.parentElement.clientWidth - 1));
  await sensors.getByRole('button', { name: 'Deselect all', exact: true }).click();
  assert(await sensors.getByText('No sensors selected.', { exact: true }).isVisible());
  await sensors.getByRole('checkbox', { name: 'Ground ambient', exact: true }).check();
  assert.equal(await sensors.getByRole('table', { name: 'Ground readings' }).locator('td').count(), 2);
  await sensors.getByRole('button', { name: 'Select all', exact: true }).click();
  await sensors.getByRole('button', { name: 'Choose sensors' }).click();
  await sensors.getByRole('tab', { name: 'Values', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await sensors.getByRole('tab', { name: 'Trends', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await sensors.getByRole('tabpanel', { name: 'Values', exact: true }).count(), 0);
  assert.equal(await sensors.getByRole('button', { name: 'Choose sensors', exact: true }).count(), 0);
  assert(await sensors.getByRole('button', { name: 'Pause', exact: true }).isVisible());
  assert(await sensors.getByRole('heading', { name: 'Recent samples' }).isVisible());
  const expectedTrends = [
    ['Ground · left', 350], ['Ground · right', 420],
    ['Proximity · left', 140], ['Proximity · front left', 800],
    ['Proximity · center', 2400], ['Proximity · front right', 650],
    ['Proximity · right', 110], ['Proximity · back left', 1],
    ['Proximity · back right', 1], ['Microphone', 84],
  ];
  assert.equal(await sensors.locator('.trend').count(), expectedTrends.length);
  for (const [name, max] of expectedTrends) {
    const graph = sensors.getByRole('img', { name: `${name}, last 1 samples, raw scale 0 to ${max}`, exact: true });
    assert(await graph.isVisible());
    assert.deepEqual(await graph.locator('.trend-axis-tick text').allTextContents(), [String(max), String(max / 2), '0']);
    assert.equal(await graph.locator('.trend-axis').count(), 1);
    assert.equal(await graph.locator('circle').count(), 1);
  }
  await page.keyboard.press('ArrowLeft');
  assert.equal(await sensors.getByRole('tab', { name: 'Values', exact: true }).getAttribute('aria-selected'), 'true');
  assert(await sensors.getByRole('tabpanel', { name: 'Values', exact: true }).isVisible());
  assert.equal(await sensors.getByRole('tabpanel', { name: 'Trends', exact: true }).count(), 0);
  await page.getByLabel('Left motor numeric speed').fill('300');
  await page.getByRole('button', { name: '■ Stop robot', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.stop-robot').disabled);
  assert.equal(await page.getByLabel('Left motor numeric speed').inputValue(), '0');
  assert.equal(await page.getByRole('tablist', { name: 'Control groups' }).count(), 0);
  for (const name of ['Movement', 'Lights', 'Sound']) assert(await page.getByRole('region', { name, exact: true }).isVisible());
  assert.equal(await page.locator('.lights-section details[open]').count(), 0);
  for (const copy of ['Controls send changes directly to the connected robot.', 'Explore movement, light, and sound.', 'Stop robot preserves the demo’s LED settings. Commands require an active Bluetooth link.']) {
    assert.equal(await page.getByText(copy, { exact: true }).count(), 0);
  }
  assert.equal(await page.locator('.hardware-help').count(), 0);
  await screenshot('combined-controls');
  await page.getByRole('button', { name: /Front left R/ }).click();
  await page.getByLabel('Front left R', { exact: true }).fill('12');
  await page.keyboard.press('Escape');
  await screenshot('lights');
  await page.getByRole('button', { name: 'Play tone' }).click();
  assert.equal(await page.locator('.banner.notice').count(), 0);
  assert((await page.evaluate(() => window.demoTest.calls)).some(c => c[0] === 'tone' && c[1] === 440 && c[2] === 10));
  await tab('Files').click();
  await page.getByText('main.py', { exact: true }).waitFor();
  const callsBeforeTab = await page.evaluate(() => window.demoTest.memoryCalls.length);
  await page.waitForFunction(count => window.demoTest.memoryCalls.length > count, callsBeforeTab);
  assert.equal(await page.locator('.device-memory-status').count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  assert.equal((await downloadPromise).suggestedFilename(), 'main.py');
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByText('main.py', { exact: true }).count(), 1);
  await page.getByLabel('Local file').setInputFiles({ name: 'new.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await page.getByRole('button', { name: 'Upload file', exact: true }).click();
  await page.getByRole('button', { name: 'Save to storage' }).click();
  await page.getByText('new.txt', { exact: true }).waitFor();
  await screenshot('files');
  await tab('Device').click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await page.getByRole('button', { name: 'Install update', exact: true }).click();
  await tab('Controls').click();
  assert(await page.getByRole('button', { name: '■ Stop robot', exact: true }).isDisabled());
  await tab('Files').click();
  assert(await page.getByRole('button', { name: 'Upload file', exact: true }).isDisabled());
  assert.deepEqual(await page.locator('.device-memory-state').allTextContents(), ['Paused', 'Paused']);
  const pausedMemory = await page.evaluate(() => ({ calls: window.demoTest.memoryCalls.length, samples: document.querySelector('.device-memory-chart').dataset.sampleCount }));
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.demoTest.memoryCalls.length), pausedMemory.calls);
  assert.equal(await page.locator('.device-memory-chart').first().getAttribute('data-sample-count'), pausedMemory.samples);
  await page.evaluate(() => window.demoTest.finishFirmware());
  await page.waitForFunction(() => !document.querySelector('.robot-connect-button').disabled);
  await tab('Python').click();
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 });
  const python = page.getByRole('tabpanel', { name: 'Python', exact: true });
  const searchReference = python.getByRole('searchbox');
  await searchReference.fill('get_battery_voltage');
  await python.getByRole('button', { name: 'thymio.get_battery_voltage()', exact: true }).click();
  const libraryToggle = python.getByRole('button', { name: 'Library', exact: true });
  await libraryToggle.click();
  await page.waitForFunction(() => document.querySelector('.ide-library-track').clientWidth === 0);
  assert.equal(await searchReference.count(), 0);
  await libraryToggle.click();
  assert.equal(await searchReference.inputValue(), 'get_battery_voltage');
  const modelState = () => page.evaluate(() => {
    const editor = window.monaco.editor.getEditors()[0];
    return { code: editor.getValue(), selection: editor.getSelection().toString(), scroll: editor.getScrollTop() };
  });
  const initial = await modelState();
  await python.getByRole('button', { name: 'Insert at cursor' }).click();
  assert((await modelState()).code.includes('thymio.get_battery_voltage()'));
  await tab('Controls').click(); await tab('Python').click();
  await page.evaluate(() => window.monaco.editor.getEditors()[0].trigger('keyboard', 'undo'));
  assert.equal((await modelState()).code, initial.code);
  await python.getByRole('tab', { name: 'Examples', exact: true }).click();
  await python.getByLabel('Example', { exact: true }).selectOption('tone.py');
  await python.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await modelState()).code, initial.code);
  await python.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  assert((await modelState()).code.includes('sound.play_tone(440, 5)'));
  await python.getByLabel('Open Python file').setInputFiles({ name: 'classroom.py', mimeType: 'text/plain', buffer: Buffer.from('print("robot")\n') });
  await page.waitForFunction(() => window.monaco.editor.getEditors()[0].getValue() === 'print("robot")\n');
  assert.equal(await python.getByText('classroom.py', { exact: true }).count(), 0);
  assert.equal((await modelState()).code, 'print("robot")\n');
  const scriptDownload = page.waitForEvent('download');
  await python.getByRole('button', { name: 'Download .py' }).click();
  const downloadedScript = await scriptDownload;
  assert.equal(downloadedScript.suggestedFilename(), 'classroom.py');
  const chunks = [];
  for await (const chunk of await downloadedScript.createReadStream()) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'print("robot")\n');
  await page.evaluate(() => { window.demoTest.uploadPending = true; });
  await page.getByRole('button', { name: 'Run on robot', exact: true }).click();
  await tab('Controls').click();
  await page.getByRole('button', { name: '■ Stop robot', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.stop-robot').disabled);
  await page.evaluate(() => window.demoTest.finishUpload());
  assert(!(await page.evaluate(() => window.demoTest.calls)).some(c => c[0] === 'execute'));
  await tab('Python').click();
  await page.evaluate(() => { window.demoTest.uploadPending = false; });
  await python.getByRole('button', { name: 'Run on robot' }).click();
  const execution = python.getByRole('status', { name: 'Script execution' });
  await execution.getByText('Running', { exact: true }).waitFor();
  assert.equal(await execution.locator('.execution-light').evaluate(el => getComputedStyle(el).animationName), 'script-running');
  await python.getByRole('button', { name: 'Stop', exact: true }).click();
  await execution.getByText('Idle', { exact: true }).waitFor();
  assert.equal(await page.locator('.banner.notice').count(), 0);
  await page.evaluate(() => window.demoTest.emit('std-out-values', 'Hello from Thymio\n'));
  await page.getByText('Hello from Thymio', { exact: true }).waitFor();
  const separator = page.getByRole('separator', { name: 'Console height' });
  const beforeResize = await python.locator('.ide-body').boundingBox();
  await separator.focus(); await page.keyboard.press('ArrowUp');
  assert.equal(await separator.getAttribute('aria-valuenow'), '240');
  const afterResize = await python.locator('.ide-body').boundingBox();
  assert(Math.abs(beforeResize.height - afterResize.height - 20) < 2, `Console grows into editor space (${beforeResize.height} to ${afterResize.height})`);
  await screenshot('python');
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const name of ['Controls', 'Python', 'Files', 'Device']) {
      await tab(name).click();
      if (name === 'Python') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForFunction(() => {
          const editor = document.querySelector('.ide-body').getBoundingClientRect();
          const output = document.querySelector('#console-output').getBoundingClientRect();
          return editor.height >= 140 && output.height >= 80 && editor.bottom <= output.top && output.bottom <= innerHeight;
        }, undefined, { timeout: 4000 });
      }
      const geometry = await page.evaluate(() => {
        const workspace = document.querySelector('.workspace').getBoundingClientRect();
        const telemetry = document.querySelector('.telemetry').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, overlap: !(workspace.right <= telemetry.left || telemetry.right <= workspace.left || workspace.bottom <= telemetry.top || telemetry.bottom <= workspace.top) };
      });
      assert(!geometry.overflow, `${width} ${name}: horizontal overflow`);
      assert(!geometry.overlap, `${width} ${name}: overlapping panels`);
    }
    await tab('Controls').click();
    await page.evaluate(() => scrollTo(0, 0));
    const layout = await page.evaluate(() => {
      const movement = document.querySelector('.movement-section').getBoundingClientRect();
      const lights = document.querySelector('.lights-section').getBoundingClientRect();
      const sound = document.querySelector('.sound-section').getBoundingClientRect();
      return { columns: getComputedStyle(document.querySelector('.controls-grid')).gridTemplateColumns.split(' ').length,
        correctColumns: movement.right <= lights.left && sound.right <= lights.left && movement.bottom <= sound.top,
        correctStack: movement.bottom <= lights.top && lights.bottom <= sound.top };
    });
    assert(layout.columns === 2 ? layout.correctColumns : layout.correctStack, `${width}: control order/overlap`);
    const headerLayout = await page.evaluate(() => {
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.app-header > *, .device-memory-chart')].map(el => el.getBoundingClientRect());
      const graphs = [...document.querySelectorAll('.device-memory-chart')].map(el => el.getBoundingClientRect());
      return { withinHeader: boxes.every(r => r.left >= header.left && r.right <= header.right + 1 && r.top >= header.top && r.bottom <= header.bottom + 1), sideBySide: graphs[0].right <= graphs[1].left, height: header.height };
    });
    assert(headerLayout.withinHeader && headerLayout.sideBySide, `${width}: header graph layout`);
    if (width >= 1000) assert(headerLayout.height <= 84, `${width}: header too tall`);
    const sensorLayout = await sensors.evaluate(el => ({
      overflow: [...el.querySelectorAll('*')].filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1).map(node => node.className),
      paired: [...el.querySelectorAll('.sensor-pair')].every(pair => {
        const [left, right] = [...pair.children].map(child => child.getBoundingClientRect());
        return Math.abs(left.top - right.top) <= 1 && left.right <= right.left;
      }),
    }));
    assert.deepEqual(sensorLayout.overflow, [], `${width}: sensor overflow`);
    assert(sensorLayout.paired, `${width}: sensor columns should stay paired`);
    await sensors.getByRole('tab', { name: 'Trends', exact: true }).click();
    assert(await sensors.getByRole('tabpanel', { name: 'Trends', exact: true }).isVisible());
    assert(await sensors.evaluate(el => el.scrollWidth <= el.clientWidth), `${width}: trend overflow`);
    await sensors.getByRole('tab', { name: 'Values', exact: true }).click();
    await screenshot(`viewport-${width}`);
    // Expanded details and RGB pickers must reflow without clipping at each size.
    await page.locator('.lights-section summary').first().click();
    await page.getByRole('button', { name: /Front left R/ }).click();
    assert.equal(await page.getByLabel('Front left R', { exact: true }).inputValue(), '12');
    assert.equal(await page.getByLabel('Duration (s)', { exact: true }).inputValue(), '1');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.control-section, .color-control, .individual-leds')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => ({ class: el.className, width: el.clientWidth, scroll: el.scrollWidth })));
    await screenshot(`expanded-${width}`);
    assert.deepEqual(overflow, [], `${width}: expanded controls overflow ${JSON.stringify(overflow)}`);
    await page.getByLabel('Front left R', { exact: true }).focus();
    await page.keyboard.press('Escape');
    await page.locator('.lights-section summary').first().click();
  }
  await page.setViewportSize({ width: 300, height: 900 });
  const narrowSensors = await sensors.evaluate(el => ({
    overflow: el.scrollWidth > el.clientWidth,
    stacked: [...el.querySelectorAll('.sensor-pair')].every(pair => {
      const [first, second] = [...pair.children].map(child => child.getBoundingClientRect());
      return first.bottom <= second.top;
    }),
  }));
  assert(!narrowSensors.overflow && narrowSensors.stacked, 'Extra-narrow sensor panel should stack without overflow');
  await page.setViewportSize({ width: 1440, height: 900 });
  // Error recovery, long names, and a reconnect must not retain stale memory.
  await page.evaluate(() => { window.demoTest.memoryFails = true; });
  await page.getByText('Unavailable', { exact: true }).first().waitFor();
  await page.evaluate(() => { window.demoTest.memoryFails = false; });
  await page.waitForFunction(() => document.querySelectorAll('.device-memory-state').length === 0);
  await page.evaluate(() => {
    const test = window.demoTest;
    test.connected = false; test.emit('connected', false);
  });
  assert.equal(await page.locator('.robot-connection').textContent(), 'Reconnecting…');
  assert((await page.locator('.robot-name').innerText()).includes('THYMIO-42'));
  assert.deepEqual(await page.locator('.device-memory-graph-label strong').allTextContents(), ['—', '—']);
  await page.evaluate(() => {
    const test = window.demoTest;
    test.robotName = 'THYMIO-classroom-robot-with-a-very-long-Bluetooth-name-1234567890';
    test.memoryPending = true;
    test.connected = true; test.emit('connected', true);
  });
  await page.getByText('Waiting', { exact: true }).first().waitFor();
  await page.waitForFunction(() => Boolean(window.demoTest.finishMemory));
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => Math.abs(document.querySelector('.app-header').getBoundingClientRect().height - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-height'))) <= 1);
    const valid = await page.evaluate(() => {
      const identity = document.querySelector('.robot-identity').getBoundingClientRect();
      const actions = document.querySelector('.robot-connect-button').getBoundingClientRect();
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-height'));
      return Math.abs(header.height - offset) <= 1 && document.documentElement.scrollWidth <= innerWidth &&
        (identity.right <= actions.left || identity.bottom <= actions.top);
    });
    assert(valid, `${width}: long name / measured header offset`);
    await screenshot(`long-name-${width}`);
  }
  await page.evaluate(() => { window.demoTest.memoryPending = false; window.demoTest.finishMemory(); });
  await page.waitForFunction(() => Number(document.querySelector('.device-memory-chart').dataset.sampleCount) === 1);
  assert.equal(await page.evaluate(() => window.demoTest.memoryMaxConcurrent), 1);
  // A 720 CSS-pixel viewport emulates the layout width of a 1440px window at 200% zoom.
  await page.setViewportSize({ width: 720, height: 450 });
  await tab('Controls').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Python').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End'); assert.equal(await tab('Device').getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await tab('Controls').click();
  assert(await page.getByRole('button', { name: '■ Stop robot', exact: true }).isDisabled());
  assert.equal(await page.locator('.robot-name').innerText(), 'No robot connected');
  assert.deepEqual(await page.locator('.device-memory-graph-label strong').allTextContents(), ['—', '—']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await tab('Python').click();
  await page.locator('.monaco-editor').first().waitFor();
  assert.equal((await modelState()).code, 'print("robot")\n');
  assert.equal(await python.getByText('classroom.py', { exact: true }).count(), 0);
  assert(await python.getByRole('button', { name: 'Run on robot' }).isDisabled());
  await python.getByRole('button', { name: 'Library', exact: true }).click();
  const drawer = python.getByRole('dialog', { name: 'Thymio library' });
  await drawer.getByRole('searchbox').fill('read_reg');
  await drawer.getByRole('button', { name: /read_reg/ }).click();
  await drawer.getByRole('button', { name: 'Insert at cursor' }).click();
  await drawer.waitFor({ state: 'hidden' });
  assert((await modelState()).code.includes('thymio.I2C()'));
  await page.evaluate(() => window.monaco.editor.getEditors()[0].setValue(''));
  await page.reload();
  await tab('Python').click();
  await page.locator('.monaco-editor').first().waitFor();
  assert.equal((await modelState()).code, '');
  assert.deepEqual(errors, []);
  console.log('Demo browser checks passed: controls, stop race, files/download, firmware lock, console, compact sensors, keyboard tabs, and 4 viewports.');
} finally { await browser.close(); }
