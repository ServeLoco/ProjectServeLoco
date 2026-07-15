/**
 * Tests for src/utils/alarmSound.js — the OEM-safe media-stack alarm playback
 * used by orderAlarmNotifications.js (ColorOS/Realme suppress notification
 * channel sounds; this plays through expo-audio instead so it's actually
 * audible).
 *
 * The module memoizes one player per kind ('order' | 'rider') at module
 * scope, so each test resets the module registry and re-requires it fresh —
 * otherwise a player created in one test leaks into the next.
 */

describe('alarmSound', () => {
  let Platform, createAudioPlayer, playAlarmSound, stopAlarmSound;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    Platform = require('react-native').Platform;
    Platform.OS = 'android';
    createAudioPlayer = require('expo-audio').createAudioPlayer;
    ({ playAlarmSound, stopAlarmSound } = require('../src/utils/alarmSound'));
  });

  afterEach(() => {
    stopAlarmSound();
    jest.useRealTimers();
  });

  it('is a no-op on non-Android platforms', async () => {
    Platform.OS = 'ios';
    await playAlarmSound('order');
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it('plays the order or rider tone from the start', async () => {
    await playAlarmSound('order', { loopMs: 0 });
    const player = createAudioPlayer.mock.results[0].value;
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('reuses the same player across calls for the same kind (memoized)', async () => {
    await playAlarmSound('rider', { loopMs: 0 });
    await playAlarmSound('rider', { loopMs: 0 });
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('creates independent players for order vs rider', async () => {
    await playAlarmSound('order', { loopMs: 0 });
    await playAlarmSound('rider', { loopMs: 0 });
    expect(createAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it('loops playback roughly every 1.1s until loopMs elapses, then pauses', async () => {
    await playAlarmSound('order', { loopMs: 3000 });
    const player = createAudioPlayer.mock.results[0].value;
    expect(player.play).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1100);
    expect(player.play).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1100);
    expect(player.play).toHaveBeenCalledTimes(3);

    // Past loopMs — the loop should stop and pause, not fire a 4th play.
    jest.advanceTimersByTime(1100);
    expect(player.play).toHaveBeenCalledTimes(3);
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it('a second playAlarmSound call replaces the running loop instead of stacking', async () => {
    await playAlarmSound('order', { loopMs: 10000 });
    const player = createAudioPlayer.mock.results[0].value;

    await playAlarmSound('order', { loopMs: 10000 });
    jest.advanceTimersByTime(1100);
    // Only one loop's worth of extra plays — not two overlapping intervals.
    expect(player.play.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('stopAlarmSound pauses the player and cancels the loop immediately', async () => {
    await playAlarmSound('rider', { loopMs: 10000 });
    const player = createAudioPlayer.mock.results[0].value;

    stopAlarmSound();
    expect(player.pause).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    // No further plays after stop.
    expect(player.play).toHaveBeenCalledTimes(1);
  });
});
