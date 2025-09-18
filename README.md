# Thymio 3 TS API

## Build

Requires the latest stable version of `node`.

To generate the `dist` folder, run `npm run build`.

## Use

1. For use directly in the browser: `dist/thymio.global.js`
2. For use as as a CJS module: `dist/thymio.js`
3. For use as a ESM module: `dist/thymio.mjs`

## Documentation

### Connection
`thymio.requestAndConnect()` - requests the Thymio through Bluetooth and pairs it to the browser

### Actuators
`thymio.setActuatorState(actuatorData)` - sets the actuator data on the Thymio

### Python scripts
`thymio.sendPythonScript(script)` - uploads a MicroPython script to the Thymio
`thymio.executeLoadedScript()` - executes the script loaded in the Thymio memory
`thymio.stopScriptExecution()` - stops the script currently running on the Thymio

### Sensor data streaming

`thymio.startSensorStreaming(other)` - starts sensor streaming
`thymio.stopSensorStreaming()` - stops sensor streaming

#### Events

`thymio-sensor-values` - event that exposes the main sensor values
`thymio-sensor-other-values` - event that exposes the other sensor values

### OTA updates

`thymio.uploadFirmware(firmware)` - upload the OTA update file, which will install itself on the robot and reboot it upon completion
`thymio.stopFirmwareUpload()` - Stops the current OTA update upload

#### Events

`thymio-ota-upload-progress` - event that exposes the current OTA update upload progress
