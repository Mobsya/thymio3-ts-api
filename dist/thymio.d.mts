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
type OtherSensorData = {
    colorRaw: {
        red: number;
        green: number;
        blue: number;
        clear: number;
    };
    colorDetected: number;
    groundAmbient: {
        left: number;
        right: number;
    };
    groundReflected: {
        left: number;
        right: number;
    };
    angleDegrees: number;
    eventFlags: {
        tapDetected: boolean;
        freefallDetected: boolean;
        clapDetected: boolean;
    };
    motor: {
        leftSpeed: number;
        rightSpeed: number;
        leftPwmDuty: number;
        rightPwmDuty: number;
    };
    batteryVoltage: number;
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
/**
 * Start and stop the sensor streaming. By default, only the main sensors are enabled/disabled.
 * @param other Enable/disable other sensors
 */
declare function toggleSensorStreaming(other?: boolean): Promise<void>;

export { type ActuatorData, type OtherSensorData, type RGB, type SensorsData, executeLoadedScript, requestAndConnect, sendPythonScript, setActuatorState, stopScriptExecution, toggleSensorStreaming };
