package com.yashsiwach.villkro

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * "Draw over other apps" card for a rider delivery offer arriving while
 * another app is in the foreground (screen on) — the one scenario a
 * full-screen Activity intent cannot interrupt (Android only auto-launches
 * those when the device is locked/off). Only fires when the rider has
 * granted SYSTEM_ALERT_WINDOW (opt-in — see requestPermission()); the
 * existing heads-up notification with inline Accept/Reject remains the
 * fallback either way.
 *
 * Deliberately plain native views, no embedded RN root — a WindowManager
 * overlay hosting a live RN surface is fragile under the New Architecture
 * and not worth the risk for a small summary card.
 */
class OverlayOfferModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private companion object {
    const val UNLOCK_POLL_MS = 500L
  }

  override fun getName() = "OverlayOfferCard"

  private var cardView: View? = null
  private var windowManager: WindowManager? = null
  private val handler = Handler(Looper.getMainLooper())
  private var tickRunnable: Runnable? = null

  // Our own activity being resumed is the one case this card must never
  // appear in — the app's own offer popup is already showing then. The JS
  // side gates on AppState too, but that check runs in whichever JS instance
  // handled the push (possibly Android's headless one, where it is not
  // reliable), so this is the authoritative check.
  private var hostResumed = false

  /**
   * An offer that arrived while the device was locked or the screen was off.
   * Nothing is drawn in that state — the alarm only rings and vibrates — so the
   * card is held here and presented the moment the rider unlocks the phone.
   */
  private data class PendingCard(
    val orderId: String?,
    val offerId: String?,
    val orderNumber: String?,
    val total: String?,
    val expiresAtMs: Long
  )

  private var pendingCard: PendingCard? = null
  private var unlockPoller: Runnable? = null

  /** The card currently on screen, so a re-show can inherit what it already knows. */
  private var shownCard: PendingCard? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  private fun isLockedOrScreenOff(): Boolean {
    val km = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val locked = km?.isKeyguardLocked ?: false
    val screenOn = pm?.isInteractive ?: true
    return locked || !screenOn
  }

  /**
   * Hold the card until the phone is genuinely unlocked and awake.
   *
   * Polls rather than listening for ACTION_USER_PRESENT: on a device with no
   * PIN or pattern that broadcast fires as soon as the screen turns on, while
   * the keyguard is still up — which would put the card on the lock screen,
   * the one place it must never appear. The keyguard state itself is the only
   * signal that means the same thing on every device and lock type.
   */
  private fun deferUntilUnlock(card: PendingCard) {
    pendingCard = card
    if (unlockPoller != null) return

    val poller = object : Runnable {
      override fun run() {
        val waiting = pendingCard
        if (waiting == null) {
          unlockPoller = null
          return
        }
        if (waiting.expiresAtMs > 0L && System.currentTimeMillis() >= waiting.expiresAtMs) {
          clearPending()
          return
        }
        if (!isLockedOrScreenOff()) {
          showPendingCard()
          return
        }
        handler.postDelayed(this, UNLOCK_POLL_MS)
      }
    }
    unlockPoller = poller
    handler.postDelayed(poller, UNLOCK_POLL_MS)
  }

  private fun clearPending() {
    pendingCard = null
    unlockPoller?.let { handler.removeCallbacks(it) }
    unlockPoller = null
  }

  private fun showPendingCard() {
    val card = pendingCard ?: return
    clearPending()
    // The rider may have taken long enough to unlock that the offer lapsed —
    // presenting Accept for something already expired would be worse than
    // showing nothing.
    if (card.expiresAtMs > 0L && System.currentTimeMillis() >= card.expiresAtMs) return
    try {
      showResolved(card)
    } catch (_: Exception) { /* cosmetic — never crash the alarm path */ }
  }

  override fun onHostResume() {
    hostResumed = true
    handler.post { hideInternal() }
  }

  override fun onHostPause() {
    hostResumed = false
  }

  override fun onHostDestroy() {
    hostResumed = false
    handler.post { hideInternal() }
  }

  override fun invalidate() {
    reactContext.removeLifecycleEventListener(this)
    handler.post { hideInternal() }
    super.invalidate()
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(reactContext)
    } else {
      true
    }
    promise.resolve(granted)
  }

  /**
   * True when the device is locked or the screen is off — i.e. the only state
   * where the full-screen alarm activity may take over the device. When the
   * screen is on and unlocked, an incoming offer must not yank the rider out
   * of whatever they are doing; the floating card is the alert instead.
   */
  @ReactMethod
  fun isScreenLockedOrOff(promise: Promise) {
    val km = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val locked = km?.isKeyguardLocked ?: false
    val screenOn = pm?.isInteractive ?: true
    promise.resolve(locked || !screenOn)
  }

  /**
   * True while one of the app's own activities is resumed — i.e. the rider is
   * looking at the app right now.
   *
   * The JS-side foreground check is an AsyncStorage heartbeat, which is both
   * coarse (a few seconds stale) and racy against the socket path that shows
   * the in-app popup. This is the real lifecycle state, and it reads the same
   * from Android's headless background-message JS instance, where AppState
   * cannot be trusted.
   */
  @ReactMethod
  fun isHostResumed(promise: Promise) {
    promise.resolve(hostResumed)
  }

  @ReactMethod
  fun requestPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + reactContext.packageName)
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
    }
  }

  @ReactMethod
  fun show(data: ReadableMap) {
    handler.post {
      try {
        showInternal(data)
      } catch (_: Exception) {
        // Never crash the alarm/ring path over a cosmetic overlay failure.
      }
    }
  }

  @ReactMethod
  fun hide() {
    handler.post { hideInternal() }
  }

  // Required by RN's NativeEventEmitter (used on the JS side to receive
  // OverlayOfferAction) even though emission here is push-only — without
  // these it logs an "addListener method" warning on every subscribe.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  private fun showInternal(data: ReadableMap) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
      return
    }
    // Our own app is on screen — its in-app offer popup owns this moment.
    if (hostResumed) {
      return
    }

    var card = PendingCard(
      orderId = if (data.hasKey("orderId")) data.getString("orderId") else null,
      offerId = if (data.hasKey("offerId")) data.getString("offerId") else null,
      orderNumber = if (data.hasKey("orderNumber")) data.getString("orderNumber") else null,
      total = if (data.hasKey("total")) data.getString("total") else null,
      expiresAtMs = if (data.hasKey("expiresAtMs")) data.getDouble("expiresAtMs").toLong() else 0L
    )

    // The same offer is announced by several paths (socket, FCM, a reminder
    // re-push) and each one re-draws this card. A path that did not carry the
    // price must not blank out a price already on screen — the rider sees it
    // vanish and come back, which reads as a glitch on a card they are about
    // to accept money from.
    val known = shownCard ?: pendingCard
    if (card.total.isNullOrEmpty() && known != null && known.offerId == card.offerId) {
      card = card.copy(
        total = known.total,
        orderNumber = if (card.orderNumber.isNullOrEmpty()) known.orderNumber else card.orderNumber
      )
    }

    // Locked or screen off: draw nothing. The offer announces itself by ringing
    // and vibrating, and the card waits for the rider to unlock — putting UI on
    // the lock screen is what we are deliberately avoiding here.
    if (isLockedOrScreenOff()) {
      deferUntilUnlock(card)
      return
    }

    showResolved(card)
  }

  private fun showResolved(card: PendingCard) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
      return
    }
    if (hostResumed) {
      return
    }
    hideInternal()

    val view = LayoutInflater.from(reactContext).inflate(R.layout.overlay_offer_card, null)

    val orderId = card.orderId
    val offerId = card.offerId

    view.findViewById<TextView>(R.id.overlay_order_number).text =
      if (card.orderNumber != null) "#" + card.orderNumber else ""
    view.findViewById<TextView>(R.id.overlay_total).text =
      if (!card.total.isNullOrEmpty()) "₹" + card.total else ""

    view.findViewById<TextView>(R.id.overlay_reject).setOnClickListener {
      emitAction("reject", orderId, offerId)
    }
    view.findViewById<TextView>(R.id.overlay_accept).setOnClickListener {
      emitAction("accept", orderId, offerId)
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    )
    params.gravity = Gravity.TOP

    val wm = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    wm.addView(view, params)
    cardView = view
    windowManager = wm

    shownCard = card

    if (card.expiresAtMs > 0L) {
      startTicking(card.expiresAtMs)
    }
  }

  private fun startTicking(expiresAtMs: Long) {
    stopTicking()
    val timerView = cardView?.findViewById<TextView>(R.id.overlay_timer) ?: return
    val runnable = object : Runnable {
      override fun run() {
        if (cardView == null) return
        val remainingSec = ((expiresAtMs - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
        val m = remainingSec / 60
        val s = remainingSec % 60
        timerView.text = String.format("%d:%02d", m, s)
        if (remainingSec > 0) {
          handler.postDelayed(this, 1000)
        } else {
          hideInternal()
        }
      }
    }
    tickRunnable = runnable
    handler.post(runnable)
  }

  private fun stopTicking() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
  }

  private fun hideInternal() {
    // Also drops a card waiting on unlock — otherwise an offer accepted,
    // rejected or expired while the phone was locked still pops up later.
    clearPending()
    stopTicking()
    shownCard = null
    val view = cardView ?: return
    try {
      windowManager?.removeViewImmediate(view)
    } catch (_: Exception) { /* already detached */ }
    cardView = null
    windowManager = null
  }

  private fun emitAction(action: String, orderId: String?, offerId: String?) {
    val map = Arguments.createMap()
    map.putString("action", action)
    if (orderId != null) map.putString("orderId", orderId)
    if (offerId != null) map.putString("offerId", offerId)
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("OverlayOfferAction", map)
    } catch (_: Exception) { /* JS context not ready — nothing to route the tap to */ }
    hideInternal()
  }
}
