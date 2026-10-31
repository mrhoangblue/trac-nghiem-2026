import { AlertTriangle, BookOpen, Inbox, Lock, School } from "lucide-react";

const ICONS = { inbox: Inbox, book: BookOpen, alert: AlertTriangle, lock: Lock, school: School };
const TONES = {
  brand: "from-indigo-500 to-violet-500 shadow-indigo-500/30",
  danger: "from-rose-500 to-pink-500 shadow-rose-500/30",
  muted: "from-gray-400 to-gray-500 shadow-gray-500/20",
};

/** Gradient icon tile used by empty, error and locked states across the app. */
export default function StateIcon({ icon, tone = "brand", size = "md", className = "" }: { icon: keyof typeof ICONS; tone?: keyof typeof TONES; size?: "sm" | "md"; className?: string }) {
  const Icon = ICONS[icon];
  const box = size === "sm" ? "h-12 w-12 rounded-xl" : "h-16 w-16 rounded-2xl";
  return (
    <span aria-hidden="true" className={`mx-auto flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg ${box} ${TONES[tone]} ${className}`}>
      <Icon size={size === "sm" ? 22 : 28} />
    </span>
  );
}
