# Thymio 3 TS API

## Use

1. For use directly in the browser: `dist/thymio.global.js`
2. For use as as a CJS module: `dist/thymio.js`
3. For use as a ESM module: `dist/thymio.mjs`

## Documentation

`thymio.requestAndConnect()` - requests the Thymio through Bluetooth and pairs it to the browser
`thymio.setActuatorState(actuatorData)` - sets the actuator data on the Thymio
`thymio.sendPythonScript(script)` - uploads a MicroPython script to the Thymio
`thymio.executeLoadedScript()` - executes the script loaded in the Thymio memory
`thymio.stopScriptExecution()` - stops the script currently running on the Thymio

