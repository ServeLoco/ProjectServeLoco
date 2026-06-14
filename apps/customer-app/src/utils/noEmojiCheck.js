/**
 * Detects if a string contains emojis.
 * @param {string} text 
 * @returns {boolean}
 */
export function hasEmoji(text) {
  if (typeof text !== 'string') return false;
  // Matches wide range of emojis
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  return emojiRegex.test(text);
}

/**
 * Removes emojis from a string to comply with the no-emoji rule.
 * @param {string} text 
 * @returns {string}
 */
export function stripEmojis(text) {
  if (typeof text !== 'string') return text;
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  return text.replace(emojiRegex, '').trim();
}

/**
 * Development-only utility to assert that a string has no emojis.
 * @param {string} text 
 * @param {string} contextName 
 */
export function assertNoEmoji(text, contextName = 'UI Text') {
  if (__DEV__ && hasEmoji(text)) {
    console.warn(`[No Emoji Rule Violation] Emojis detected in ${contextName}: "${text}"`);
  }
}
