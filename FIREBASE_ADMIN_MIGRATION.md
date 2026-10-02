# Firestore — إعداد الخادم وخطة النقل الآمنة

## الحالة الفعلية (2 أكتوبر 2026)
- JavaScript، واجهة React + Vite، خادم Node.js + Express، npm workspaces.
- Vite قرأ متغيرات Firebase الستة كاملة دون عرض القيم. client/.env.local مستبعد من Git وغير متتبع.
- Firebase Client مهيأ باستخدام initializeApp/getFirestore وتصدير db، مع منع تهيئة التطبيق مرتين. لا يعني ذلك نجاح الاتصال.
- اختبار القراءة الفعلية أظهر Cloud Firestore API غير مستخدمة أو معطلة للمشروع المحدد. لم تنجح قراءة الخادم حتى الآن.
- Firebase Admin SDK مثبت في server فقط، لا في client. اختبار Admin توقف قبل الاتصال لغياب FIREBASE_PROJECT_ID وFIREBASE_CLIENT_EMAIL وFIREBASE_PRIVATE_KEY.
- لم يتم تشغيل النسخ الاحتياطي أو migration أو تغيير API/الواجهة أو تخزين MySQL.

## متغيرات الخادم المطلوبة
ضع في ملف .env الموجود في جذر المشروع (أو مدير أسرار بيئة استضافة الخادم):

```dotenv
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

القيم من اعتماد service account حقيقي: project_id وclient_email وprivate_key. لا تستخدم قيم VITE_ في الخادم، ولا تنسخ الملف الخاص إلى frontend، ولا تلصق مفتاحه في المحادثة.
لـdotenv ضع قيمة المفتاح بين علامتي اقتباس مزدوجتين واحتفظ بـ\n الموجودة فيه؛ الكود يحول \n و\r\n المكتوبة كنص إلى أسطر حقيقية ويتحقق محليًا من PEM RSA. يقبل الأسطر الحقيقية كذلك.
يقرأ الخادم .env فقط. لا يقرأ client/.env.local ولا يخمّن projectId. لا تنشر هذه القيم أو النسخة الاحتياطية في GitHub.
في الاستضافة استخدم مدير أسرار وصلاحية خدمة محدودة؛ تحميل JSON من Console مناسب للإعداد المحلي لكنه مفتاح طويل الأجل حساس. IAM الأنسب لخدمة هذا الخادم هو الوصول المطلوب إلى Firestore فقط، وليس Owner.

## Firebase Console — الخطوة المطلوبة الآن
1. اختر نفس المشروع الخاص بإعداد الواجهة، ثم Build > Firestore Database > Create database (إن لم تُنشأ)، واختر المنطقة وProduction mode. تحقق كذلك أن Cloud Firestore API مفعلة في Google Cloud > APIs & Services.
2. Project settings > Service accounts > Firebase Admin SDK: احصل بنفسك على اعتماد خدمة، واملأ متغيرات الخادم الثلاثة محليًا. لا ترسل JSON أو private_key في المحادثة.
3. انشر firestore.rules الحالية. تمنع كتابة المتصفح وقراءة orders/adminUsers؛ القراءة العامة مقتصرة على منتجات active=true ومستند health/connection.
4. اختبار Client الحالي يحتاج مستند health/connection بحقل boolean ok=true، خالٍ من البيانات الشخصية. اختبار Admin يقرأ نفس المسار فقط، وينجح حتى لو لم يوجد المستند لأنه يتحقق من اتصال الخادم الموثق؛ لا يكتب أي مستند اختبار ولا يترك بيانات جديدة.
5. شغّل npm run firebase:admin:check وnpm run firebase:check بعد الإعداد. لا يشغّل أي منهما migration.

Admin SDK يتجاوز Firestore Rules، لذلك حماية حسابات المدير والطلبات مسؤولية صلاحيات IAM ومصادقة JWT والتحقق داخل Express. قواعد المتصفح لا توفر حماية لخادم يحمل اعتماد خدمة. أبقِ المصادقة الحالية على الـAPI، ولا تُضف قراءة مباشرة للطلبات من الواجهة.

## بنية المجموعات من Schema المشروع
أُخذت الحقول من server/src/init-db.js ومسارات API؛ النسخ الاحتياطي يتحقق أيضًا من INFORMATION_SCHEMA في قاعدة MySQL الحية ويرفض أي اختلاف قبل إنشاء ملف صالح للنقل.

| المصدر | المستند الهدف | البيانات |
| --- | --- | --- |
| products | products/{String(id)} | id, slug, name_ar/en/he, description_ar/en/he, category, price, images, model_parts, customizable_parts, active, created_at, updated_at |
| orders | orders/{public_id} | id, public_id, type, customer_name, phone, country_code, country, delivery_address, notes, details, reference_image, status, quoted_price, production_eta, print_status, created_at, updated_at |
| admin_users | adminUsers/{String(id)} | id, email, password_hash, created_at |

تُحفظ كلمة مرور المدير كـbcrypt hash الموجودة، لا كنص ولا في Firebase Auth؛ تسجيل الدخول الحالي لم يتغير. هذه مجموعة خاصة بالخادم فقط، والـhash مستبعد من فهرسة Firestore.
الأسعار تبقى بنفس تمثيل MySQL لتجنب فقدان الدقة. JSON تتحول إلى arrays/maps بعد التحقق؛ الصور والملفات تبقى ملفات محلية، وتُحفظ مساراتها فقط. active يتحول إلى boolean كي يتوافق مع Rules.
تحتفظ التواريخ الأصلية بقيمتها وتصبح Firestore Timestamp. الكتابات الجديدة في repositories تستخدم serverTimestamp، والنقل يضيف _migration.importedAt من الخادم مع بصمة بيانات المصدر.
لا حاجة لمجموعات حجوزات أو زبائن أو إعدادات غير موجودة في Schema. تفضيلات اللغة/الوصول وsessionStorage وحالة UI تبقى محلية.

## المستودعات والـAPI
server/src/repositories/productRepository.js وorderRepository.js وadminRepository.js مستقلة عن الواجهة وSQL.
تدعم قراءات مستندات مباشرة، استعلامات محدودة مع cursors، وإنشاء غير قابل للاستبدال وتحديث حقول الطلب المسموح بها. الأخطاء تُحوّل إلى رسائل آمنة دون نص اعتماد أو بيانات زبون.
لم تُربط الـAPI بهذه المستودعات الآن عمدًا: التشغيل ما يزال MySQL حتى يُؤخذ backup وتتحقق خدمة Admin ويُراجع النقل.
لا توجد listeners realtime غير لازمة. الحد لكل صفحة 500 كحد أقصى. فهارس الاستعلامات موجودة في firestore.indexes.json ولم تُنشر تلقائيًا.
قبل تحويل الـAPI مستقبلًا يجب معالجة بحث SQL LIKE الحالي بخدمة بحث أو استراتيجية مناسبة، وترتيب قائمة كل الطلبات: الاستعلام التحضيري يرتب حسب status ثم created_at لأن !=archived تتطلب ترتيب status. لا يدّعي هذا الإصدار مطابقة بحث وترتيب SQL في Firestore؛ هذه لا تؤثر على الموقع الحالي لأن SQL ما يزال متصلًا.
كذلك يلزم عند التحويل تعيين numeric IDs متوافق للمنتجات الجديدة؛ المستودعات لا تخمّن IDs. لا تغيّر backend التشغيل بمجرد اكتمال إعداد Admin.

## النقل اليدوي فقط
لا يوجد startup hook أو تشغيل تلقائي. التسلسل المقترح بعد نجاح Admin، وبإيقاف مؤقت للكتابات أثناء أخذ اللقطة والنقل:

```powershell
npm run mysql:backup
npm run firebase:migrate -- --backup "backups/mysql-<timestamp>.json" --project "<actual-project-id>"
# راجع تقرير dry-run والأعداد، ثم شغّل يدويًا عند الموافقة:
npm run firebase:migrate -- --backup "backups/mysql-<timestamp>.json" --project "<actual-project-id>" --apply
```

النسخة لقطة READ ONLY متسقة داخل transaction لجداول InnoDB، مع pagination وأعداد السجلات والحقول وبصمة SHA256. تحفظ في backups/ بملف جديد دون استبدال السابق، ويُتحقق من اكتمالها قبل إغلاقها. هذه نسخة بيانات للنقل، وليست نسخة SQL شاملة للـtriggers والإجراءات والملفات المرفوعة؛ احتفظ كذلك بنسخة SQL وserver/uploads قبل تغيير تشغيل الإنتاج.
النسخة تحتوي بيانات توصيل وbcrypt hashes؛ امنح المجلد وصولًا محدودًا وانقل نسخة محفوظة خارج جهاز العمل. صلاحيات الملفات POSIX ليست بديلًا عن ACL في Windows.

أداة النقل:
- ترفض العمل دون backup صالح ودون مطابقة --project لإعداد الخادم؛ ترفض التوجيه غير المقصود إلى Emulator.
- تجري preflight لكل السجلات قبل كتابة أي سجل.
- تستخدم معرّفات ثابتة ولا تكتب فوق أي مستند قائم؛ المستند المتطابق ببصمته وبياناته يُتخطى.
- تتوقف عند التعارض أو تغيّر البيانات أو اختلاف Schema؛ لا يوجد --force أو حذف MySQL أو حذف مستندات Firestore.
- تستخدم transaction لكل مستند لتفادي تعارض أثناء النقل.
- تتحقق من كل مستند بعد النقل ومن أعداد المصدر والهدف قبل/بعد، وتطبع الأعداد فقط دون السجلات أو الأسرار.
- عند انقطاع جزئي يمكن تكرار نفس الأمر بنفس backup، وتُتخطى السجلات المطابقة. لا توجد atomicity شاملة للثلاث مجموعات؛ هذا مقصود لدعم الاستكمال الآمن.
- لقطة قديمة لا تشمل طلبات MySQL الجديدة؛ لا تحول الإنتاج عليها دون نافذة توقف كتابات ومراجعة التغطية. أي تعارض يحتاج مراجعة يدوية، وليس overwrite تلقائيًا.

لا يوجد اتصال تلقائي بالهدف أو ترحيل أثناء npm run build أو npm test.

## الملفات
أُنشئت:
- server/src/lib/admin-config.js وfirebase-admin.js.
- server/src/repositories/common.js وproductRepository.js وorderRepository.js وadminRepository.js وmigrationSchema.js وmigrationRepository.js.
- server/scripts/check-firebase-admin.js وbackup-mysql.js وmigrate-mysql-firestore.js.
- firestore.indexes.json وtests/admin-firestore.test.mjs وهذا التقرير.

عُدلت:
- server/package.json وpackage-lock.json: firebase-admin ضمن الخادم فقط.
- package.json: firebase:admin:check، mysql:backup، firebase:migrate.
- .env.example: أسماء متغيرات الخادم فارغة؛ لم يُعدل .env الحقيقي.
- .gitignore: استبعاد backups/secrets وملفات مفاتيح الخدمة/PEM.
- firebase.json: إضافة مسار ملف الفهارس.
- scripts/check-firestore.mjs: إسكات diagnostics الخاصة بالـSDK، وإظهار حالة آمنة فقط.

لا تغيير للواجهة أو index.js أو db.js أو API أو الجداول الحالية.

## نتائج التحقق
- npm run build: نجح، مع تحذير حجم الحزمة الرئيسية الموجود سابقًا (>500KB).
- npm test: نجحت الاختبارات المحلية الـ12، بما فيها تطبيع الأسطر الجديدة للمفتاح باستخدام مفتاح اختبار مولّد مؤقتًا، عدم استعمال VITE_ للخادم، حفظ JSON والأسعار والمعرّفات الكبيرة، التحقق من backup، إعادة النقل دون تكرار، ورفض الكتابة فوق المستندات المعدلة. اختبارات النقل تستخدم قاعدة ذاكرة وهمية، لا Production ولا Firestore Emulator؛ نجاحها لا يعني أن صلاحية الخادم الحقيقية اختُبرت.
- لا يوجد أمر lint في package.json الحالي.
- node --check: ملفات إعداد الخادم والنقل والنسخ صحيحة الصياغة.
- اتصال Client الفعلي فشل لعدم توفر خدمة Firestore بالمشروع؛ آخر اختبار صامت طبع unavailable فقط.
- اختبار Admin توقف بسبب المتغيرات الثلاثة المفقودة. لا يمكن تأكيد IAM أو نجاح قراءة Firestore حتى تُضاف.
- لم تؤخذ نسخة أو تُنقل بيانات فعليًا، ولم تُنشأ مستندات اختبار. كل عمليات فحص الاتصال قراءة فقط.
- npm audit --omit=dev أظهر 4 إشارات high قديمة مرتبطة بـFirebase Client/@grpc، وإشارتين moderate من uuid/gaxios ضمن اعتمادات Admin. محاولة npm audit fix --workspace server لم تعالج الإشارتين تلقائيًا. لم يُستخدم --force أو override غير مختبر. هذه ملاحظة أمان قبل الإنتاج وليست تأكيدًا أن جميع الاعتمادات خالية من الثغرات.

## المراجع
Firebase Admin: https://firebase.google.com/docs/admin/setup
حماية الوصول من الخادم: https://firebase.google.com/docs/firestore/security/rules-conditions
Transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
