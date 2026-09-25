// Customer-typed delivery address (checkout's optional field + Edit Profile).
// Kept to one tidy line so it reads cleanly on the admin order card, the
// new-order alert and the rider's screen.
export const ADDRESS_MAX_LENGTH = 100;

// Light clean-up while typing: no line breaks/tabs, no runs of spaces, no
// leading space. A single trailing space is kept so the next word can follow.
export const tidyAddressInput = (text) => String(text ?? '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/ {2,}/g, ' ')
  .replace(/^\s+/, '')
  .slice(0, ADDRESS_MAX_LENGTH);

// Final form sent to the server: trimmed, ", " between parts, no empty or
// dangling commas.
export const formatAddress = (text) => tidyAddressInput(text)
  .replace(/\s*,[\s,]*/g, ', ')
  .replace(/^[\s,]+|[\s,]+$/g, '')
  .trim()
  .slice(0, ADDRESS_MAX_LENGTH);
