const REGISTRATION_KEY = "__thymioPythonLanguageRegistration__";

const MODULE_DOC = {
  name: "thymio",
  signature: "import thymio",
  description:
    "Thymio 3 MicroPython module for robot sensors, actuators, audio, motors, onboard behaviors, and utility functions.",
  detail: "Thymio module",
  parameters: [],
};

const TIME_MODULE_DOC = {
  name: "time",
  signature: "import time",
  description: "Python and MicroPython time module for sleeping, reading clocks, and working with time tuples.",
  detail: "Python time module",
  parameters: [],
};

function param(name, documentation = "") {
  return { name, documentation };
}

function api({
  name,
  signature,
  description,
  parameters = [],
  detail = "",
  kind = "function",
  insertText,
  returnType = "",
}) {
  return {
    name,
    signature,
    description,
    parameters,
    detail,
    kind,
    insertText,
    returnType,
  };
}

function constructorApi(name, parameters, description) {
  return api({
    name,
    signature: `thymio.${name}(${parameters.map((item) => item.name).join(", ")})`,
    description,
    parameters,
    detail: "Thymio constructor",
    kind: "constructor",
    returnType: name,
  });
}

function moduleFunctionApi(name, parameters, description, returnType = "") {
  return api({
    name,
    signature: `thymio.${name}(${parameters.map((item) => item.name).join(", ")})`,
    description,
    parameters,
    detail: "Thymio function",
    returnType,
  });
}

function timeFunctionApi(name, parameters, description, returnType = "") {
  return api({
    name,
    signature: `time.${name}(${parameters.map((item) => item.name).join(", ")})`,
    description,
    parameters,
    detail: "time module function",
    returnType,
  });
}

function methodApi(name, parameters, description, returnType = "") {
  return api({
    name,
    signature: `${name}(${parameters.map((item) => item.name).join(", ")})`,
    description,
    parameters,
    detail: returnType ? `Returns ${returnType}` : "Thymio method",
    kind: "method",
    returnType,
  });
}

const BASIC_LED_METHODS = {
  on: methodApi("on", [], "Turn the LED on at maximum brightness."),
  off: methodApi("off", [], "Turn the LED off."),
  intensity: methodApi(
    "intensity",
    [param("brightness=None", "Optional LED intensity from 0 (off) to 16 (full on). Omit it to read the current intensity.")],
    "Get or set the LED intensity. With no argument, returns the current intensity. With an argument, sets the intensity.",
    "number | None"
  ),
};

const THYMIO_MODULE_MEMBERS = {
  BUTTONS: constructorApi("BUTTONS", [], "Access the five top buttons."),
  COLOR_SENSOR: constructorApi("COLOR_SENSOR", [], "Access the bottom color sensor."),
  FILESYSTEM: constructorApi("FILESYSTEM", [], "Access the internal file management system."),
  GROUND: constructorApi(
    "GROUND",
    [param("id", "Ground sensor id: 0 = left, 1 = right.")],
    "Access one of the two bottom-front ground sensors."
  ),
  IMU: constructorApi("IMU", [], "Access accelerometer, gyroscope, yaw angle, tap, and freefall readings."),
  LEDS_CIRCLE: constructorApi(
    "LEDS_CIRCLE",
    [param("id", "Circle LED id: 0 = front, then clockwise to 7 = front-left.")],
    "Access one of the eight circle LEDs around the buttons."
  ),
  LEDS_LEGO_BACK: constructorApi(
    "LEDS_LEGO_BACK",
    [param("id", "Back Lego LED id from 0 to 7, left to right.")],
    "Access one of the eight rear Lego LEDs."
  ),
  LEDS_LEGO_FRONT: constructorApi(
    "LEDS_LEGO_FRONT",
    [param("id", "Front Lego LED id from 0 to 7, left to right.")],
    "Access one of the eight front Lego LEDs."
  ),
  LEDS_RGB: constructorApi(
    "LEDS_RGB",
    [
      param(
        "id",
        "RGB LED id: 0 = front left, 1 = front right, 2 = back left, 3 = back right, 4 = small bottom, 5 = small back."
      ),
    ],
    "Access one of the six RGB LEDs."
  ),
  LEDS_BUTTONS: constructorApi(
    "LEDS_BUTTONS",
    [param("id", "Button LED id: 0 = front, 1 = right, 2 = back, 3 = left.")],
    "Access one of the four button LEDs."
  ),
  LED_RECEIVER: constructorApi("LED_RECEIVER", [], "Access the TV remote receiver LED."),
  LED_MICROPHONE: constructorApi("LED_MICROPHONE", [], "Access the microphone LED."),
  MOTORS: constructorApi("MOTORS", [], "Access the two motors."),
  PROXIMITY: constructorApi(
    "PROXIMITY",
    [
      param(
        "id",
        "Proximity sensor id: 0 = front left, 1 = front center left, 2 = front center, 3 = front center right, 4 = front right, 5 = back left, 6 = back right."
      ),
    ],
    "Access one of the seven proximity sensors."
  ),
  RC5: constructorApi("RC5", [], "Access commands received from a standard TV remote control."),
  SOUND: constructorApi("SOUND", [], "Access recording, playback, tones, microphone volume, and sound events."),
  BEHAVIORS: constructorApi("BEHAVIORS", [], "Enable or disable onboard robot behaviors."),
  I2C: constructorApi("I2C", [], "Communicate with external devices over I2C."),
  get_battery_voltage: moduleFunctionApi("get_battery_voltage", [], "Return the current battery voltage in millivolts.", "number"),
  turn_off_all: moduleFunctionApi("turn_off_all", [], "Turn off all LEDs and stop the motors."),
  get_api_version: moduleFunctionApi("get_api_version", [], "Return the current Thymio API version.", "string"),
};

const TIME_MODULE_MEMBERS = {
  sleep: timeFunctionApi(
    "sleep",
    [param("seconds", "Number of seconds to sleep. Fractional values may be supported.")],
    "Pause execution for the given number of seconds."
  ),
  sleep_ms: timeFunctionApi(
    "sleep_ms",
    [param("ms", "Number of milliseconds to sleep.")],
    "Pause execution for the given number of milliseconds."
  ),
  sleep_us: timeFunctionApi(
    "sleep_us",
    [param("us", "Number of microseconds to sleep.")],
    "Pause execution for the given number of microseconds."
  ),
  ticks_ms: timeFunctionApi("ticks_ms", [], "Return an increasing millisecond counter suitable for elapsed-time calculations.", "number"),
  ticks_us: timeFunctionApi("ticks_us", [], "Return an increasing microsecond counter suitable for elapsed-time calculations.", "number"),
  ticks_cpu: timeFunctionApi(
    "ticks_cpu",
    [],
    "Return the highest-resolution counter available on the platform, when supported.",
    "number"
  ),
  ticks_add: timeFunctionApi(
    "ticks_add",
    [param("ticks", "A ticks value returned by ticks_ms(), ticks_us(), or ticks_cpu()."), param("delta", "Offset to add.")],
    "Add an offset to a ticks value while preserving wraparound semantics.",
    "number"
  ),
  ticks_diff: timeFunctionApi(
    "ticks_diff",
    [param("ticks1", "A later ticks value."), param("ticks2", "An earlier ticks value.")],
    "Return the signed difference between two ticks values while handling counter wraparound.",
    "number"
  ),
  time: timeFunctionApi("time", [], "Return the current time in seconds since the Epoch, when the runtime clock is set.", "number"),
  localtime: timeFunctionApi(
    "localtime",
    [param("secs=None", "Optional seconds since the Epoch. Omit it to use the current time.")],
    "Convert seconds since the Epoch to a local time tuple.",
    "tuple"
  ),
  gmtime: timeFunctionApi(
    "gmtime",
    [param("secs=None", "Optional seconds since the Epoch. Omit it to use the current time.")],
    "Convert seconds since the Epoch to a UTC time tuple.",
    "tuple"
  ),
  mktime: timeFunctionApi(
    "mktime",
    [param("tuple", "A local time tuple.")],
    "Convert a local time tuple to seconds since the Epoch.",
    "number"
  ),
};

const THYMIO_CLASSES = {
  BUTTONS: {
    methods: {
      get_status: methodApi(
        "get_status",
        [],
        "Return the current state of the five top buttons as [BACKWARD, LEFT, CENTER, FORWARD, RIGHT], using 1 for pressed and 0 for not pressed.",
        "list"
      ),
    },
  },
  COLOR_SENSOR: {
    methods: {
      get_hsv: methodApi(
        "get_hsv",
        [],
        "Return HSV values detected by the color sensor. Hue is 0..360, saturation is 0..100, and value is 0..100.",
        "tuple"
      ),
      get_raw: methodApi("get_raw", [], "Return raw RGB values detected by the color sensor.", "tuple"),
      get_calibration: methodApi(
        "get_calibration",
        [],
        "Return white and black calibration values as [red white, green white, blue white, red black, green black, blue black].",
        "list"
      ),
    },
  },
  FILESYSTEM: {
    methods: {
      write: methodApi(
        "write",
        [
          param("fname", "File name."),
          param("data", "Data to write."),
          param("size", "Size of the data to write."),
        ],
        "Save a file in internal memory."
      ),
      read: methodApi("read", [param("fname", "File name.")], "Read a file stored in internal memory.", "string"),
      remove_file: methodApi("remove_file", [param("fname", "File name.")], "Delete a file from internal memory."),
    },
  },
  GROUND: {
    methods: {
      value: methodApi("value", [], "Return the ground sensor value. Lower values indicate darker surfaces.", "number"),
      ambient: methodApi("ambient", [], "Return the ambient light value from the ground sensor.", "number"),
      reflected: methodApi("reflected", [], "Return the reflected light value from the ground sensor.", "number"),
    },
  },
  IMU: {
    methods: {
      get_acc: methodApi("get_acc", [], "Return raw accelerometer values in the range -32768..32767.", "tuple"),
      get_gyro: methodApi("get_gyro", [], "Return raw gyroscope values in the range -32768..32767.", "tuple"),
      get_angle_deg: methodApi("get_angle_deg", [], "Return the yaw angle in degrees.", "number"),
      reset_angle: methodApi("reset_angle", [], "Reset the yaw angle to 0 degrees."),
      rotate_deg: methodApi(
        "rotate_deg",
        [param("angle", "Delta angle in degrees, usually -360..360."), param("speed", "Maximum rotation speed, 0..1000.")],
        "Tell the robot to rotate by the given angle at the given maximum speed."
      ),
      rotation_completed: methodApi("rotation_completed", [], "Return True when the robot has reached the rotate_deg target.", "bool"),
      get_gyro_calib: methodApi("get_gyro_calib", [], "Return gyroscope calibration values.", "tuple"),
      reset_gyro_calib: methodApi("reset_gyro_calib", [], "Reset gyroscope calibration values to 0."),
      calibrate_gyro: methodApi("calibrate_gyro", [], "Run manual gyroscope calibration. Automatic calibration should be off first."),
      enable_gyro_auto_calib: methodApi("enable_gyro_auto_calib", [], "Enable automatic gyroscope calibration."),
      disable_gyro_auto_calib: methodApi("disable_gyro_auto_calib", [], "Disable automatic gyroscope calibration."),
      tap_detected: methodApi("tap_detected", [], "Return True if a tap was detected. Clear the flag with clear_tap_event().", "bool"),
      clear_tap_event: methodApi("clear_tap_event", [], "Clear the tap event flag."),
      freefall_detected: methodApi(
        "freefall_detected",
        [],
        "Return True if a freefall was detected. Clear the flag with clear_freefall_event().",
        "bool"
      ),
      clear_freefall_event: methodApi("clear_freefall_event", [], "Clear the freefall event flag."),
    },
  },
  LEDS_CIRCLE: { methods: BASIC_LED_METHODS },
  LEDS_LEGO_BACK: { methods: BASIC_LED_METHODS },
  LEDS_LEGO_FRONT: { methods: BASIC_LED_METHODS },
  LEDS_BUTTONS: { methods: BASIC_LED_METHODS },
  LED_RECEIVER: { methods: BASIC_LED_METHODS },
  LED_MICROPHONE: {
    methods: {
      on: methodApi("on", [], "Turn the microphone LED on and disable the onboard microphone LED behavior."),
      off: methodApi("off", [], "Turn the microphone LED off and disable the onboard microphone LED behavior."),
    },
  },
  LEDS_RGB: {
    methods: {
      on: methodApi("on", [], "Turn the RGB LED white at maximum brightness."),
      off: methodApi("off", [], "Turn the RGB LED off."),
      set_intensity: methodApi(
        "set_intensity",
        [
          param("red", "Red intensity from 0 (off) to 16 (full on)."),
          param("green", "Green intensity from 0 (off) to 16 (full on)."),
          param("blue", "Blue intensity from 0 (off) to 16 (full on)."),
        ],
        "Set the red, green, and blue intensity of the RGB LED."
      ),
      get_intensity_red: methodApi("get_intensity_red", [], "Return the current red intensity, 0..16.", "number"),
      get_intensity_green: methodApi("get_intensity_green", [], "Return the current green intensity, 0..16.", "number"),
      get_intensity_blue: methodApi("get_intensity_blue", [], "Return the current blue intensity, 0..16.", "number"),
    },
  },
  MOTORS: {
    methods: {
      set_speed: methodApi(
        "set_speed",
        [
          param("left", "Left motor speed from -1000 to 1000."),
          param("right", "Right motor speed from -1000 to 1000."),
        ],
        "Set the target speed of the left and right motors."
      ),
      get_left_speed: methodApi("get_left_speed", [], "Return the measured left motor speed.", "number"),
      get_right_speed: methodApi("get_right_speed", [], "Return the measured right motor speed.", "number"),
      get_left_pwm_duty: methodApi("get_left_pwm_duty", [], "Return the left motor PWM duty cycle.", "number"),
      get_right_pwm_duty: methodApi("get_right_pwm_duty", [], "Return the right motor PWM duty cycle.", "number"),
    },
  },
  PROXIMITY: {
    methods: {
      value: methodApi("value", [], "Return the proximity sensor value.", "number"),
    },
  },
  RC5: {
    methods: {
      get_command: methodApi("get_command", [], "Return the last command received from the remote control.", "number"),
    },
  },
  SOUND: {
    methods: {
      record: methodApi(
        "record",
        [param("duration", "Recording duration in seconds. Maximum duration is 10 seconds.")],
        "Record sound into RAM as WAV data."
      ),
      record_completed: methodApi("record_completed", [], "Return True when the recording is completed.", "bool"),
      record_get: methodApi("record_get", [], "Return the recorded audio data so it can be saved.", "bytes"),
      play_recorded: methodApi("play_recorded", [], "Play the last recorded sound directly from RAM."),
      play_from_file: methodApi(
        "play_from_file",
        [param("name", "WAV or MP3 filename in robot storage.")],
        "Play a sound file from internal robot storage."
      ),
      play_onboard: methodApi(
        "play_onboard",
        [param("id", "Onboard sound id, 0..15.")],
        "Play one of the built-in robot firmware sounds."
      ),
      play_tone: methodApi(
        "play_tone",
        [
          param("frequency", "Tone frequency in Hz."),
          param("duration", "Duration in tenths of a second. Use 0 to play forever."),
        ],
        "Play a tone at the given frequency."
      ),
      play_completed: methodApi("play_completed", [], "Return True when the last sound playback is completed.", "bool"),
      clear_events: methodApi("clear_events", [], "Clear audio play-completed and record-completed events."),
      pause: methodApi("pause", [], "Pause a running sound playback."),
      resume: methodApi("resume", [], "Resume a paused sound playback."),
      stop: methodApi("stop", [], "Stop any running sound playback."),
      get_mic_volume: methodApi("get_mic_volume", [], "Return the volume computed from the microphone.", "number"),
      clap_detected: methodApi("clap_detected", [], "Return True if a clap was detected. Clear the flag with clear_clap_event().", "bool"),
      clear_clap_event: methodApi("clear_clap_event", [], "Clear the clap event flag."),
      set_volume: methodApi("set_volume", [param("vol", "Volume from 0 to 10.")], "Set the play volume."),
      save_volume: methodApi("save_volume", [], "Save the current volume to permanent settings."),
    },
  },
  BEHAVIORS: {
    methods: {
      disable_behaviors: methodApi("disable_behaviors", [], "Disable onboard behaviors and release sensors/actuators for user scripts."),
      enable_behaviors: methodApi("enable_behaviors", [], "Enable onboard behaviors."),
      disable_sound_button: methodApi("disable_sound_button", [], "Disable the sound button behavior."),
      enable_sound_button: methodApi("enable_sound_button", [], "Enable the sound button behavior."),
      disable_leds_button: methodApi("disable_leds_button", [], "Disable the button LEDs behavior."),
      enable_leds_button: methodApi("enable_leds_button", [], "Enable the button LEDs behavior."),
      disable_leds_lego_gyro: methodApi("disable_leds_lego_gyro", [], "Disable the Lego LEDs gyroscope behavior."),
      enable_leds_lego_gyro: methodApi("enable_leds_lego_gyro", [], "Enable the Lego LEDs gyroscope behavior."),
      disable_leds_acc: methodApi("disable_leds_acc", [], "Disable the circle LEDs accelerometer behavior."),
      enable_leds_acc: methodApi("enable_leds_acc", [], "Enable the circle LEDs accelerometer behavior."),
      disable_led_receiver: methodApi("disable_led_receiver", [], "Disable receiver LED toggling on remote commands."),
      enable_led_receiver: methodApi("enable_led_receiver", [], "Enable receiver LED toggling on remote commands."),
      disable_leds_lego_animation: methodApi("disable_leds_lego_animation", [], "Disable Lego LED animations."),
      enable_leds_lego_animation: methodApi("enable_leds_lego_animation", [], "Enable Lego LED animations."),
      disable_leds_proximity: methodApi("disable_leds_proximity", [], "Disable front and back proximity LEDs."),
      enable_leds_proximity: methodApi("enable_leds_proximity", [], "Enable front and back proximity LEDs based on proximity values."),
      disable_leds_battery: methodApi("disable_leds_battery", [], "Disable the central back LEDs battery display."),
      enable_leds_battery: methodApi("enable_leds_battery", [], "Enable the central back LEDs battery display."),
      disable_led_microphone: methodApi("disable_led_microphone", [], "Disable the microphone LED behavior."),
      set_led_mic_threshold: methodApi("set_led_mic_threshold", [], "Set the threshold used by the microphone LED behavior."),
      enable_led_microphone: methodApi("enable_led_microphone", [], "Enable the microphone LED sound-volume behavior."),
    },
  },
  I2C: {
    methods: {
      write_reg: methodApi(
        "write_reg",
        [
          param("dev_addr", "I2C 7-bit device address."),
          param("reg_addr", "Register address."),
          param("data", "Value or bytes to write."),
          param("size", "Number of bytes to write."),
        ],
        "Write data to a register of the specified I2C device."
      ),
      read_reg: methodApi(
        "read_reg",
        [
          param("dev_addr", "I2C 7-bit device address."),
          param("reg_addr", "Register address."),
          param("size", "Number of bytes to read."),
        ],
        "Read data from a register of the specified I2C device.",
        "bytes"
      ),
    },
  },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippetFor(item) {
  if (item.insertText) return item.insertText;

  const parts = item.parameters.map((parameter, index) => {
    const [name, defaultValue] = parameter.name.split("=");
    if (defaultValue !== undefined) return `\${${index + 1}:${defaultValue}}`;
    return `\${${index + 1}:${name}}`;
  });

  return `${item.name}(${parts.join(", ")})`;
}

function kindFor(monaco, item) {
  if (item.kind === "constructor") return monaco.languages.CompletionItemKind.Constructor;
  if (item.kind === "method") return monaco.languages.CompletionItemKind.Method;
  return monaco.languages.CompletionItemKind.Function;
}

function markdownFor(item) {
  const lines = [`\`\`\`python\n${item.signature}\n\`\`\``];

  if (item.description) lines.push(item.description);
  if (item.returnType) lines.push(`Returns: \`${item.returnType}\``);
  if (item.parameters.length > 0) {
    lines.push(
      [
        "**Parameters**",
        ...item.parameters.map((parameter) => {
          const documentation = parameter.documentation ? `: ${parameter.documentation}` : "";
          return `- \`${parameter.name}\`${documentation}`;
        }),
      ].join("\n")
    );
  }

  return { value: lines.join("\n\n") };
}

function completionFor(monaco, item, range, sortPrefix) {
  const hasParameters = item.parameters.length > 0;

  return {
    label: item.name,
    kind: kindFor(monaco, item),
    detail: item.detail || item.signature,
    documentation: markdownFor(item),
    insertText: snippetFor(item),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: `${sortPrefix}${item.name}`,
    command: hasParameters
      ? {
          id: "editor.action.triggerParameterHints",
          title: "Trigger Parameter Hints",
        }
      : undefined,
  };
}

function wordRange(model, position) {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function dotContext(model, position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const match = linePrefix.match(/([A-Za-z_]\w*)\.([A-Za-z_]\w*)?$/);
  if (!match) return null;

  const prefix = match[2] ?? "";
  return {
    owner: match[1],
    prefix,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column - prefix.length,
      endColumn: position.column,
    },
  };
}

function textUntilPosition(model, position) {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function inferThymioObjectTypeFromText(text, variableName) {
  const assignmentPattern = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(variableName)}\\s*=\\s*thymio\\.([A-Za-z_]\\w*)\\s*\\(`,
    "g"
  );
  let inferredType = null;
  let match = assignmentPattern.exec(text);

  while (match) {
    if (THYMIO_CLASSES[match[1]]) inferredType = match[1];
    match = assignmentPattern.exec(text);
  }

  return inferredType;
}

function inferThymioObjectType(model, position, variableName) {
  return inferThymioObjectTypeFromText(textUntilPosition(model, position), variableName);
}

function moduleCompletions(monaco, range) {
  return Object.values(THYMIO_MODULE_MEMBERS).map((item) => completionFor(monaco, item, range, "0_"));
}

function timeCompletions(monaco, range) {
  return Object.values(TIME_MODULE_MEMBERS).map((item) => completionFor(monaco, item, range, "0_"));
}

function methodCompletions(monaco, typeName, range) {
  const typeInfo = THYMIO_CLASSES[typeName];
  if (!typeInfo) return [];
  return Object.values(typeInfo.methods).map((item) => completionFor(monaco, item, range, "0_"));
}

function topLevelCompletions(monaco, range) {
  return [
    {
      label: "thymio",
      kind: monaco.languages.CompletionItemKind.Module,
      detail: MODULE_DOC.detail,
      documentation: markdownFor(MODULE_DOC),
      insertText: "thymio",
      range,
      sortText: "0_thymio",
    },
    {
      label: "time",
      kind: monaco.languages.CompletionItemKind.Module,
      detail: TIME_MODULE_DOC.detail,
      documentation: markdownFor(TIME_MODULE_DOC),
      insertText: "time",
      range,
      sortText: "0_time",
    },
    {
      label: "import thymio",
      filterText: "import thymio",
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "Import the Thymio module",
      documentation: markdownFor(MODULE_DOC),
      insertText: "import thymio",
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      sortText: "1_import_thymio",
    },
    {
      label: "import time",
      filterText: "import time",
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "Import the Python time module",
      documentation: markdownFor(TIME_MODULE_DOC),
      insertText: "import time",
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      sortText: "1_import_time",
    },
  ];
}

function resolveDottedItem(model, position, owner, name) {
  if (owner === "thymio") return THYMIO_MODULE_MEMBERS[name] ?? null;
  if (owner === "time") return TIME_MODULE_MEMBERS[name] ?? null;

  const typeName = inferThymioObjectType(model, position, owner);
  if (!typeName) return null;

  return THYMIO_CLASSES[typeName]?.methods[name] ?? null;
}

function provideCompletions(monaco, model, position) {
  const context = dotContext(model, position);

  if (context?.owner === "thymio") {
    return {
      suggestions: moduleCompletions(monaco, context.range),
    };
  }

  if (context?.owner === "time") {
    return {
      suggestions: timeCompletions(monaco, context.range),
    };
  }

  if (context) {
    const typeName = inferThymioObjectType(model, position, context.owner);
    return {
      suggestions: methodCompletions(monaco, typeName, context.range),
    };
  }

  return {
    suggestions: topLevelCompletions(monaco, wordRange(model, position)),
  };
}

function provideHover(model, position) {
  const word = model.getWordAtPosition(position);
  if (!word) return null;

  const linePrefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
  const dotMatch = linePrefix.match(/([A-Za-z_]\w*)\.$/);
  const item = dotMatch
    ? resolveDottedItem(model, position, dotMatch[1], word.word)
    : word.word === MODULE_DOC.name
      ? MODULE_DOC
      : word.word === TIME_MODULE_DOC.name
        ? TIME_MODULE_DOC
        : null;

  if (!item) return null;

  return {
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    },
    contents: [markdownFor(item)],
  };
}

function findActiveOpenParen(text) {
  const stack = [];
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inComment) {
      if (char === "\n") inComment = false;
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "#") {
      inComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      stack.push(index);
    } else if (char === ")") {
      stack.pop();
    }
  }

  return stack.length > 0 ? stack[stack.length - 1] : -1;
}

function activeParameterIndex(argumentText) {
  let depth = 0;
  let commas = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < argumentText.length; index += 1) {
    const char = argumentText[index];

    if (inComment) {
      if (char === "\n") inComment = false;
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "#") {
      inComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      commas += 1;
    }
  }

  return commas;
}

function callableBeforeOpenParen(text, openParenIndex) {
  const head = text.slice(0, openParenIndex).trimEnd();
  const match = head.match(/([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?$/);
  if (!match) return null;

  if (match[2]) {
    return {
      owner: match[1],
      name: match[2],
    };
  }

  return { name: match[1] };
}

function signatureItemFor(call, sourceUntilCursor) {
  if (!call.owner) return null;
  if (call.owner === "thymio") return THYMIO_MODULE_MEMBERS[call.name] ?? null;
  if (call.owner === "time") return TIME_MODULE_MEMBERS[call.name] ?? null;

  const typeName = inferThymioObjectTypeFromText(sourceUntilCursor, call.owner);
  if (!typeName) return null;

  return THYMIO_CLASSES[typeName]?.methods[call.name] ?? null;
}

function provideSignatureHelp(model, position) {
  const sourceUntilCursor = textUntilPosition(model, position);
  const openParenIndex = findActiveOpenParen(sourceUntilCursor);
  if (openParenIndex < 0) return null;

  const call = callableBeforeOpenParen(sourceUntilCursor, openParenIndex);
  if (!call) return null;

  const item = signatureItemFor(call, sourceUntilCursor);
  if (!item) return null;

  const rawActiveParameter = activeParameterIndex(sourceUntilCursor.slice(openParenIndex + 1));
  const activeParameter = item.parameters.length > 0 ? Math.min(rawActiveParameter, item.parameters.length - 1) : 0;

  return {
    value: {
      signatures: [
        {
          label: item.signature,
          documentation: markdownFor(item),
          parameters: item.parameters.map((parameter) => ({
            label: parameter.name,
            documentation: parameter.documentation,
          })),
        },
      ],
      activeSignature: 0,
      activeParameter,
    },
    dispose() {},
  };
}

function disposeRegistration(registration) {
  if (!registration || registration.disposed) return;
  registration.disposables.forEach((disposable) => disposable.dispose());
  registration.disposed = true;
}

export function registerThymioPythonLanguage(monaco) {
  if (!monaco?.languages) return null;

  const existingRegistration = globalThis[REGISTRATION_KEY];
  if (existingRegistration?.monaco === monaco && !existingRegistration.disposed) {
    return existingRegistration;
  }

  disposeRegistration(existingRegistration);

  const disposables = [
    monaco.languages.registerCompletionItemProvider("python", {
      triggerCharacters: ["."],
      provideCompletionItems(model, position) {
        return provideCompletions(monaco, model, position);
      },
    }),
    monaco.languages.registerHoverProvider("python", {
      provideHover,
    }),
    monaco.languages.registerSignatureHelpProvider("python", {
      signatureHelpTriggerCharacters: ["(", ","],
      signatureHelpRetriggerCharacters: [","],
      provideSignatureHelp,
    }),
  ];

  const registration = {
    monaco,
    disposables,
    disposed: false,
    dispose() {
      disposeRegistration(this);
      if (globalThis[REGISTRATION_KEY] === this) {
        delete globalThis[REGISTRATION_KEY];
      }
    },
  };

  globalThis[REGISTRATION_KEY] = registration;
  return registration;
}
