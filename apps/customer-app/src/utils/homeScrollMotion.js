// Decorative native animations still cost drawing work during a swipe. Pause
// them for the drag and momentum without setting React state or rebuilding
// cards; the native scroll/header animations continue independently.
export function createScrollMotionController(idleMs = 180) {
  const animations = new Set();
  let scrolling = false;
  let dragging = false;
  let idleTimer = null;

  const finish = () => {
    clearTimeout(idleTimer);
    idleTimer = null;
    dragging = false;
    if (!scrolling) return;
    scrolling = false;
    animations.forEach(animation => {
      // Composite loops remember stop() until reset(), including JS-backed
      // sequences containing native animations and delays.
      animation.reset();
      animation.start();
    });
  };
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!scrolling) {
      scrolling = true;
      animations.forEach(animation => animation.stop());
    }
    // A slow drag can have gaps between scroll events. Keep decorations
    // paused until the finger lifts, then use events to cover momentum and
    // platforms that don't emit a momentum-end event.
    if (!dragging) idleTimer = setTimeout(finish, idleMs);
  };
  return {
    isScrolling: () => scrolling,
    beginDrag() {
      dragging = true;
      touch();
    },
    endDrag() {
      dragging = false;
      touch();
    },
    touch,
    finish,
    register(animation) {
      animations.add(animation);
      if (!scrolling) animation.start();
      return () => {
        animations.delete(animation);
        animation.stop();
      };
    },
  };
}

export const homeScrollMotion = createScrollMotionController();
export const runHomeAmbientAnimation = animation => homeScrollMotion.register(animation);
