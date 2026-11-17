/**
 * Placeholder Capacitor config (Step 7) — NOT wired up yet.
 *
 * This file exists so `docs/ANDROID.md` can show the real config that a
 * Capacitor wrapper would use. No native code is implemented: the
 * Capacitor packages are not installed, `npx cap` has never been run,
 * and this file is not imported by the Next.js app (it is a plain
 * object literal with no imports, so it type-checks standalone).
 *
 * To actually wrap RoutineSnap, follow docs/ANDROID.md.
 */
const config = {
  appId: "me.routinesnap.app",
  appName: "RoutineSnap",
  // With the recommended hosted approach (see docs/ANDROID.md), the app
  // loads the deployed site; webDir is only used for a static export.
  webDir: "out",
  backgroundColor: "#0A0A0F",
  server: {
    // Point at the deployed site so /api/extract keeps working.
    // Replace with the production URL before building the AAB.
    url: "https://routinesnap.example.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
