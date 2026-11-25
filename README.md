# The System — a Solo Leveling style app for your phone

A web app (PWA) that installs on Android like a normal app and works offline. You are the Player: finish your Daily Quest before midnight, earn XP and gold, level up, spend stat points, climb from E-rank to S-rank, unlock titles, and face the Penalty Zone if you skip a day.

## Files

`index.html`, `styles.css`, `app.js` are the app. `sw.js` makes it work offline and sends background reminders. `manifest.webmanifest` and `icons/` let Android install it with its own icon.

## Put it on your phone (one time, about 5 minutes)

An installable app needs to be served over https, so host the folder for free on GitHub Pages:

1. Create a free account at github.com and make a new **public** repository, for example `system`.
2. Click "uploading an existing file" and drag in everything from this folder (including the `icons` folder). Commit.
3. Open the repository's **Settings → Pages**, set Source to "Deploy from a branch", branch `main`, folder `/ (root)`, and save.
4. After a minute your app is live at `https://<your-username>.github.io/system/`.
5. Open that link in **Chrome on your Android phone**, tap the ⋮ menu, then **Install app** (or "Add to Home screen").

It now opens full-screen from your home screen and works without internet.

Netlify Drop (app.netlify.com/drop) also works: drag the folder in and claim the site with a free account so it doesn't expire.

## Google Drive sync + Calendar reminders (one time, about 10 minutes)

Do this after the app is online (you need its address, e.g. `https://<your-username>.github.io/system/`).

1. Go to **console.cloud.google.com**, sign in with the Google account you'll use, and create a new project called `The System`.
2. Open **APIs & Services → Library**. Search for and **Enable** both **Google Drive API** and **Google Calendar API**.
3. Open **Google Auth Platform** (or "OAuth consent screen") and click **Get started**. App name `The System`, your email as support email, Audience **External**, your email as contact, then agree and **Create**.
4. In **Audience → Test users**, click **Add users** and add your own Gmail address. Leave the app in **Testing**. That's fine for personal use.
5. In **Clients**, click **Create client**: type **Web application**. Under **Authorized JavaScript origins** add `https://<your-username>.github.io` (no path, no slash at the end). Click **Create** and copy the **Client ID**.
6. On GitHub, open `config.js`, click the pencil icon, paste the Client ID between the quotes, and commit.
7. Open the app on your phone and close and reopen it once so it picks up the update. Then go to **Settings → Google Drive → Connect Google account**.
   - Google shows "Google hasn't verified this app". That's expected for your own app: tap **Continue**.
   - Tick **both** boxes (Drive app data and Calendar), then continue.

**On another device**: open the same link and tap **Continue my save from Google Drive** on the first screen.

**How syncing works**
- Your phone keeps the main copy, so the app stays fast and works offline.
- Every change is copied to a hidden app folder in your Google Drive (it doesn't clutter My Drive).
- Opening the app on another device pulls the newest copy first. A device that has just been opened never overwrites newer progress from another device.
- Google sign-in for web apps lasts about an hour. When it has expired, the top bar shows **Tap to sync**: tap it and it reconnects in a second. Claiming the Daily Quest reward reconnects automatically.
- If two devices both change things while offline, the newest save wins.

**Calendar reminders**: Settings → Reminders. Pick up to three times, then turn on **Google Calendar alerts**.
- The app adds one repeating "[Daily Quest] … pending" event to your Google Calendar, with alerts at your chosen times.
- When you claim the day's reward, that day's event is deleted, so you're only alerted on days the quest is still pending. Days you missed stay on the calendar as a record.
- Make sure notifications are on for the **Google Calendar** app on your phone.
- If you complete the quest while offline, the alert may still fire. It's cleared as soon as the app syncs.

## Your progress is safe if you…

- Keep using the **same link**. Progress is stored on the phone for that address; a different address starts a fresh save.
- Don't use Chrome's "Clear site data / Clear storage" for the app. Normal cache clearing is fine.
- Tap **Save backup file** (Settings → Backup) every week or so and keep it in Google Drive. **Restore from file** brings everything back on a new or reset phone. The Status screen reminds you when a backup is overdue.

The app also asks Android to mark its storage as persistent, and keeps a second copy of the previous save in case a write is ever interrupted.

## How the game works

- **Daily Quest**: your goals (default push-ups, sit-ups, squats, running; edit them in Settings). Finish all of them and claim the reward: XP, gold, streak +1, and a 30% chance of a Random Box.
- **Levels & rank**: each level gives 5 stat points. Rank E (1), D (10), C (20), B (35), A (50), S (75).
- **Side quests**: one-off tasks ranked E to S; harder ranks give more XP and gold.
- **Penalty**: if a day ends with the Daily Quest unfinished, you lose some XP, your streak resets (unless you own a Streak Shield), and the app locks into the Penalty Zone until you complete your Penalty Quest and hold the button.
- **Shop**: Random Box, Elixir of Growth (double XP), Streak Shield, Stat Crystal, plus real-life rewards you define yourself ("1 hour of gaming" for 150 gold).
- **Titles**: unlocked by streaks, ranks and achievements; equip one for an XP bonus.
- **Reminders**: pick up to three times in Settings. Google Calendar alerts are the reliable option (see above). "App notifications" only work while the app is running.

## Updating the app later

Change the files, upload them to the same repository, and bump `VERSION` in `sw.js` (e.g. `system-v3`). Your progress is kept.
