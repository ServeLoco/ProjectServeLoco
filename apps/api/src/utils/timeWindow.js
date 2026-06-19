const isWithinTimeWindow = (from, until) => {
  // Both null/empty means always available in the time sense.
  if (!from || !until) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = String(from).split(':').map(Number);
  const [uh, um] = String(until).split(':').map(Number);
  const start = fh * 60 + (fm || 0);
  const end = uh * 60 + (um || 0);
  if (start === end) return true; // no real window
  if (start < end) {
    return cur >= start && cur < end;
  }
  // Window crosses midnight (e.g. 22:00 -> 02:00)
  return cur >= start || cur < end;
};

module.exports = { isWithinTimeWindow };
