# Android app via Capacitor

> **Status: docs only (final, Step 9).** No native code is implemented
> yet. The Capacitor packages are not installed, `npx cap` has never been
> run, and `capacitor.config.ts` at the repo root is a placeholder that
> shows the config a wrapper would use. Follow this guide when the
> Android app is actually built. The web app itself is complete (all 9
> steps: PWA, SEO, security headers, analytics, final QA — see the
> README), so the hosted approach below works against the finished site
> with no further web changes.

RoutineSnap is already installable as a PWA (see the PWA section in the
README). Wrapping it with [Capacitor](https://capacitorjs.com/) turns the
same web app into a native Android app (`.aab` for Google Play), which
adds a Play Store presence and native reminders via local notifications.

## 1. Decide how the app is served

RoutineSnap is a dynamic Next.js app: the scan page calls
`POST /api/extract`, which runs the vision AI on the server. A Capacitor
app can only serve static files from the device, so there are two options:

| Approach | How it works | Trade-off |
|---|---|---|
| **A. Hosted (recommended)** | The Capacitor app loads the deployed site (`server.url` in `capacitor.config.ts`). The web app and API stay on the server. | Needs an internet connection for scanning — same as the PWA. Full feature parity, no code changes. |
| **B. Static export** | `next.config.ts` gets `output: "export"`, the site is built to static files, and Capacitor serves them from `webDir: "out"`. | Works offline for the shell, but `/api/extract` cannot run on-device: scanning would need a separate hosted API URL, and middleware/i18n routing need rework. Only do this if offline scanning is a hard requirement. |

Use **A** unless there is a specific reason not to. The rest of this
guide assumes A.

## 2. Prerequisites

- Node.js 20+ and pnpm 10+ (same as the web app)
- [Android Studio](https://developer.android.com/studio) (Hedgehog or newer)
  with Android SDK 34+, and Java 17 (Android Studio bundles it)
- A deployed RoutineSnap site (Vercel or the user's own server) — set
  its URL as `server.url` in `capacitor.config.ts`
- A Google Play developer account ($25 one-time) for publishing

## 3. Install Capacitor

```bash
pnpm add @capacitor/core @capacitor/cli
pnpm add @capacitor/camera @capacitor/local-notifications
npx cap init "RoutineSnap" "me.routinesnap.app" --web-dir out
npx cap add android
```

`npx cap init` writes the real `capacitor.config.ts` (replacing the
placeholder). Set `server.url` to the deployed site URL.

## 4. Sync the web app

```bash
pnpm build        # builds the Next.js app
npx cap sync      # copies the web build + plugins into android/
```

Re-run `npx cap sync` after every web change that affects the app
(and after adding a plugin).

## 5. Camera (`@capacitor/camera`)

The scan page already accepts photos via `<input type="file">`, which
works in the Android WebView. The Camera plugin gives a native picker
and a better camera experience:

```ts
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

const photo = await Camera.getPhoto({
  quality: 90,
  allowEditing: false,
  resultType: CameraResultType.DataUrl,
  source: CameraSource.Camera, // or Photos, or Prompt to let the user choose
});
// photo.dataUrl is a data: URL — feed it into the existing image pipeline
// (src/lib/image.ts) exactly like a file-picker result.
```

Permissions: add `CAMERA` and `READ_MEDIA_IMAGES` to
`android/app/src/main/AndroidManifest.xml` (Capacitor's plugin docs list
the exact entries). On Android 13+ the user grants them at runtime.

## 6. Native reminders (`@capacitor/local-notifications`)

Web `.ics` reminders rely on the user's calendar app. In the native app,
schedule reminders directly from the extracted events so they fire even
without importing anything:

```ts
import { LocalNotifications } from "@capacitor/local-notifications";

// Android 13+ needs the POST_NOTIFICATIONS runtime permission first.
await LocalNotifications.requestPermissions();

await LocalNotifications.schedule({
  notifications: events.map((event, i) => ({
    title: event.title,
    body: `${event.startTime} · ${event.location ?? ""}`.trim(),
    id: i + 1,
    schedule: {
      // Fire `reminderMinutesBefore` ahead of the event start.
      at: new Date(eventStart.getTime() - event.reminderMinutesBefore * 60000),
      allowWhileIdle: true,
    },
    channelId: "routinesnap-reminders",
  })),
});
```

Notes:

- Create the `routinesnap-reminders` notification channel once at app
  start (`LocalNotifications.createChannel`), with vibration + sound.
- Weekly recurring events need one scheduled notification per occurrence
  (Android caps at 500 scheduled notifications per app — cap the
  recurrence window, e.g. 12 weeks, the same default as the web app).
- Times must be converted to the device's local timezone before
  scheduling; the scan page already collects the user's timezone.
- Cancelling: keep the notification `id`s alongside the saved scan in
  IndexedDB so a deleted scan can cancel its notifications.

## 7. Build an AAB

```bash
npx cap open android   # opens the project in Android Studio
```

In Android Studio: **Build → Generate Signed App Bundle / APK → Android
App Bundle → release**. Create an upload key (keep `upload-keystore.jks`
and its passwords safe — losing them means a new Play listing). Or from
the command line:

```bash
cd android && ./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

## 8. Play Store listing checklist

- [ ] App name: RoutineSnap; short description (80 chars) and full
      description mentioning photo → calendar, reminders, privacy-first
- [ ] Icon: 512×512 PNG (regenerate from `public/icons/icon.svg` with
      `pnpm icons`, or export the maskable variant)
- [ ] Feature graphic 1024×500, at least 2 phone screenshots (use the
      scan flow: upload → review → export)
- [ ] Privacy policy URL: the site's `/privacy` page
- [ ] Data safety form: no data collected — photos are processed in
      memory and discarded; history stays on-device (IndexedDB). The app
      itself collects nothing; the hosted API receives a photo only for
      the scan the user asked for.
- [ ] Content rating questionnaire (no user-generated content sharing)
- [ ] App category: Productivity; target audience: everyone
- [ ] Closed testing track first (internal testers), then production

## 9. What is NOT done yet

- No Capacitor packages installed, no `android/` folder, no native code
- No notification-channel or permission wiring in the web app — the web
  app's reminders are `.ics` VALARMs and Google Calendar links (each
  event can carry several reminders since Step 9)
- No Play Store account, keystore, or listing
- The hosted approach (A) still needs the production URL in
  `capacitor.config.ts` before the first build (it currently points at
  the `https://routinesnap.example.com` placeholder — remember to set
  `NEXT_PUBLIC_SITE_URL` to the same real domain when deploying the
  site, or canonicals and the sitemap will point at localhost)
