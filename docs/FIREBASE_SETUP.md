# Firebase setup — Grapejuice Pilot

**Project ID:** `grapejuice-pilot`  
**Console:** https://console.firebase.google.com/project/grapejuice-pilot/overview

## Done via CLI

- Firebase project created (display name: Grapejuice Pilot)
- Web app registered: `Grapejuice Pilot Web`
- `.env` populated with `EXPO_PUBLIC_FIREBASE_*` (see repo root `pilot-app/.env`)
- `firebase.json` + `firestore.rules` + `storage.rules` ready to deploy

## One manual step (Firestore)

Firestore API must be enabled once for new GCP projects:

1. Open https://console.firebase.google.com/project/grapejuice-pilot/firestore
2. Click **Create database** → production mode → region **nam5** (US)
3. Or enable the API: https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=grapejuice-pilot

Then from `pilot-app/`:

```bash
npm run firebase:deploy:rules
npm run seed:pilot-content
```

Firestore paths: `config/hanukkah-2026`, `content/hanukkah-2026/nights/{1-8}`.

## Rav (AI chat)

Deploy the `askPilotRav` callable after setting the Anthropic secret (copy from `untraditional-boxes` or commerce `grapejuice` if you use the same key):

```bash
cd pilot-app/functions
npm install
npm run build
cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY --project grapejuice-pilot
npm run firebase:deploy:functions
npm run firebase:deploy:rules   # includes users/{uid}/aiChats rules
```

Chat threads persist at `users/{uid}/aiChats/{threadId}`.

## Authentication

In Firebase Console → **Authentication** → **Sign-in method**:

- Enable **Email/Password**
- Enable **Google** and add the Web client ID to `.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

## Deploy rules (after Firestore exists)

```bash
cd pilot-app
npx firebase-tools deploy --only firestore:rules,storage --project grapejuice-pilot
```

## Seed Hanukkah content

```bash
npm run seed:pilot-content
```

Requires Application Default Credentials or service account:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=path/to/grapejuice-pilot-adminsdk.json
```

Download key: Console → Project settings → Service accounts → Generate new private key.
