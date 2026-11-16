# Stock Inventory Ultimate Pro

## រចនាសម្ព័ន្ធឯកសារ
```
├── index.html            ← HTML (រចនាសម្ព័ន្ធទំព័រ)
├── css/style.css         ← CSS (Font, Theme, Animation)
├── js/
│   ├── tailwind-config.js  ← Tailwind config
│   ├── app.js              ← កូដ App ចម្បង (Stock, Scan, Province, Users, Telegram ...)
│   ├── features.js         ← Focus Barcode, Roles, Language toggle
│   ├── firebase-sync.js    ← Firebase Realtime Sync
│   └── register-sw.js      ← ចុះឈ្មោះ Service Worker
├── sw.js                 ← Service Worker (Offline)
├── manifest.json         ← PWA manifest
├── icon-192.png / icon-512.png
├── .nojekyll
└── .github/workflows/deploy.yml
```
> លំដាប់ `<script>` ក្នុង `index.html` សំខាន់ណាស់៖ `app.js` → `features.js` → `firebase-sync.js`។ កុំប្តូរលំដាប់។

ប្រព័ន្ធគ្រប់គ្រងស្តុក (Single-file HTML App) — ដំណើរការលើ GitHub Pages ដោយមិនចាំបាច់មាន Server។

## របៀបដាក់ឡើង GitHub Pages
1. បង្កើត Repository ថ្មីលើ GitHub (ឧ. `stock-inventory`)
2. Upload ឯកសារទាំងអស់ក្នុងថតនេះ (`index.html`, `.nojekyll`, `README.md`)
3. ចូល **Settings → Pages**
4. **Source**: Deploy from a branch → Branch: `main` / folder: `/ (root)` → Save
5. រង់ចាំ ១-២ នាទី ហើយបើក `https://USERNAME.github.io/stock-inventory/`

## Deploy ស្វ័យប្រវត្តិ (GitHub Actions)
ជំនួសជំហាន 3-4 ខាងលើ៖ **Settings → Pages → Source: GitHub Actions**។
ពេលនោះរាល់ពេល Push ទៅ `main` ប្រព័ន្ធនឹង Deploy ដោយខ្លួនឯង (មើលក្នុងផ្ទាំង **Actions**)។

## PWA (ដំឡើងលើទូរស័ព្ទ + Offline)
- Android (Chrome): ម៉ឺនុយ ⋮ → **Install app / Add to Home screen**
- iPhone (Safari): ប៊ូតុង Share → **Add to Home Screen**
- បើកដំបូងត្រូវមាន Internet ១ដង ដើម្បីរក្សាទុក Library ក្នុង Cache បន្ទាប់មកអាចបើក App Offline បាន។
- ពេលកែ `index.html` ហើយចង់ឱ្យអ្នកប្រើទទួលកំណែថ្មី សូមប្តូរ `VERSION` ក្នុង `sw.js` (ឧ. `stock-pro-v2`)។
- Firebase Sync / Telegram ត្រូវការ Internet។ Offline ទិន្នន័យរក្សាក្នុងម៉ាស៊ីន ហើយ Sync ពេលមាន Internet វិញ។

## ភ្ជាប់ Firebase (Realtime Sync)
1. Firebase Console → Build → **Authentication** → Sign-in method → បើក **Anonymous**
2. Authentication → Settings → **Authorized domains** → បន្ថែម `USERNAME.github.io`
3. Build → **Realtime Database** → បង្កើត Database
4. Project Settings → Your apps → Web → ចម្លង `firebaseConfig`
5. បើក App → Settings → **កំណត់ Firebase Config** → បិទភ្ជាប់ → រក្សាទុក

### Realtime Database Rules (សុវត្ថិភាពអប្បបរមា)
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## កំណត់សម្គាល់
- Camera / Barcode Scanner ត្រូវការ HTTPS — GitHub Pages មានស្រាប់។
- Config (Firebase, Telegram Token) រក្សាទុកក្នុង Browser (localStorage) មិនមែនក្នុង Repo ទេ។
- ប្តូរលេខសម្ងាត់ Admin លំនាំដើម (`8888`) ភ្លាមក្រោយ Deploy។
