# Thymio 3 TS API

## Requirements

Requires the latest stable version of `node`.

## Build

To build :
```
git clone git@github.com:Mobsya/thymio3-ts-api.git
cd thymio3-ts-api
npm install
npm run build
```

This generates the `dist` folder in which you can find the following files:

1. `dist/thymio.global.js` - for use directly in the browser
2. `dist/thymio.js` - for use as a CJS module
3. `dist/thymio.mjs` - for use as an ESM module

## Demo

A live demo of this project can be found [here](https://mobsya.github.io/thymio3-ts-api/).

If you want to run the demo locally you can run the following commands from the root directory :
```
npm run install-demo
npm run run-demo
```

And open the `localhost:5173` in your browser.


## Documentation

### Connection

`thymio.requestAndConnect()` - requests the Thymio through Bluetooth and pairs it to the browser\
`thymio.isConnected()` - returns true if Thymio device is connected\
`thymio.disconnect()` - disconnects the Thymio device\
`thymio.getAPIVersion()` - returns the API firmware version from `package.json`

#### Events

`thymio-connected` - event that tells if the robot is connected or not/
`thymio-prompt-manual-reconnection` - event that prompts the user to reconnect manually if the automatic reconnection fails

### Actuators

`thymio.setActuatorState(actuatorData)` - sets the actuator data on the Thymio

### Python scripts

`thymio.sendPythonScript(script)` - uploads a MicroPython script to the Thymio\
`thymio.executeLoadedScript()` - executes the script loaded in the Thymio memory\
`thymio.stopScriptExecution()` - stops the script currently running on the Thymio\
`thymio.saveScriptToPartition(scriptId)` - save the script in the micropython storage partition\
`thymio.softResetPythonInterpreter()` - Soft reset the python interpreter

#### Events

`thymio-python-execution-status` - exposes the Python execution status\
`thymio-std-out-values` - event that exposes the Thymio's std out values

### Sensor data streaming

`thymio.startMainSensorStreaming()` - starts main sensor streaming\
`thymio.startSecondarySensorStreaming()` - starts secondary sensor streaming\
`thymio.startAllSensorStreaming()` - starts all sensor streaming\
`thymio.stopSensorStreaming()` - stops sensor streaming

#### Events

`thymio-sensor-values` - event that exposes the main sensor values\
`thymio-sensor-other-values` - event that exposes the other sensor values

### Audio

`thymio.uploadAudioFile(file)` - upload a custom audio file. The audio file must be in mp3 or wav format, mono-channel and have 12kHz sample rate\
`thymio.playAudioFile()` - play the audio file that is currently in memory\
`thymio.stopAudioFile()` - stop the audio file that is currently playing\
`thymio.recordAudio(duration)` - start recording audio to memory\
`thymio.playFrequency(frequency, duration)` - play a desired audio frequency

#### Events

`thymio-audio-upload-progress` - event that exposes the current audio file upload progress\

### Files

`thymio.uploadFile(file)` - upload a file to the Thymio RAM\
`thymio.saveFile(filename)` - save the file that is in the RAM for the storage\
`thymio.deleteFile(filename)` - delete a file from the storage\
`thymio.listFiles()` - list all files in the storage\
`thymio.eraseAllFiles()` - erase all files from the storage\
`thymio.downloadFile(filename)` - download file from Thymio's storage \
`thymio.freeMemory()` - free the RAM from the uploaded files

#### Events

`thymio-file-upload-progress` - event that exposes the current file upload progress\

### Firmware updates

`thymio.isNewerFirmwareAvailable()` - check if a newer Thymio 3 version is available\
`thymio.updateFirmware()` - update the firmware to the latest version

### Manual OTA updates

`thymio.uploadFirmware(firmware)` - upload the OTA update file, which will install itself on the robot and reboot it upon completion\
`thymio.stopFirmwareUpload()` - Stops the current OTA update upload

#### Events

`thymio-ota-upload-progress` - event that exposes the current OTA update upload progress
