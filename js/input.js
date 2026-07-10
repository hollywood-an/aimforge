// Pointer lock + raw mouse input. Deltas are accumulated per frame so high-polling-rate
// mice (1000 Hz+) are integrated correctly instead of dropping events.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.locked = false;
    this._dx = 0;
    this._dy = 0;
    this.fireHeld = false;

    // Callbacks assigned by the game.
    this.onFireDown = null;
    this.onFireUp = null;
    this.onKey = null; // (code, event) while NOT typing in an input
    this.onLockChange = null; // (locked)
    this.onLockDenied = null; // browser refused the lock (e.g. post-Esc cooldown)

    document.addEventListener('pointerlockerror', () => this.onLockDenied?.());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.fireHeld = false;
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this._dx += e.movementX;
      this._dy += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked || e.button !== 0) return;
      this.fireHeld = true;
      this.onFireDown?.();
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.fireHeld = false;
      this.onFireUp?.();
    });

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.onKey?.(e.code, e);
    });

    // Never show the context menu over the game.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Request pointer lock with raw (OS-acceleration-free) input where supported. */
  requestLock() {
    const denied = () => this.onLockDenied?.();
    const plain = () => {
      try {
        const p2 = this.canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(denied);
      } catch {
        denied();
      }
    };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch((err) => {
          // Unadjusted movement unsupported -> retry plain. Anything else
          // (SecurityError cooldown etc.) -> report denial.
          if (err && err.name === 'NotSupportedError') plain();
          else denied();
        });
      }
    } catch {
      plain();
    }
  }

  exitLock() {
    if (this.locked) document.exitPointerLock();
  }

  /** Returns accumulated mouse deltas since last call and resets them. */
  consumeDeltas() {
    const d = { dx: this._dx, dy: this._dy };
    this._dx = 0;
    this._dy = 0;
    return d;
  }
}
