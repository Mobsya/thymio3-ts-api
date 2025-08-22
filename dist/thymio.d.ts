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
/**
 * Request a bluetooth device and connect to it.
 */
declare function requestAndConnect(): Promise<void>;
/**
 * Set the state of the Thymio 3 actuators.
 * @param {*} actuatorData
 */
declare function setActuatorState(actuatorData: ActuatorData): Promise<void>;
declare function sendPythonScript(script: string): Promise<void>;
declare function executeLoadedScript(): Promise<void>;
declare function stopScriptExecution(): Promise<void>;

export { type ActuatorData, type RGB, executeLoadedScript, requestAndConnect, sendPythonScript, setActuatorState, stopScriptExecution };
