export const EXAMPLES = [
  { title: 'Blink an RGB LED', filename: 'blink.py', code: `import thymio
import time

led = thymio.LEDS_RGB(0)
while True:
    led.set_intensity(15, 0, 0)
    time.sleep(0.5)
    led.off()
    time.sleep(0.5)
` },
  { title: 'Read buttons', filename: 'buttons.py', code: `import thymio
import time

buttons = thymio.BUTTONS()
while True:
    print(buttons.get_status())
    time.sleep(0.2)
` },
  { title: 'Compare ground sensors', filename: 'ground.py', code: `import thymio
import time

left = thymio.GROUND(0)
right = thymio.GROUND(1)
while True:
    print(left.value(), right.value())
    time.sleep(0.2)
` },
  { title: 'Play a tone', filename: 'tone.py', code: `import thymio

sound = thymio.SOUND()
sound.play_tone(440, 5)
` },
];
