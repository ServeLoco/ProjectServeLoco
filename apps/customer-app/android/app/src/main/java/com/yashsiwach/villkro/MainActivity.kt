package com.yashsiwach.villkro

import android.os.Build
import android.os.Bundle
import android.util.Log

import androidx.startup.AppInitializer
import androidx.startup.Initializer
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme BEFORE onCreate to support coloring the background,
    // status bar, and navigation bar. Theme.App.Main is AppTheme plus the
    // full-screen splash artwork as window background, so the artwork stays
    // on screen until the first React screen draws over it.
    setTheme(R.style.Theme_App_Main);
    startMapbox()
    super.onCreate(null)
  }

  /**
   * Mapbox's androidx.startup hook is removed in AndroidManifest.xml, so a
   * background push or headless task no longer loads the map engine on the
   * main thread. Start it here instead, once the user actually opens the app;
   * repeat calls are no-ops.
   *
   * Looked up by name because the SDK is a private (implementation)
   * dependency of @rnmapbox/maps; its own R8 rules keep com.mapbox.maps.**
   * whole. If this ever fails, Mapbox still starts itself on the first map call.
   */
  @Suppress("UNCHECKED_CAST")
  private fun startMapbox() {
    try {
      val initializer = Class.forName("com.mapbox.maps.loader.MapboxMapsInitializer")
          as Class<out Initializer<Any>>
      AppInitializer.getInstance(applicationContext).initializeComponent(initializer)
    } catch (e: Throwable) {
      Log.w("MainActivity", "Mapbox not started up front; it will start on the first map", e)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
