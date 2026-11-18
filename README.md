# فتيل · Fuse Crew

لعبة تعاونية لـ 3 لاعبين بتشتغل في المتصفح (موبايل أو PC) وبتتثبت على الشاشة الرئيسية زي أي تطبيق (PWA)، ومعاها مايك حقيقي جوه اللعبة.

## الأدوار

| الدور | بيشوف القنبلة | الكتيّب | بيسمع | بيتكلم | الإشارات | الأزرار |
|---|---|---|---|---|---|---|
| 🙈 الأعمى (Blind) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ بيقطع ويضغط |
| 🤐 الأخرس (Mute) | ❌ | ✅ | ✅ | ❌ | ✅ بيبعت | ❌ |
| 🙉 الأطرش (Deaf) | ✅ | ❌ | ❌ | ✅ | ✅ بيستقبل | ❌ |

الدائرة: الأطرش يوصّف القنبلة بصوته (الأخرس والأعمى بيسمعوا) ← الأخرس يدوّر في الكتيّب ويبعت الحل بالإشارات للأطرش ← الأطرش يقول للأعمى بصوته ← الأعمى ينفّذ. كل غلطة بتخصم 15 ثانية و3 غلطات = انفجار. الأدوار بتلف كل جولة والقواعد بتتغير كل جولة.

لو غيّرت توزيع الحواس، الجدول الوحيد اللي بيحكم كل حاجة (الواجهة والمايك) هو `CAPS` في `js/engine.js`.

## المايك جوه اللعبة

- كل لاعب يضغط "فعّل المايك والصوت" في الغرفة (المتصفح بيطلب إذن المايك).
- من أول الجولة اللعبة بتطبّق الحواس لوحدها: مايك الأخرس بيتقفل، وصوت الباقيين بيتكتم عند الأطرش. لما الجولة تخلص الكل بيتكلم ويسمع تاني.
- الصوت بيروح من جهاز لجهاز مباشرة (WebRTC)، وFirebase بيشيل المصافحة بس.
- بيحتاج HTTPS (GitHub Pages و Firebase Hosting بيدّوه تلقائي).
- لو لاعبين مش سامعين بعض (غالباً على داتا الموبايل أو واي فاي شركات) ضيف سيرفر TURN في `rtc-config.js`. الشات النصي موجود كبديل.

## 1) تجربة سريعة على جهازك (من غير Firebase)

```bash
python3 -m http.server 8000
```

افتح `http://localhost:8000` في 3 تبويبات من نفس المتصفح. ده "وضع تجريبي" بيستخدم localStorage. زرار "تدريب على موبايل واحد" بيشتغل لوحده بالأدوار التلاتة وبدون إنترنت (من غير صوت).

## 2) Firebase خطوة بخطوة

1. افتح console.firebase.google.com ← **Add project** ← اسم (مثلاً `fuse-crew`) ← Analytics اختياري ← **Create project**.
2. **Build ← Authentication ← Get started ← Sign-in method ← Anonymous ← Enable ← Save**.
3. **Build ← Realtime Database ← Create Database** ← اختار أقرب منطقة (مثلاً `europe-west1`) ← **Start in locked mode** ← Enable. انسخ رابط قاعدة البيانات اللي فوق (شكله `https://...firebasedatabase.app` أو `...firebaseio.com`).
4. تبويب **Rules** ← امسح اللي موجود والصق محتوى `database.rules.json` ← **Publish**.
5. **Project settings (علامة الترس) ← General ← Your apps ← أيقونة `</>` (Web)** ← اسم ← **Register app** (من غير Hosting) ← انسخ `firebaseConfig`.
6. افتح `firebase-config.js` وحط القيم (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`). لو `databaseURL` مش في الـ snippet خده من الخطوة 3. الـ config ده مش سري، الحماية في الـ Rules.
7. **Authentication ← Settings ← Authorized domains ← Add domain**: ضيف `USERNAME.github.io` (أو دومين Firebase Hosting). من غير الخطوة دي الدخول الخفي بيفشل.

## 3) GitHub خطوة بخطوة

1. github.com ← **New repository** ← اسم `fuse-crew` ← **Public** (GitHub Pages في الحساب المجاني محتاج repo عام) ← Create.
2. ارفع الملفات (كل المحتوى جوه فولدر `fuse-crew`، بما فيه `js/` و`icons/`):
   - من الموقع: **uploading an existing file** واسحب الملفات والفولدرات، ثم **Commit changes**.
   - أو من الترمنال:
     ```bash
     cd fuse-crew
     git init && git add . && git commit -m "Fuse Crew"
     git branch -M main
     git remote add origin https://github.com/USERNAME/fuse-crew.git
     git push -u origin main
     ```
3. **Settings ← Pages ← Source: Deploy from a branch ← Branch: `main` / `(root)` ← Save**. بعد دقيقة أو اتنين الرابط يظهر: `https://USERNAME.github.io/fuse-crew/`.
4. ضيف `USERNAME.github.io` في Firebase Authorized domains (خطوة 7 فوق).
5. افتح الرابط على موبايلين وجرّب.

**بديل: Firebase Hosting** (`firebase.json` جاهز): `npm i -g firebase-tools` ← `firebase login` ← `firebase init hosting` (اختار المجلد الحالي كـ public ومتكتبش فوق `index.html`) ← `firebase deploy`.

## 4) التثبيت على الموبايل

- **Android (Chrome):** زرار "ثبّت اللعبة" في الصفحة الرئيسية أو القائمة ⋮ ← Install app.
- **iPhone (Safari):** زرار المشاركة ← Add to Home Screen.

الاسم: **فتيل**، واللوجو في `icons/`.

## 5) بعد أي تعديل

غيّر `CACHE = 'fuse-v2'` في `sw.js` إلى `fuse-v3` وهكذا، عشان التليفونات تاخد النسخة الجديدة.

## ربط Claude بـ GitHub و Firebase

- **GitHub:** من claude.ai ← Settings ← Connectors ← GitHub ← Connect. بعدها في نفس المحادثة Claude يقدر يربط الـ repo بالجلسة (ويرفع عليه). لو الـ repo خاص ممكن تحتاج تدي Claude GitHub App صلاحية عليه.
- **Firebase:** مفيش connector جاهز لـ Firebase ظاهر. اعمل الخطوات اليدوية فوق، وابعت الـ `firebaseConfig` في المحادثة (مش سري) وClaude يحطه في `firebase-config.js`. متبعتش أبداً مفاتيح service account ولا توكن `firebase login`.

## هيكل الملفات

- `js/engine.js` — منطق اللعبة الصافي والأدوار (`CAPS`). متختبر بـ 1800 قنبلة.
- `js/voice.js` + `rtc-config.js` — المايك (WebRTC) وإعدادات STUN/TURN.
- `js/net.js` — Firebase، أو وضع تجريبي، أو وضع محلي في الذاكرة.
- `js/screens.js` / `js/ui.js` / `js/i18n.js` — الواجهة والرسم والصوت والنصوص (عربي/English).
- `js/app.js` — الحالة والغرف والأحداث.
- `sw.js`, `manifest.webmanifest`, `icons/` — الـ PWA.

## ملاحظات

- مفيش سيرفر خاص: كل جهاز بيبني نفس القنبلة من نفس الـ seed، والأعمى هو الوحيد اللي بيكتب حالة اللعبة أثناء الجولة.
- قواعد قاعدة البيانات مفتوحة لأي مستخدم مسجّل (مناسبة للعب مع الأصحاب). لو هتنشرها للعامة ضيف تنظيف للغرف القديمة وحدّ من الكتابة.
- الاسم والشخصيات واللوجو والقواعد تصميم أصلي، مش نسخ من لعبة BOMBANANA! الأصلية.
