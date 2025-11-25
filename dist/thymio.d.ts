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

type FirmwareInfo = {
    esp32_ver: number;
    stm32_ver: number;
};
type MemoryInfo = {
    flash_bytes_free: number;
    ram_bytes_free: number;
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
/**
 * Upload a file to the Thymio. It will be placed in RAM.
 * @param file File to upload
 */
declare function uploadFile(file: File): Promise<void>;
/**
 * Save the file that is present in the RAM to the storage.
 * @param filename Name of the file new file.
 */
declare function saveFile(filename: string): Promise<void>;
/**
 * Delete a file from the storage.
 * @param filename Name of the file to delete.
 * @returns
 */
declare function deleteFile(filename: string): Promise<void>;
/**
 * List files present in the Thymio storage.
 * @returns A listing of files with their names and sizes.
 */
declare function listFiles(): Promise<FileListing[]>;
/**
 * Erase all files from the Thymio storage.
 */
declare function eraseAllFiles(): Promise<void>;
/**
 * Download a file from the robot.
 * @param filename Name of the file to download.
 * @returns An byte array of the downloaded file.
 */
declare function downloadFile(filename: string): Promise<Uint8Array<ArrayBuffer>>;
/**
 * Free the RAM from the uploaded files.
 */
declare function freeMemory(): Promise<void>;
/**
 * Get the device firmware info.
 */
declare function getFirmwareInfo(): Promise<FirmwareInfo>;
/**
 * Get the device memory info.
 */
declare function getMemoryInfo(): Promise<MemoryInfo>;

export { deleteFile, disconnect, downloadFile, eraseAllFiles, executeLoadedScript, freeMemory, getFirmwareInfo, getMemoryInfo, isConnected, listFiles, playAudioFile, playFrequency, recordAudio, requestAndConnect, saveFile, sendPythonScript, setActuatorState, startSensorStreaming, stopAudioFile, stopFirmwareUpload, stopScriptExecution, stopSensorStreaming, uploadAudioFile, uploadFile, uploadFirmware };
