package com.yashsiwach.villkro

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Looping alarm tone on the ALARM audio stream.
 *
 * The JS alarm (expo-audio) can only play as media, so it is silenced whenever
 * the rider's media volume is down — which is most of the time on a phone used
 * for navigation and music. Riders must hear an offer regardless, so the tone
 * goes out with USAGE_ALARM, exactly like the notification channel's own sound,
 * and follows the alarm volume the rider set for alarms.
 *
 * Used for the in-app offer popup, where no notification is posted (the popup
 * itself is the alert) and therefore nothing else would ring.
 */
class AlarmSoundModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AlarmSound"

  private var player: MediaPlayer? = null

  private fun rawUri(kind: String): Uri {
    val name = if (kind == "rider") "rider_alarm" else "order_alarm"
    return Uri.parse("android.resource://${reactContext.packageName}/raw/$name")
  }

  /**
   * Start looping the tone. Calling it again while the same tone is already
   * playing is a no-op, so the caller's repeating alert loop can keep calling
   * it without restarting the sound mid-note.
   */
  @ReactMethod
  fun start(kind: String, promise: Promise) {
    try {
      player?.let {
        if (it.isPlaying) {
          promise.resolve(true)
          return
        }
      }
      stopInternal()

      val mp = MediaPlayer()
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      mp.setDataSource(reactContext, rawUri(kind))
      mp.isLooping = true
      mp.prepare()
      mp.start()
      player = mp

      promise.resolve(true)
    } catch (e: Exception) {
      stopInternal()
      promise.reject("alarm_sound_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop() {
    stopInternal()
  }

  @ReactMethod
  fun isPlaying(promise: Promise) {
    promise.resolve(try { player?.isPlaying == true } catch (_: Exception) { false })
  }

  private fun stopInternal() {
    val mp = player ?: return
    player = null
    try { if (mp.isPlaying) mp.stop() } catch (_: Exception) { /* already stopped */ }
    try { mp.release() } catch (_: Exception) { /* already released */ }
  }

  override fun invalidate() {
    stopInternal()
    super.invalidate()
  }
}
