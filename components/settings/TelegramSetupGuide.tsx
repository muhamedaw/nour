"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Shared id for the dialog's root element. Exported so the trigger button
 * in `TelegramSettings.tsx` can reference it via `aria-controls` without
 * duplicating the string literal in two files (a silent-break hazard if
 * either side is renamed).
 */
export const TELEGRAM_GUIDE_DIALOG_ID = "tg-guide-dialog";

type TipKind = "info" | "warning" | "success";

/* Module-scope constants — never re-created per render. */
const TIP_STYLES: Record<TipKind, string> = {
  info: "bg-espresso-950/60 border-r-4 border-espresso-600 text-espresso-200",
  warning: "bg-rust-950/40 border-r-4 border-rust-600 text-rust-100",
  success: "bg-copper-950/40 border-r-4 border-copper-600 text-copper-100",
};

/**
 * Modal showing a 9-step Arabic guide for creating a Telegram bot and
 * wiring it to this app. Pure presentation — all open/close state lives
 * in the parent (`TelegramSettings`).
 *
 * UX:
 *   • ESC key, X button, or click on the dim overlay all close.
 *   • Clicking inside the card does NOT close (e.stopPropagation).
 *   • Body scroll is locked while open (so background page doesn't move).
 *   • Content is fully RTL and Arabic-first.
 *
 * Accessibility:
 *   • role="dialog" + aria-modal="true" + aria-labelledby/describedby
 *   • On open, focus moves to the close button (so keyboard users can
 *     immediately dismiss with Enter/Space, and Tab starts from the top
 *     of the dialog content rather than from the page behind).
 *   • Each step is a <li> with a numbered circle (decorative, aria-hidden)
 *     and a heading for screen-reader users.
 *   • Close button has a visible Arabic label, not just an icon.
 */
export default function TelegramSetupGuide({
  open,
  onClose,
}: Props): JSX.Element | null {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock body scroll, focus the close button on open, listen for ESC,
  // and trap Tab/Shift+Tab inside the dialog.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Focus trap: wrap Tab/Shift+Tab around the dialog's focusables.
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        // If focus has somehow escaped the dialog, send it to first
        // (the natural "enter" target) rather than last.
        (active === first ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    // useEffect runs after commit, so the dialog is in the DOM.
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tg-guide-title"
      aria-describedby="tg-guide-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        id={TELEGRAM_GUIDE_DIALOG_ID}
        className="bg-espresso-900 border border-espresso-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 md:p-6 border-b border-espresso-800">
          <div className="flex-1 min-w-0">
            <h2
              id="tg-guide-title"
              className="font-display text-lg md:text-xl font-extrabold text-copper-400"
            >
              دليل إعداد بوت تيليجرام
            </h2>
            <p
              id="tg-guide-desc"
              className="text-xs text-espresso-400 mt-1 leading-5"
            >
              خطوة بخطوة — اقرأها مرة واحدة وستعرف كل شيء
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق الدليل"
            className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl bg-espresso-800 hover:bg-espresso-700 text-espresso-100 text-2xl leading-none border border-espresso-700 focus:outline-none focus:ring-2 focus:ring-copper-500"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          <ol className="flex flex-col gap-5">
            <Step n={1} title="افتح تيليجرام وابحث عن @BotFather">
              <p>
                <span className="font-mono text-copper-300">@BotFather</span>{" "}
                هو البوت الرسمي من تيليجرام لإنشاء وإدارة البوتات. كل بوت في
                تيليجرام يُنشأ من خلاله.
              </p>
              <p>
                في شريط البحث في تيليجرام اكتب{" "}
                <span className="font-mono text-copper-300">@BotFather</span>،
                أو افتح الرابط{" "}
                <span className="font-mono" dir="ltr">
                  t.me/BotFather
                </span>{" "}
                مباشرة في المتصفح.
              </p>
              <Tip kind="info">
                ✅ تأكد من العلامة الزرقاء (علامة التوثيق) بجوار الاسم — هذا
                هو البوت الرسمي الوحيد. لا تثق بأي حساب آخر يدّعي أنه
                BotFather.
              </Tip>
            </Step>

            <Step n={2} title="ابدأ المحادثة وأرسل الأمر /newbot">
              <p>
                اضغط زر{" "}
                <span className="font-mono text-copper-300">Start</span> أو
                أرسل <span className="font-mono">/start</span> لتفعيل
                المحادثة.
              </p>
              <p>
                ثم أرسل الأمر{" "}
                <span className="font-mono text-copper-300">/newbot</span>{" "}
                لإخبار BotFather بأنك تريد إنشاء بوت جديد.
              </p>
              <Tip kind="info">
                💡 لو أردت رؤية كل الأوامر المتاحة، أرسل{" "}
                <span className="font-mono">/help</span> في أي وقت.
              </Tip>
            </Step>

            <Step n={3} title="اختر اسم البوت (Name)">
              <p>
                سيطلب منك BotFather اسماً ظاهراً للبوت. هذا هو الاسم الذي
                يراه الزبائن في المحادثة. أدخل أي اسم تريده، مثلاً:{" "}
                <span className="font-mono text-copper-300">متجر ترف</span>.
              </p>
              <p className="text-espresso-400">
                لا تقلق — يمكنك تغيير الاسم لاحقاً بدون أي تأثير على البوت.
              </p>
            </Step>

            <Step n={4} title="اختر معرّف فريد للبوت (Username)">
              <p>
                المعرّف (Username) يجب أن ينتهي دائماً بـ{" "}
                <span className="font-mono text-copper-300">bot</span>، مثل:{" "}
                <span className="font-mono" dir="ltr">
                  taref_shop_bot
                </span>
                .
              </p>
              <Tip kind="warning">
                ⚠️ المعرّف فريد عالمياً ولا يمكن تكراره. إذا كان محجوزاً من
                شخص آخر، جرّب واحداً آخر (مثلاً أضف أرقاماً في النهاية:{" "}
                <span className="font-mono" dir="ltr">
                  taref_shop_2026_bot
                </span>
                ).
              </Tip>
            </Step>

            <Step n={5} title="انسخ التوكن (Token) — مفتاح البوت">
              <p>
                بمجرد نجاح الإنشاء، سيرسل لك BotFather رسالة فيها توكن طويل
                بهذا الشكل:
              </p>
              <pre
                dir="ltr"
                className="bg-espresso-950 border border-espresso-800 rounded-2xl px-3 py-2 text-xs font-mono text-copper-300 overflow-x-auto whitespace-pre"
              >
                123456789:AAH_your_long_token_string_here
              </pre>
              <Tip kind="warning">
                🔒 التوكن = كلمة مرور البوت. أي شخص يحصل عليه يتحكم بالبوت
                بالكامل (يرسل رسائل، يقرأ الرسائل، يحذف البوت). لا تشاركه
                مع أحد ولا تنشره على الإنترنت أبداً.
              </Tip>
              <p>
                انسخه بالكامل (من أول رقم لآخر حرف) وارجع إلى هذه الصفحة.
              </p>
            </Step>

            <Step
              n={6}
              title="افتح محادثة مع البوت الجديد وأرسل أي رسالة"
            >
              <p>
                في تيليجرام، ابحث عن البوت بمعرّفه (مثلاً{" "}
                <span className="font-mono" dir="ltr">
                  @taref_shop_bot
                </span>
                ) أو افتح رابطه مباشرة. اضغط{" "}
                <span className="font-mono">Start</span> ثم أرسل أي رسالة
                (مثلاً{" "}
                <span className="text-copper-300">«مرحباً»</span>).
              </p>
              <Tip kind="info">
                ℹ️ هذه الخطوة ضرورية ولا يمكن تخطيها. تيليجرام لا يسمح
                للبوت بإرسال رسائل لمستخدم لم يبدأ المحادثة من قبل. الرسالة
                التي ترسلها هي «تفعيل» للبوت و«موافقة» على استلام التقارير.
              </Tip>
            </Step>

            <Step
              n={7}
              title='ارجع للتطبيق والصق التوكن في حقل «توكن البوت»'
            >
              <p>
                في حقل{" "}
                <span className="font-bold text-copper-300">
                  توكن البوت
                </span>{" "}
                أعلى هذه الصفحة (تحت هذا الدليل)، الصق التوكن الذي نسخته.
              </p>
              <p>
                اضغط زر <span className="font-bold">حفظ</span> ليُخزَّن
                التوكن بأمان داخل جهازك (ولا يُرسل لأي جهة).
              </p>
            </Step>

            <Step
              n={8}
              title='اضغط «اكتشاف» — يجد التطبيق معرّف المحادثة تلقائياً'
            >
              <p>
                اضغط الزر{" "}
                <span className="font-bold text-copper-300">اكتشاف</span>{" "}
                الموجود بجانب حقل «معرّف المحادثة». التطبيق يقرأ الرسائل
                الأخيرة من البوت ويستخرج المعرّف الفريد لمحادثتك تلقائياً.
              </p>
              <p className="text-espresso-400">
                (هذه الخطوة أسرع وأدق من نسخ المعرّف يدوياً.)
              </p>
            </Step>

            <Step
              n={9}
              title='اضغط «إرسال رسالة اختبار» للتأكد من نجاح الإعداد'
            >
              <p>
                سترسل لك تيليجرام رسالة تأكيد من البوت. إذا وصلت، فكل شيء
                يعمل بنجاح! ✅
              </p>
              <Tip kind="success">
                🎉 مبروك! من الآن وصاعداً، كل يوم الساعة{" "}
                <span className="font-mono font-bold">6:00 صباحاً</span>، سيُرسل
                التطبيق تلقائياً تقرير مبيعات الأمس (ملف CSV) إلى تيليجرامك.
                التقرير يُحفظ أيضاً داخل الجهاز للرجوع إليه في أي وقت.
              </Tip>
            </Step>
          </ol>
        </div>

        {/* Footer */}
        <div className="p-4 md:p-5 border-t border-espresso-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-6 rounded-2xl bg-copper-600 hover:bg-copper-500 text-espresso-50 font-bold border border-copper-700 focus:outline-none focus:ring-2 focus:ring-copper-300"
          >
            فهمت، إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Internal helpers
 * ------------------------------------------------------------------ */

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 md:gap-4">
      <div
        className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full bg-copper-600 text-espresso-950 font-extrabold flex items-center justify-center text-sm md:text-base shadow-md"
        aria-hidden="true"
      >
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm md:text-base font-extrabold text-copper-300 mb-2 leading-6">
          {title}
        </h3>
        <div className="space-y-2 text-sm text-espresso-200 leading-7">
          {children}
        </div>
      </div>
    </li>
  );
}

function Tip({
  kind = "info",
  children,
}: {
  kind?: TipKind;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`px-3 py-2 rounded-xl text-xs leading-6 ${TIP_STYLES[kind]}`}
    >
      {children}
    </div>
  );
}
