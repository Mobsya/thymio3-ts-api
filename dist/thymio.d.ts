type RGB = {
    r: number;
    g: number;
    b: number;
};
type ActuatorData = {
    circleLEDs: number[];
    frontLegoLEDs: number[];
    rearLegoLEDs: number[];
    flRGB: RGB;
    frRGB: RGB;
    blRGB: RGB;
    brRGB: RGB;
    motorLeft: number;
    motorRight: number;
    sound: number;
};

type FileListing = {
    name: string;
    size: number;
};

/**
 * Request a bluetooth device and connect to it.
 */
declare function requestAndConnect(): Promise<void>;
declare function isConnected(): boolean;
declare function disconnect(): Promise<void>;
/**
 * Set the state of the Thymio 3 actuators.
 * @param {*} actuatorData
 */
declare function setActuatorState(actuatorData: ActuatorData): Promise<void>;
declare function sendPythonScript(script: string): Promise<void>;
declare function executeLoadedScript(): Promise<void>;
declare function stopScriptExecution(): Promise<void>;
/**
 * Start the sensor streaming. By default, only the main sensors are enabled.
 * @param other Enable/disable other sensors
 */
declare function startSensorStreaming(other?: boolean): Promise<void>;
/**
 * Stop all sensor streaming.
 */
declare function stopSensorStreaming(): Promise<void>;
declare function uploadFirmware(firmware: ArrayBuffer): Promise<void>;
declare function stopFirmwareUpload(): Promise<void>;
/**
 * Upload a custom audio file.
 * @param file The audio file to upload.
 */
declare function uploadAudioFile(file: File): Promise<void>;
/**
 * Play the audio file that is currently in memory.
 */
declare function playAudioFile(): Promise<void>;
/**
 * Stop the audio file that is currently playing.
 */
declare function stopAudioFile(): Promise<void>;
/**
 * Start recording audio to memory.
 * @param duration The duration of the recording (maximum 10 seconds).
 */
declare function recordAudio(duration: number): Promise<void>;
/**
 * Play a frequency.
 * @param frequency Frequency in Hz (up to 3kHz)
 * @param duration Duration in tenths of a second, 0 means play forever
 */
declare function playFrequency(frequency: number, duration: number): Promise<void>;
declare function uploadFile(file: File): Promise<void>;
declare function saveFile(filename: string): Promise<void>;
declare function deleteFile(filename: string): Promise<void>;
declare function listFiles(): Promise<FileListing[]>;

export { deleteFile, disconnect, executeLoadedScript, isConnected, listFiles, playAudioFile, playFrequency, recordAudio, requestAndConnect, saveFile, sendPythonScript, setActuatorState, startSensorStreaming, stopAudioFile, stopFirmwareUpload, stopScriptExecution, stopSensorStreaming, uploadAudioFile, uploadFile, uploadFirmware };
