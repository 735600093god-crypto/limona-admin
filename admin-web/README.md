# لوحة مدير التحكم بتطبيق تسوق ليمونة (الويب المنفصلة)

هذه اللوحة منفصلة تماماً عن تطبيق الأندرويد الخاص بالعملاء وتعمل على نفس مشروع Firebase وقاعدة بيانات Firestore السحابية (`ai-studio-android-fa2ba1de-6827-4cf8-960d-7210a1e03a27`).

## التشغيل أو النشر على Firebase Hosting
1. لتشغيلها محلياً:
   ```bash
   npx serve admin-web
   ```
2. أو لنشرها على الويب عبر Firebase Hosting:
   - تأكد من تفعيل مزود **Email/Password** في Firebase Console -> Authentication -> Sign-in method وأنشئ حساب المدير، ثم أضف الـ `UID` الخاص به من قسم **إعدادات حساب المدير** (أو سجل الدخول مباشرة بحساب جوجل المعتمد `akrmshaker8@gmail.com`).
   - انشر مجلد `admin-web` عبر `firebase deploy --only hosting`.
