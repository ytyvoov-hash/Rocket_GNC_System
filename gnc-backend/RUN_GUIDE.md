# دليل تشغيل GNC Backend - من البداية إلى النهاية

## المتطلبات الأساسية

### البرامج المطلوبة
- **Visual Studio 2022 Enterprise** (أو Community)
- **CMake** 4.3.2 أو أحدث
- **Conan** 2.28.1 أو أحدث
- **Node.js** و **npm** (للواجهة الأمامية)
- **PowerShell** أو **Developer Command Prompt for VS 2022**

### تثبيت الأدوات

```cmd
# تثبيت Conan
py -m pip install conan

# تحديث إعدادات Conan إلى C++20
conan profile update settings.compiler.cppstd=20
```

---

## المرحلة 1: بناء Backend

### الخطوة 1: فتح Developer Command Prompt
ابحث عن "Developer Command Prompt for VS 2022" من قائمة Start وافتحه.

### الخطوة 2: الانتقال إلى مجلد المشروع
```cmd
cd /d d:\م.مختار\GNS2030\project_GNC\gnc-backend
```

### الخطوة 3: تثبيت التبعيات باستخدام Conan
```cmd
conan install . --output-folder=build --build=missing
```
**ملاحظة:** هذه العملية قد تستغرق عدة دقائق لأنها تبني boost, hdf5, drogon من المصدر.

### الخطوة 4: تكوين CMake
```cmd
cmake --preset conan-default -DGNC_CORE_BUILD_TESTS=OFF
```

### الخطوة 5: البناء
```cmd
cmake --build build --config Release
```

### الخطوة 6: إنشاء مجلد logs
```cmd
mkdir logs
mkdir build\Release\logs
```

---

## المرحلة 2: تشغيل Backend

### الخطوة 1: الانتقال إلى مجلد البناء
```cmd
cd build\Release
```

### الخطوة 2: تشغيل الخادم
```cmd
.\gnc-backend.exe ..\..\config\dev.json
```

**المتوقع:**
```
[gnc-backend] HAL stack ready (any_stubbed=true)
[gnc-backend] Loading config: ..\..\config\dev.json
[gnc-backend] Starting Drogon on port 8080...
```

الخادم سيعمل على `http://localhost:8080`

---

## المرحلة 3: اختبار REST Endpoints

افتح **terminal جديد** واختبر نقاط النهاية:

### اختبار فحص الأجهزة USB
```cmd
curl http://localhost:8080/api/v1/hardware/scan
```
**المتوقع:** مصفوفة JSON تحتوي على أجهزة USB المتصلة (VID/PID)

### اختبار قراءة hardware_mapping
```cmd
curl http://localhost:8080/api/v1/hardware-mapping
```
**المتوقع:** محتوى `rockets/BA/hardware_mapping.yaml` كـ JSON

### اختبار قراءة device_assignments
```cmd
curl http://localhost:8080/api/v1/hardware/assignments
```
**المتوقع:** مصفوفة فارغة (لم يتم إنشاء الملف بعد)

---

## المرحلة 4: اختبار WebSocket

### تثبيت عميل WebSocket
```cmd
npm install -g wscat
```

### الاتصال بالخادم
```cmd
wscat -c ws://localhost:8080/ws/hardware
```

**المتوقع:** رسائل كل ثانية:
```json
{
  "cpu_temp_c": 45.5,
  "cpu_load_pct": 12.3,
  "can_utilisation_pct": 0.0
}
```

### إرسال طلب rescan
```json
{"type": "rescan_request"}
```

**المتوقع:** استجابة:
```json
{"status": "ok", "message": "Rescan triggered"}
```

---

## المرحلة 5: تشغيل الواجهة الأمامية

### الخطوة 1: فتح terminal جديد
احتفظ بـ backend يعمل في terminal الأول

### الخطوة 2: الانتقال إلى مجلد frontend
```cmd
cd /d d:\م.مختار\GNS2030\project_GNC\gnc-frontend
```

### الخطوة 3: تثبيت التبعيات
```cmd
npm install
```

### الخطوة 4: تشغيل خادم التطوير
```cmd
npm run dev
```

### الخطوة 5: فتح المتصفح
افتح: `http://localhost:5173`

الواجهة الأمامية ستتصل تلقائياً بالخادم الخلفي على `http://localhost:8080`

---

## المرحلة 6: الاختبار الشامل من الواجهة

### 1. فحص الأجهزة
- انتقل إلى صفحة Hardware في الواجهة
- انقر على "Scan Devices"
- تحقق من ظهور أجهزة USB المتصلة

### 2. عرض Hardware Mapping
- انتقل إلى صفحة Hardware Mapping
- تحقق من عرض محتوى `rockets/BA/hardware_mapping.yaml`

### 3. حفظ Device Assignments
- اربط أجهزة بأدوار معينة
- انقر على "Save Assignments"
- تحقق من حفظ الملف في `./var/gnc_device_assignments.json`

### 4. مراقبة WebSocket
- افتح Developer Tools في المتصفح (F12)
- انتقل إلى تبويب Network -> WS
- تحقق من استقبال رسائل WebSocket كل ثانية

---

## البناء السريع (ملف BAT)

استخدم ملف `BUILD_EXE.bat` للبناء السريع:

```cmd
cd d:\م.مختار\GNS2030\project_GNC\gnc-backend
BUILD_EXE.bat
```

الملف يقوم بـ:
1. إعداد PATH لـ CMake و Conan
2. تحديث إعدادات Conan إلى C++20
3. تثبيت التبعيات
4. تكوين CMake
5. البناء

---

## المشاكل الشائعة والحلول

### مشكلة: "Log path does not exist!"
**الحل:**
```cmd
mkdir logs
mkdir build\Release\logs
```

### مشكلة: Conan install fails - C++14 vs C++20
**الحل:**
```cmd
conan profile update settings.compiler.cppstd=20
conan install . --output-folder=build --build=missing
```

### مشكلة: Git not found during CMake
**الحل:** تعطيل الاختبارات:
```cmd
cmake --preset conan-default -DGNC_CORE_BUILD_TESTS=OFF
```

### مشكلة: PowerShell لا يجد gnc-backend.exe
**الحل:** استخدم `.\`:
```cmd
.\gnc-backend.exe ..\..\config\dev.json
```

---

## الهيكل الملفي

```
gnc-backend/
├── build/Release/           # الملف التنفيذي
│   ├── gnc-backend.exe
│   └── logs/                # ملفات السجلات
├── config/
│   └── dev.json             # إعدادات التطوير
├── src/
│   ├── controllers/         # REST API controllers
│   ├── ws/                  # WebSocket controllers
│   ├── hal/native/          # Native HAL implementations
│   └── main.cc              # نقطة الدخول
├── rockets/BA/              # إعدادات الصاروخ BA
│   └── hardware_mapping.yaml
└── var/                     # ملفات التشغيل
    └── gnc_device_assignments.json
```

---

## المخرجات المتوقعة

### Backend
- ✅ الخادم يعمل على port 8080
- ✅ HAL stack جاهز (native implementations مسجلة)
- ✅ REST endpoints تعمل
- ✅ WebSocket يرسل بيانات كل ثانية

### Frontend
- ✅ الواجهة تعمل على port 5173
- ✅ الاتصال بالخادم الخلفي ناجح
- ✅ فحص الأجهزة يعمل
- ✅ عرض hardware_mapping يعمل
- ✅ حفظ assignments يعمل

---

## الخلاصة

1. **بناء:** استخدم `BUILD_EXE.bat` أو اتبع الخطوات اليدوية
2. **تشغيل:** `.\gnc-backend.exe ..\..\config\dev.json`
3. **اختبار REST:** استخدم curl أو Postman
4. **اختبار WebSocket:** استخدم wscat
5. **تشغيل Frontend:** `npm run dev` في مجلد gnc-frontend
6. **الاختبار الشامل:** من المتصفح على `http://localhost:5173`

**الحالة الحالية:** ✅ جميع مهام قسم Hardware مكتملة والخادم يعمل بنجاح.
