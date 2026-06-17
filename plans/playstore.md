# VillKro — Google Play Store Checklist (TO DO)

Owner: Yash Siwach  |  Brand: **VillKro**  |  Account: Individual (PAN + Aadhaar)  |  Email: decodelabsofficial@gmail.com  |  Location: Gorakhpur, Haryana 125047, India  |  API: https://api.serveloco.app/api  |  Instagram: @villkro  |  Domain serveloco.app is the web/backend domain, NOT the app name

Re-audited 2026-06-17. Code-side changes are done. Icon assets (section A) are in place after a one-time resize of files you downloaded. Policies (section B) are served by the API at /policies/*. Remaining: Play Console account, identity verification, AAB build, listing, closed testing.

Estimated calendar time after this point: **13–16 days**. The closed-testing window is the longest gate, so start it on the same day you pay the $25 fee.

---

## A. Adaptive icon set (DONE 2026-06-17)

All 5 PNGs resized and placed in `apps/customer-app/assets/icon/`:

| File | Dimensions | Size |
|---|---|---|
| icon.png | 1024 x 1024 | ~1.0 MB |
| adaptive-icon-foreground.png | 1024 x 1024 | ~1.1 MB |
| adaptive-icon-background.png | 1024 x 1024 | ~0.8 MB |
| splash.png | 1284 x 2778 | ~2.4 MB |
| favicon.png | 48 x 48 | 3 KB |

Notes for later (not blockers for first publish):
- `adaptive-icon-foreground.png` is opaque (no alpha channel), so launcher icons will render as a square rather than a rounded mask. Fine for Play Store submission; redo later in Figma for a better look.
- File sizes are larger than ideal; consider re-exporting with PNG compression later.

---

## B. Policy HTML files (DONE 2026-06-17)

You chose to host the policies on the existing API rather than Cloudflare Pages, so the three HTML files live in the API source tree at `apps/api/public/policies/` and are served by Express at `/policies/*`.

What was done:
- `apps/api/public/policies/privacy.html` written with VillKro branding, decodelabsofficial@gmail.com, Gorakhpur Haryana 125047
- `apps/api/public/policies/terms.html` written with same details, jurisdiction = courts of Gorakhpur Haryana
- `apps/api/public/policies/index.html` written with VillKro landing + Instagram/contact links
- `apps/api/src/app.js` mounts `express.static('..', 'public', 'policies')` before the `/api` routes
- `apps/customer-app/src/screens/customer/ProfileScreen/ProfileScreen.js` `POLICY_URLS` updated to `https://api.serveloco.app/policies/privacy` and `/terms`

What was done (DONE 2026-06-17):
- [x] **Committed and pushed** the `extensions: ['html']` fix to `app.js`
- [x] **SSH + git pull + rebuild** completed on the Lightsail VM
- [x] `https://api.serveloco.app/policies/privacy` → **HTTP/2 200** ✅
- [x] `https://api.serveloco.app/policies/terms` → **HTTP/2 200** ✅

---

## C. Pay the $25 Play Console fee (Day 0 — do it FIRST)

Until you do this, nothing else in Play Console exists.

- [ ] **Get the right card ready**: a Visa, Mastercard, or American Express with **international e-commerce enabled**. Call your bank's app or phone banking and ask them to "enable international transactions". **UPI, RuPay, Virtual Credit Cards, and wire transfers will be rejected.** The charge is $25 USD ≈ ₹2,100.
- [ ] **Open Play Console**: go to `https://play.google.com/console` in Chrome.
- [ ] **Sign in** with the Google account you want to own the developer account.
- [ ] Click **Get started** (or **Create developer account**) under "Get started with Play Console".
- [ ] Fill in the developer profile:
  - **Developer name**: type `Yash Siwach` (this is what shows next to your app on the store).
  - **Email**: `decodelabsofficial@gmail.com` (or your personal email if you do not own the domain yet).
  - **Phone number**: your mobile.
  - **Country**: India.
- [ ] Accept the distribution agreement → click **Pay registration fee** → enter the card details → submit. The page should reload to "Welcome to Play Console" within 30 seconds.

---

## D. Verify your identity (Day 0, takes 24–48 hours after submission)

- [ ] In Play Console left sidebar → **Settings** → **Developer account**.
- [ ] Under **Identity verification**, click **Verify identity** → choose **Individual**.
- [ ] **ID document** upload: scan or photograph your **PAN card** (front, full card, no glare or cropping). Aadhaar / Indian passport / driving licence / Voter ID also work.
- [ ] **Address proof** upload: a recent utility bill (electricity / gas / water — under 3 months old) **or** a bank statement with your name and address. PDF or photo, under 5 MB.
- [ ] Click **Submit**. Google emails you within 24–48 hours either **Approved** (you can publish) or **Needs more info** (they tell you exactly which document to re-shoot).

> **Tip**: photograph documents in daylight, no flash, full card in frame, no shadows. A blurry PAN is the most common rejection reason.

---

## E. Build the AAB file (Day 2)

This produces the actual `.aab` (Android App Bundle) you will upload to Play Console.

- [ ] **Install Node.js 20 LTS**: download from `https://nodejs.org/` (the left button, "Recommended For Most Users") → run the installer with default settings → restart the terminal.
- [ ] **Install EAS CLI**: open **PowerShell** (Win + X → "Windows PowerShell") and run:
  ```
  npm install -g eas-cli
  ```
- [ ] **Log in to Expo**: in the same PowerShell window run:
  ```
  npx eas login
  ```
  Enter the same Google-account email you used for Play Console, and the password for your Expo account (it will offer to create one if you do not have it).
- [ ] **Move into the app folder**:
  ```
  cd "C:\Users\yashs\Videos\ProjectServeLoco\apps\customer-app"
  ```
- [ ] **Set up Play App Signing**:
  ```
  npx eas credentials --platform android
  ```
  When prompted, choose `production`, then choose `Let EAS generate the keystore`. EAS will print an **upload key password** at the end — **copy it into Bitwarden / 1Password / KeePass right now**. You cannot retrieve it later, and you need it for every future update.
- [ ] **Build the production AAB**:
  ```
  npx eas build --platform android --profile production
  ```
  This takes 10–20 minutes. When it finishes, the terminal prints a green "Build finished" with a download URL. Click the URL to download `app-release.aab` (around 30–60 MB) — save it to your Desktop.

---

## F. Create the Play Console app entry (Day 2)

- [ ] In Play Console, click **Create app** (top right).
- [ ] Fill in:
  - **App name**: `VillKro`
  - **Default language**: English (United States)
  - **App or game**: App
  - **Free or paid**: Free
- [ ] Accept the developer programme policies → click **Create app**.

Now fill in every tab on the left sidebar. None of these are optional:

### App content

- [ ] **Privacy policy** → paste `https://api.serveloco.app/policies/privacy` (policies are served by the API, NOT the marketing domain — see section B).
- [ ] **App access** → choose **"All or some functionality is restricted"** → click **Add instructions** → fill in test credentials: Phone: `9999999999`, Password: `TestUser@1` (create this account on the production API first so Play's reviewers can log in and test). Without this, reviewers hit the login screen, can't proceed, and reject for Broken Functionality.
- [ ] **Ads** → select "No, my app does not contain ads".
- [ ] **Content rating** → click **Start questionnaire** → Category = "Utility" or "Shopping" → answer all questions honestly (no violence, no user-generated content) → click **Save** → **Submit**.
- [ ] **Target audience** → pick "18 and over" (simplest; pick 13–17 if you want minors to install).
- [ ] **News apps** → "No, this is not a news app".
- [ ] **Data safety** → click **Start** → answer "Yes" to "Does your app collect or share required user data?" → walk through each data type and mark what you actually collect. **You must mark Yes on**: phone number, name, approximate location, in-app messages (push notifications). **You must declare**: device push token, order history. Set every other row to "No". When asked about data sharing, the answer is **"No, this data is not shared with third parties"** for all rows — except push tokens, where the answer is **"Yes, shared with Expo / Google FCM"**. Save.
- [ ] **Government apps** → "No".
- [ ] **Financial features** → "No".
- [ ] **Health apps** → "No".

### Store settings

- [ ] **App details**:
  - **App name**: `VillKro` (matches `expo.name`).
  - **Short description** (80 chars max): `Local marketplace for fast, reliable home delivery in your village.`
  - **Full description** (4000 chars max): 3–4 paragraphs about the app, written in plain language. No emoji. Mention order placement, vendor selection, push notifications, in-app profile.
  - **App icon**: upload the 512 × 512 PNG (resize your 1024 master in Figma if you have not already — File → Export → PNG → set W/H to 512 → export).
  - **Feature graphic**: 1024 × 500 PNG. In Figma, make a 1024 × 500 frame, place the logo on the left half, put text on the right half like "Order from local shops. Delivered to your door." Export as `feature-graphic.png` and upload.
  - **Screenshots**: minimum 2 phone screenshots (1080 × 1920). Take 6: Home, Category list, Product detail, Cart, Checkout, Order tracking. In Figma make 1080 × 1920 frames, drop in your phone screenshots (run the app on your phone in dev mode, take screenshots with the side button + volume up). Drag the 6 PNGs into the upload box.
  - **Tablet screenshots**: minimum 4 at 1200 × 1920 (7-inch) and 4 at 1920 × 1200 (10-inch). You can scale up your phone screenshots in Figma for the 7-inch version. For the 10-inch, redo the layout with the brand colour sidebar.
- [ ] **Categorisation**: Application type = "Application", Category = "Shopping", Tags = "shopping, delivery, marketplace".
- [ ] **Contact details**: email `decodelabsofficial@gmail.com`, phone optional.
- [ ] **External marketing** → "No".

### Release

- [ ] Click **Production** → **Create new release**.
- [ ] Click **Upload** → drag in the `app-release.aab` you downloaded in step E.
- [ ] **Release name**: `1.0.0` (auto-fills).
- [ ] **Release notes** (500 chars): `First public release of VillKro — order from local shops, track delivery in real time.`
- [ ] Click **Save** → **Review release** → if everything is green, click **Start rollout to Production** (it will start as "Managed roll-out at 1%" — that is fine, you can ramp to 100% after 24 hours).

---

## G. Closed testing — 12 testers, 14 days (Day 0 → Day 14)

This is the gate you cannot shorten. Start it the same day you pay the $25 fee in step C.

- [ ] In Play Console left sidebar → **Testing** → **Closed testing**.
- [ ] Click **Create track** → name it `closed-testing` → click **Create track**.
- [ ] **Add testers**: in the left sub-menu click **Testers** tab → click **Create email list** → name it `VillKro internal` → paste the Gmail addresses of **12 different people** (yourself, friends, family, neighbours — each must be a real Google account they can install from). Save.
- [ ] **Add a release to the track**: click **Closed testing** in the sub-menu → **Create new release** → upload the same `app-release.aab` from step E → add release notes → **Review release** → **Start rollout to Closed testing**.
- [ ] **Send testers the opt-in link**: in the **Testers** tab, copy the **opt-in URL**. Send it to all 12 testers in a WhatsApp group. They must click the link, accept, and install the app from the Play Store.
- [ ] **Testers must open the app once per day for 14 days** (or Play Console counts "inactive days"). Tell them: "Open the app, place a test order, leave it open for 30 seconds." Send a daily reminder on WhatsApp.
- [ ] **Day 14**: in Play Console → **Testing** → **Closed testing** → **Dashboard**, you should see green checkmarks for the per-day tester count. If yes, you can promote the same AAB to Production (step F).

> **Why 14 days**: Google uses this window to detect abusive accounts. A new developer account that publishes a high-traffic app with zero testing history is flagged.

---

## H. After the 14-day window — promote to production

- [ ] In Play Console → **Testing** → **Closed testing** → click the **Promote release** button next to your uploaded AAB → choose **Production** → confirm.
- [ ] In Play Console → **Release** → **Production**, find the new release → click **Review release** → **Start rollout to Production** at 1%.
- [ ] Wait 24 hours with no crash reports, then return to the same page and **Update rollout** → **100%**.

---

## I. Day-of-launch smoke test

- [ ] Install the app on a fresh phone (or factory-reset yours) → open the Play Store → search `VillKro` → install.
- [ ] Register a new account → place a real test order → confirm push notification fires.
- [ ] Open `https://play.google.com/store/apps/details?id=com.yashsiwach.villkro` from a desktop browser and confirm the listing, icon, screenshots, and Data Safety form all render correctly.
- [ ] Check Play Console → **Vitals** → **Crashes** the next morning. Anything above 1% crash-free users is a stop-the-line.

---

## X. Privacy template (NO LONGER NEEDED — policies are served by the API at /policies/privacy; see section B)

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ServeLoco Privacy Policy</title></head><body>
<h1>Privacy Policy</h1>
<p>Last updated: 2026-06-17</p>

<h2>1. Who we are</h2>
<p>VillKro is a hyperlocal marketplace operated by Yash Siwach, based in Gorakhpur, Haryana 125047, India. Contact: decodelabsofficial@gmail.com.</p>

<h2>2. Data we collect</h2>
<ul>
  <li>Account: name, phone, hashed password, optional WhatsApp number.</li>
  <li>Delivery addresses you save.</li>
  <li>Approximate location (city / pin code) during checkout, foreground only.</li>
  <li>Expo push token for order status notifications.</li>
  <li>Order history: items, vendor, status, timestamps.</li>
</ul>

<h2>3. Why</h2>
<p>Account management, order delivery, push notifications, fraud prevention.</p>

<h2>4. Third parties</h2>
<ul>
  <li>MySQL database (hosted on Azure) — account, addresses, orders.</li>
  <li>AWS S3 — product photos uploaded by vendors.</li>
  <li>Cloudflare — website hosting.</li>
  <li>Expo / Google FCM — push notifications (receives device push token).</li>
</ul>
<p>We do not sell your data. We do not share with advertisers.</p>

<h2>5. Retention</h2>
<p>Active account + 30 days after deletion.</p>

<h2>6. Your rights</h2>
<ul>
  <li>Access: email decodelabsofficial@gmail.com</li>
  <li>Correction: in the app, Profile &rarr; Edit Profile</li>
  <li>Deletion: in the app, Profile &rarr; Delete Account (immediate soft-delete, purged in 30 days)</li>
  <li>Withdraw consent: uninstall the app and email us</li>
</ul>

<h2>7. Children</h2>
<p>13+ only. We do not knowingly collect data from anyone under 13.</p>

<h2>8. Security</h2>
<p>HTTPS everywhere, bcrypt-hashed passwords, restricted production keys.</p>

<h2>9. Changes</h2>
<p>The "Last updated" date at the top will change when this policy changes. Material changes will also be shown inside the app.</p>
</body></html>
```

---

## Y. Terms template (NO LONGER NEEDED — policies are served by the API at /policies/terms; see section B)

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ServeLoco Terms</title></head><body>
<h1>Terms of Service</h1>
<p>Last updated: 2026-06-17</p>

<h2>1. Acceptance</h2>
<p>By using ServeLoco you agree to these terms.</p>

<h2>2. Service</h2>
<p>ServeLoco is a marketplace connecting customers with local vendors. We are not a party to the sale between you and the vendor.</p>

<h2>3. Accounts</h2>
<p>One account per person. You must use a valid Indian phone number. You are responsible for all orders placed under your account.</p>

<h2>4. Orders and payment</h2>
<p>Payment is cash on delivery unless the listing states otherwise. Prices are set by the vendors.</p>

<h2>5. Cancellation and refunds</h2>
<p>You can cancel until the vendor accepts the order. For quality issues, email decodelabsofficial@gmail.com within 24 hours of delivery.</p>

<h2>6. Prohibited use</h2>
<p>No fraud, abuse of vendors, or attempts to bypass our rate limits.</p>

<h2>7. Termination</h2>
<p>We may suspend accounts that violate these terms. You may close your account at any time via Profile &rarr; Delete Account.</p>

<h2>8. Disclaimers</h2>
<p>The service is provided "as is" without warranties of any kind.</p>

<h2>9. Governing law</h2>
<p>Laws of India apply. Jurisdiction: courts of [your city].</p>

<h2>10. Contact</h2>
<p>decodelabsofficial@gmail.com</p>
</body></html>
```

> **Action required**: open the saved `terms.html` in Notepad and replace `[your city]` with the city your courts fall under (e.g. `Gurugram`, `Bengaluru`, `Mumbai`).

---

## Z. Index template (NO LONGER NEEDED — index served by the API at /policies/; see section B)

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>ServeLoco</title></head><body>
<h1>ServeLoco</h1>
<p>Local marketplace for fast home delivery.</p>
<p><a href="/privacy">Privacy Policy</a></p>
<p><a href="/terms">Terms of Service</a></p>
</body></html>
```

---

## Quick reference — paths you will touch

- `C:\serveLoco-policies\` — new folder you create
- `C:\serveLoco-policies\privacy.html`
- `C:\serveLoco-policies\terms.html`
- `C:\serveLoco-policies\index.html`
- `C:\Users\yashs\Videos\ProjectServeLoco\apps\customer-app\assets\icon\` — new folder
- 5 PNGs inside that folder (see section A)
- PowerShell commands to build the AAB (see section E)
- `app-release.aab` — the build output you download and upload to Play Console
