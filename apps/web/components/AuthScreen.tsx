"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/locale";

const DEMO = [
  { email: "aria@whosin.demo", name: "Aria" },
  { email: "max@whosin.demo", name: "Max" },
  { email: "lea@whosin.demo", name: "Léa" },
];

export function AuthScreen() {
  const { t, locale, toggle } = useT();
  const supabase = getSupabase();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName } },
        });
        if (error) throw error;
        setMsg(t.auth.checkEmail);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin(demoEmail: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: "whosin123",
    });
    if (error) setMsg(error.message);
    setBusy(false);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 py-10 animate-fade">
      <button
        onClick={toggle}
        className="self-end rounded-full border border-border px-3 py-1 text-xs text-text-dim"
      >
        {locale === "fr" ? "EN" : "FR"}
      </button>

      <div className="mt-10 mb-8">
        <div className="mb-3 flex items-center gap-2">
          <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-2xl">
            📍
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Whoz<span className="text-gradient">in</span>
          </h1>
        </div>
        <p className="text-lg font-semibold">{t.auth.welcome}</p>
        <p className="text-sm text-text-dim">{t.auth.welcomeSub}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "up" && (
          <>
            <Field label={t.auth.username} value={username} onChange={setUsername} placeholder="aria_mtl" required />
            <Field label={t.auth.displayName} value={displayName} onChange={setDisplayName} placeholder="Aria" />
          </>
        )}
        <Field label={t.auth.email} type="email" value={email} onChange={setEmail} placeholder="toi@exemple.com" required />
        <Field label={t.auth.password} type="password" value={password} onChange={setPassword} placeholder="••••••••" required />

        {msg && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-brand-2">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="brand-gradient mt-1 rounded-xl py-3 font-bold text-white disabled:opacity-60"
        >
          {busy ? t.common.loading : mode === "in" ? t.auth.signIn : t.auth.signUp}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setMsg(null);
        }}
        className="mt-4 text-center text-sm text-text-dim"
      >
        {mode === "in" ? t.auth.noAccount : t.auth.haveAccount}{" "}
        <span className="font-semibold text-text">
          {mode === "in" ? t.auth.signUp : t.auth.signIn}
        </span>
      </button>

      <div className="mt-auto pt-8">
        <p className="mb-2 text-center text-xs uppercase tracking-wide text-text-dim">
          {locale === "fr" ? "Essayer avec un compte démo" : "Try a demo account"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              onClick={() => demoLogin(d.email)}
              disabled={busy}
              className="rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-dim">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="none"
        className="rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none focus:border-brand"
      />
    </label>
  );
}
