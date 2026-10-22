// The celebration stage: where the safe box is, and how long an ending lasts. Both
// renderers frame from this and both fades end the same way, so the shared pieces live here
// rather than in two copies that could drift apart.

export const FADE_MS = 400; // the whole canvas dims out; washing the trails with a fill would look dirty
export const SKIP_FADE_MS = 180; // a tap still gets an ending, just a quicker one

// The canvas box, not the window, is the truth. On iOS the two disagree while Safari
// shows or hides its toolbars, and the fixed layer can reach under the home indicator
// even though #app's padding stops the board there.
export function readInsets(rect) {
  const app = document.getElementById('app');
  if (!app) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(app);
  const appRect = app.getBoundingClientRect();
  const px = (value) => parseFloat(value) || 0;
  // #app follows the dynamic viewport (100dvh) while the fixed layer can stay as tall as
  // the layout viewport when Safari's toolbar is showing. Count that hidden strip as inset.
  const hiddenBelow = Math.max(0, rect.bottom - appRect.bottom);
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom) + hiddenBelow,
    left: px(style.paddingLeft),
  };
}

export function readStage(canvas) {
  const rect = canvas.getBoundingClientRect();
  return { rect, insets: readInsets(rect), dpr: window.devicePixelRatio || 1 };
}
