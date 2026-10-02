export function loopPhase(elapsed, duration, segments) {
  // requestAnimationFrame can report a timestamp earlier than an effect's start.
  return ((elapsed % duration + duration) % duration) / duration * segments
}
