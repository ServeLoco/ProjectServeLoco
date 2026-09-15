const { isWithinIstWindow } = require('./businessTime');

/**
 * Is the current IST wall clock inside [from, until)? "HH:MM" / "HH:MM:SS".
 *
 * This used to read `new Date().getHours()` — the API process's own local
 * clock. That is UTC in the production container, so every window an admin
 * typed was evaluated 5h30m off. Delegates to businessTime so there is exactly
 * one definition of "what time is it" in the codebase; the midnight-crossing
 * and empty-bound behaviour is unchanged.
 */
const isWithinTimeWindow = (from, until) => isWithinIstWindow(from, until);

module.exports = { isWithinTimeWindow };
