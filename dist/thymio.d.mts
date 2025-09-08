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
type SensorsData = {
    colorSensor: {
        h: number;
        s: number;
        v: number;
    };
    groundSensors: {
        left: number;
        right: number;
    };
    accelerationRaw: {
        x: number;
        y: number;
        z: number;
    };
    gyroRaw: {
        x: number;
        y: number;
        z: number;
    };
    buttons: {
        back: boolean;
        left: boolean;
        center: boolean;
        forward: boolean;
        right: boolean;
    };
    microphoneVolume: number;
    proximitySensors: {
        left: number;
        frontLeft: number;
        center: number;
        frontRight: number;
        right: number;
        backLeft: number;
        backRight: number;
    };
    tvRemote: number;
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
declare function enableSensorStreaming(other?: boolean): Promise<void>;

export { type ActuatorData, type RGB, type SensorsData, enableSensorStreaming, executeLoadedScript, requestAndConnect, sendPythonScript, setActuatorState, stopScriptExecution };
