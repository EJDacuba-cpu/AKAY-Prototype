export function createDraftCheckpointScheduler({ write, delay = 1500, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  const close = () => { if (timer !== null) cancel(timer); timer = null; };
  return {
    changed(dirty) {
      if (!dirty) { close(); return; }
      if (timer !== null) return;
      timer = schedule(() => { timer = null; void write(); }, delay);
    },
    close,
  };
}
