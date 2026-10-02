# إعداد Firestore — Revtrove

## الملفات التي أُنشئت
- client/src/lib/firebase.js: إنشاء التطبيق وتصدير db.
- client/src/lib/firebase-config.mjs: قراءة المتغيرات والتحقق من اكتمالها.
- client/.env.local: متغيرات فارغة، ملف محلي مستبعد من Git.
- scripts/check-firestore.mjs: اختبار اتصال قراءة فقط.
- firestore.rules وfirebase.json: إعداد القواعد، لم تنشر تلقائيًا.
- shared/catalog-additions.mjs: تعريف أربعة منتجات جديدة وصور BMW والنصوص الأساسية والأسعار غير المحددة.
- shared/animation.mjs: حماية حساب مسار السيارة من فهرس سالب.
- server/src/sync-catalog.js: إضافة المنتجات دون تغيير الموجود.
- tests/firebase.test.mjs: خمسة اختبارات محلية.
- FIREBASE_SETUP.md: هذا التقرير.
- 15 صورة في client/public/assets: أربع BMW وأربع Audi Black وثلاث Audi Mesh وصورة Ferrari وثلاث SEAT CUPRA. الملفات الأصلية في ui لم تُمس.

## الملفات التي عُدلت
- client/src/App.jsx: عرض المنتجات والتخصيص والأسعار؛ تصحيح حركة السيارة، اللغة غير الصالحة المخزنة، المنتج غير الموجود، إعادة ضبط خيارات المنتج، اسم لون القرص، والتعامل مع فشل تحميل الطلبات/حجب نافذة واتساب.
- server/src/index.js: النصوص الأساسية الجديدة، مسار التأكيد للمنتجات بلا سعر، وإتاحة اتصال Firestore في CSP فقط.
- client/.env.example: إضافة متغيرات Firebase مع إبقاء متغير Google Maps.
- client/package.json: إضافة firebase لاعتمادات الواجهة.
- package.json: أوامر test وfirebase:check وcatalog:sync، وتطبيق إضافة الكتالوج بعد db:init.
- package-lock.json: اعتماد Firebase وتحديثات أمنية متوافقة.
- .gitignore: تجاهل .env.local وملفات الطباعة المحتوية على تفاصيل الزبائن.
كانت هناك تعديلات سابقة من المستخدم في المشروع؛ لم تُحذف أو تُرجع.

## ما الذي يعمل الآن؟
المشروع JavaScript: React + Vite في client وخادم Express/Node.js في server.
أضيف Firebase Web SDK وإعداد initializeApp/getFirestore وتصدير db من client/src/lib/firebase.js.
عند غياب الإعداد الحقيقي تكون db=null، ولا يتعطل الموقع ولا تُرسل طلبات إلى مشروع وهمي.
لم تُنقل البيانات إلى Firestore: المنتجات والطلبات وحساب المدير ما زالت في MySQL.
قائمة fallbackProducts في App.jsx احتياطية، وتوجد صور في ui وclient/public/assets، وملفات رفع في server/uploads.
localStorage يحفظ اللغة وإعدادات إمكانية الوصول؛ sessionStorage يحفظ رمز جلسة المدير.
print-queue يحتوي ملفات الطباعة. لم تُحذف هذه البيانات أو تُنقل.

## ملف البيئة
أضف قيم firebaseConfig الحقيقية إلى client/.env.local مع إبقاء متغيرات Google Maps الموجودة إن وجدت:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

تم تجهيز client/.env.local بمتغيرات فارغة إن لم يكن موجودًا. القيم VITE_ تظهر في حزمة الواجهة بطبيعتها؛ ليست بديلًا عن قواعد الأمان.
لا تضع service-account JSON أو مفتاحًا خاصًا أو كلمة مرور MySQL في أي VITE_ متغير.
أعد تشغيل Vite بعد تعبئة الملف. الإنتاج يحتاج هذه المتغيرات أثناء npm run build.

## Firebase Console
1. اختر مشروعك الحقيقي، ثم Project settings > Your apps وأضف Web app للحصول على firebaseConfig.
2. أنشئ Cloud Firestore في Production mode واختر المنطقة المناسبة قبل إنشاء القاعدة.
3. انشر محتوى firestore.rules في تبويب Rules. لم يُنشر أي إعداد تلقائيًا.
4. أنشئ collection اسمها health ومستند connection بحقل ok من نوع boolean قيمته true. لا تضف بيانات شخصية لهذا المستند.
5. نفّذ npm run firebase:check. الاختبار يقرأ هذا المستند من الخادم فقط، ولا ينشئ أو يعدّل أو يحذف شيئًا. ينتهي بخطأ واضح بعد 10 ثوانٍ إذا تعذر الاتصال.

## الأمان وطريقة الربط المستقبلية
القواعد الحالية تسمح فقط بقراءة مستند التحقق المحدد، وقراءة منتجات active=true؛ جميع عمليات الكتابة وقراءة الطلبات وحسابات المدير ممنوعة من الواجهة.
استعلام المنتجات مستقبلًا يجب أن يتضمن where('active','==',true)، لأن Rules ليست مرشحًا للنتائج.
الموقع يستخدم JWT للمدير، وليس Firebase Authentication. لذا لا يجوز جعل الطلبات متاحة للواجهة اعتمادًا على هذا JWT.
لنقل التشغيل إلى Firestore يلزم مسار backend باستخدام Firebase Admin SDK وIAM/حساب خدمة على الخادم، مع الإبقاء على تحقق المدير والتحقق من بيانات الطلب؛ أو تنفيذ Firebase Auth وصلاحية admin عبر custom claims موثوقة من الخادم.
قواعد Admin SDK لا تطبق على عمليات الخادم؛ IAM والتحقق في Express مسؤولان عن حمايتها. لا تضف مفاتيح Admin إلى client.
لا تنقل MySQL أو تحذفها قبل مراجعة خطة النقل والنسخ الاحتياطي والموافقة عليها.

## المنتجات الجديدة
تم تقسيم صور Audi إلى Audi RS3 Black وAudi RS3 Mesh، وإضافة Ferrari وSEAT CUPRA وصور BMW الجديدة.
لم يتم اختراع أسعار أو ملفات 360° لهذه المنتجات. السعر غير المحدد يعرض «السعر عند التأكيد»، وطلبه يدخل مسار عرض السعر والتأكيد بدل اعتباره جاهزًا للعمل بسعر صفر.
npm run catalog:sync يضيف المنتجات غير الموجودة ويضم صور BMW الجديدة، دون تغيير أسعار أو بيانات المنتجات الموجودة. يمكن تكراره دون تكرار المنتجات.

## أوامر التحقق
```
npm install
npm run catalog:sync
npm test
npm run build
npm run firebase:check
```

المراجع: https://firebase.google.com/docs/web/setup و https://firebase.google.com/docs/firestore/security/rules-query

## نتيجة الفحص المحلي
نجح npm install وnpm run build والاختبارات الخمسة. فحص الاتصال توقف لغياب قيم Firebase، ولم يرسل طلبًا أو يكتب بيانات.
تعذر catalog:sync لأن MySQL على 127.0.0.1:3306 غير شغال، وDocker daemon غير شغال أيضًا. الصور والمنتجات ظاهرة عبر القائمة الاحتياطية؛ يلزم تشغيل قاعدة MySQL الحالية ثم تشغيل catalog:sync حتى تستقبل طلبات المنتجات الجديدة بمعرفات قاعدة البيانات الحقيقية. لا تشغل db:init على قاعدة جديدة بدلاً من قاعدتك الموجودة إلا إن كنت تريد تهيئة قاعدة جديدة.
npm audit fix أصلح التنبيهات القابلة للإصلاح دون تحديث رئيسي. تبقى أربع إشارات high مترابطة من @grpc/grpc-js الذي يثبته Firebase لخدمة Node.js. لم يتم فرض override خارج نطاق الاعتماد أو تخفيض Firebase إلى إصدار رئيسي قديم. تحتاج معالجة تحديثًا متوافقًا من Firebase/اختبار اعتماد مصحح قبل الاستخدام الإنتاجي لاختبار Node؛ هذه ليست أربع ثغرات مستقلة في واجهة الموقع.
تحذير البناء: الحزمة الرئيسية أكبر من 500KB؛ لم يتم تغيير هيكل تحميل العرض الثلاثي الأبعاد ضمن هذه المهمة.
