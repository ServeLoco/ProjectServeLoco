package com.yashsiwach.villkro

import android.os.Build
import android.os.Bundle
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

/**
 * Lock-screen-capable twin of MainActivity, reachable only via the rider
 * offer alarm notification's fullScreenAction/pressAction (never declared as
 * a LAUNCHER activity). Renders the separate "alarm" RN root (see index.js),
 * a minimal Accept/Reject + total card — not the full nav stack/Mapbox
 * screens "main" renders — so this stays fast to boot from a cold, locked
 * device the way an incoming call screen does.
 */
class AlarmActivity : ReactActivity() {
  companion object {
    /**
     * True while this full-screen card is on screen. The overlay card checks
     * this before drawing: the server re-pushes a pending offer every ~15s, and
     * once this activity has turned the screen on, a later push sees an
     * unlocked, screen-on device and would stack the floating card on top of
     * this one. JS-side dedupe cannot cover it — Android may deliver that push
     * to a separate headless JS context with its own module state — but this
     * flag lives in the process both paths share.
     */
    @Volatile
    @JvmStatic
    var isVisible: Boolean = false
      private set

    @Volatile
    private var instance: java.lang.ref.WeakReference<AlarmActivity>? = null

    /**
     * Close the card from anywhere — used when the offer it shows is resolved
     * on another surface (the in-app popup, the overlay card, a notification
     * action). Without this the card outlives the offer and still presents
     * Accept/Reject for something already rejected.
     */
    @JvmStatic
    fun closeIfShowing() {
      val activity = instance?.get() ?: return
      activity.runOnUiThread {
        if (!activity.isFinishing) {
          activity.finish()
        }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }
  }

  override fun onResume() {
    super.onResume()
    isVisible = true
    instance = java.lang.ref.WeakReference(this)
  }

  override fun onPause() {
    super.onPause()
    isVisible = false
  }

  override fun onDestroy() {
    super.onDestroy()
    isVisible = false
    if (instance?.get() === this) {
      instance = null
    }
  }

  override fun getMainComponentName(): String = "alarm"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled
      ) {}
    )
  }
}
