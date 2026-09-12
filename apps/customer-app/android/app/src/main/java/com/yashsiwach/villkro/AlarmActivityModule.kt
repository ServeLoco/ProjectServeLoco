package com.yashsiwach.villkro

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Lets the "alarm" RN root (RiderAlarmScreen, rendered inside AlarmActivity
 * only) close its own activity after accept/reject — there is no RN
 * navigator/back-stack on this root to pop instead.
 */
class AlarmActivityModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AlarmActivityBridge"

  @ReactMethod
  fun finish() {
    reactContext.currentActivity?.finish()
  }

  /**
   * True while the full-screen alarm card is on screen, so the alert paths can
   * skip re-displaying anything for an offer it is already showing.
   */
  @ReactMethod
  fun isAlarmScreenVisible(promise: Promise) {
    promise.resolve(AlarmActivity.isVisible)
  }

  /** Close the full-screen card when its offer is resolved elsewhere. */
  @ReactMethod
  fun closeAlarmScreen() {
    AlarmActivity.closeIfShowing()
  }

  /**
   * Bring the full app to the front — only ever called after the rider
   * ACCEPTS an offer (from the lock-screen card or the floating overlay), so
   * they land on the delivery they just took. Rejecting must leave them
   * exactly where they were, so it never calls this.
   */
  @ReactMethod
  fun openMainApp() {
    try {
      val intent = reactContext.packageManager
        .getLaunchIntentForPackage(reactContext.packageName)
        ?: return
      // Reuse the existing task when the app is merely minimized, the same
      // way tapping the launcher icon would.
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      // Never crash the accept path over the convenience launch.
    }
  }
}
