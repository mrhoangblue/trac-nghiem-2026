"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Plus, type LucideIcon } from "lucide-react";

export const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 shadow-[0_1px_2px_rgb(16_24_40/.04)] outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400";

export function EditorCard({
  id,
  step,
  icon: Icon,
  title,
  description,
  done,
  action,
  children,
}: {
  id?: string;
  step?: number;
  icon: LucideIcon;
  title: string;
  description?: string;
  done?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24 rounded-3xl border border-gray-200 bg-white shadow-[var(--shadow-soft)]">
      <header className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${done ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/25" : "bg-gradient-to-br from-indigo-500 to-violet-500 shadow-indigo-500/25"}`}>
          {done ? <Check size={18} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-base font-bold text-gray-900 sm:text-lg">
            {step ? <span className="mr-1.5 text-brand-500">{step}.</span> : null}{title}
          </h2>
          {description && <p className="mt-0.5 text-sm leading-5 text-gray-500">{description}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  optional,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}{optional && <span className="ml-1 font-normal text-gray-400">(không bắt buộc)</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-5 text-gray-500">{hint}</p>}
    </div>
  );
}

export function NumberField({
  id,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  parse = (raw) => Number.parseFloat(raw),
  fallback = 0,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit: string;
  parse?: (raw: string) => number;
  fallback?: number;
}) {
  const clamp = (next: number) => {
    const rounded = Math.round(next * 100) / 100;
    return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, rounded));
  };
  const buttonClass = "flex h-11 w-10 shrink-0 items-center justify-center text-gray-500 transition hover:bg-gray-50 hover:text-brand-700 disabled:opacity-30";
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgb(16_24_40/.04)] focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10">
      <button type="button" aria-label="Giảm" disabled={value <= min} onClick={() => onChange(clamp(value - step))} className={`${buttonClass} border-r border-gray-100`}><Minus size={15} aria-hidden="true" /></button>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = parse(event.target.value);
          onChange(Number.isFinite(next) ? next : fallback);
        }}
        className="w-full min-w-0 bg-transparent text-center font-display text-base font-bold tabular-nums text-gray-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="flex items-center pr-1 text-xs font-medium text-gray-400">{unit}</span>
      <button type="button" aria-label="Tăng" disabled={max !== undefined && value >= max} onClick={() => onChange(clamp(value + step))} className={`${buttonClass} border-l border-gray-100`}><Plus size={15} aria-hidden="true" /></button>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`relative flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 transition ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-gray-300"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-gray-200 transition peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-violet-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

export function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 2,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; description: string; icon: LucideIcon }>;
  columns?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={`grid gap-2 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map(({ value: optionValue, label, description, icon: Icon }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optionValue)}
            className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${selected ? "border-brand-400 bg-brand-50/70 ring-4 ring-brand-500/10" : "border-gray-200 bg-white hover:border-gray-300"}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}><Icon size={17} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${selected ? "text-brand-900" : "text-gray-800"}`}>{label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h3>;
}

export interface ChecklistItem {
  label: string;
  ok: boolean;
  hint?: string;
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2.5 text-sm">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.ok ? "bg-emerald-500 text-white" : "border-2 border-gray-300 bg-white"}`}>
            {item.ok && <Check size={12} strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className={item.ok ? "text-gray-700" : "font-semibold text-gray-900"}>{item.label}</span>
            {!item.ok && item.hint && <span className="block text-xs leading-5 text-gray-500">{item.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Dropdown drawn in the page instead of the browser's native picker, so the
 * list always opens right under the field with the site's own type size.
 */
export function SelectMenu({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-list`;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const openMenu = () => {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(options[index]);
    setOpen(false);
    document.getElementById(id)?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key === "Escape" || event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className={`${inputClass} flex h-11 items-center justify-between gap-2 text-left font-medium ${open ? "border-brand-400 ring-4 ring-brand-500/10" : ""}`}
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${open ? "rotate-180 text-brand-600" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 text-sm shadow-[0_12px_32px_-8px_rgb(16_24_40/.22)]"
        >
          {options.map((option, index) => {
            const selected = option === value;
            return (
              <li
                key={option}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 ${index === active ? "bg-brand-50 text-brand-800" : "text-gray-700"} ${selected ? "font-semibold" : ""}`}
              >
                <span>{option}</span>
                {selected && <Check size={15} className="shrink-0 text-brand-600" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
