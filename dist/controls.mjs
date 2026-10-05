// One normalized input path for flight physics and the radio display.
const clamp = value => Math.max(-1, Math.min(1, value));
export function controlInput(keys, axes = {}) {
  const k = code => keys.has(code) ? 1 : 0;
  return {
    pitch: clamp(k('ArrowUp') - k('ArrowDown') + (axes.pitch || 0)),
    roll: clamp(k('ArrowRight') - k('ArrowLeft') + (axes.roll || 0)),
    yaw: clamp(k('KeyA') + k('KeyQ') - k('KeyD') - k('KeyE') + (axes.yaw || 0)),
    throttle: clamp(k('KeyW') - k('KeyS') + (axes.throttle || 0)),
  };
}

export function bindSticks(root, keys, axes) {
  const sticks = [['leftStick', 'yaw', 'throttle', -1], ['rightStick', 'roll', 'pitch', 1]].map(([id, horizontal, vertical, direction]) => {
    const el = root.getElementById(id);
    const stick = {el, horizontal, vertical, direction, pointer: null};
    const move = event => {
      if (event.pointerId !== stick.pointer) return;
      const rect = el.getBoundingClientRect(), limit = rect.width * .33;
      let x = (event.clientX - rect.left - rect.width / 2) / limit;
      let y = (event.clientY - rect.top - rect.height / 2) / limit;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      axes[horizontal] = x * direction;
      axes[vertical] = -y;
      render();
    };
    stick.release = event => {
      if (event && event.pointerId !== stick.pointer) return;
      const pointer = stick.pointer;
      stick.pointer = null;
      axes[horizontal] = axes[vertical] = 0;
      if (pointer !== null && el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      render();
    };
    el.addEventListener('pointerdown', event => {
      if (stick.pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      stick.pointer = event.pointerId;
      el.setPointerCapture(event.pointerId);
      move(event);
    });
    el.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, stick.release);
    return stick;
  });
  const labels = [...root.querySelectorAll('[data-keys]')];
  function render() {
    const input = controlInput(keys, axes);
    for (const {el, horizontal, vertical, direction} of sticks) {
      const x = input[horizontal] * direction, y = -input[vertical];
      // Axes saturate independently in physics, so diagonal keyboard inputs use
      // the full square travel rather than silently reducing either axis.
      const limit = el.getBoundingClientRect().width * .33;
      el.querySelector('.knob').style.transform = `translate(${x * limit}px, ${y * limit}px)`;
      el.classList.toggle('active', x !== 0 || y !== 0);
    }
    for (const label of labels) label.classList.toggle('pressed', label.dataset.keys.split(' ').some(code => keys.has(code)));
  }
  return {render, clear() { for (const stick of sticks) stick.release(); render(); }};
}
