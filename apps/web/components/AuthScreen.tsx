"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useT } from "@/lib/locale";
import { Avatar } from "./Avatar";

const DEMO = [
  { email: "aria@whosin.demo", name: "Aria" },
  { email: "max@whosin.demo", name: "Max" },
  { email: "lea@whosin.demo", name: "Léa" },
];

const HERO_AVATARS = ["aria_mtl", "maxlevesque", "lea_tremblay", "sam_co"];

/** âge entier à partir d'une date AAAA-MM-JJ (null si invalide) */
function ageFrom(dateStr: string): number | null {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function AuthScreen() {
  const { t, locale, toggle } = useT();
  const supabase = getSupabase();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fr = locale === "fr";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const age = ageFrom(birthdate);
        if (age === null || age > 110) {
          setMsg(fr ? "Entre ta vraie date de naissance." : "Enter your real date of birth.");
          return;
        }
        if (age < 16) {
          setMsg(
            fr
              ? "Whozin, c'est 16 ans et plus. Reviens-nous vite! 🌙"
              : "Whozin is 16+. Come back soon! 🌙"
          );
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName, birthdate } },
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
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden px-6 pb-8 pt-10">
      {/* la ville à pleine intensité, seulement ici */}
      <div className="neon-rain neon-rain--intense absolute inset-0 -z-10" aria-hidden />

      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-extrabold">
          Whoz<span className="text-gradient neon-text">in</span>
        </span>
        <button
          onClick={toggle}
          className="glass rounded-full px-3 py-1 text-xs font-bold text-text-dim"
        >
          {fr ? "EN" : "FR"}
        </button>
      </div>

      {/* LA FENÊTRE : une vraie carte live, inclinée, qui respire */}
      <div className="relative mx-auto mt-9 w-64 animate-glow-enter">
        <div
          className="glass absolute inset-0 translate-y-2.5 rotate-2 rounded-3xl"
          style={{ boxShadow: "0 0 40px -10px var(--glow-teal)" }}
          aria-hidden
        />
        <div
          className="halo-card halo-breathe relative -rotate-3 rounded-3xl p-4"
          style={{ "--glow": "var(--glow-rose)", "--int": 0.8 } as React.CSSProperties}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            LIVE · {fr ? "Place des Festivals" : "Festival Square"} 🎪
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="stack">
              {HERO_AVATARS.map((u, i) => (
                <span key={u} className="ring" style={{ zIndex: 4 - i }}>
                  <Avatar profile={{ username: u, display_name: null, avatar_url: null }} size={32} />
                </span>
              ))}
            </div>
            <span className="font-display text-xl font-extrabold text-gradient">23</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full w-4/5 rounded-full"
              style={{
                background: "linear-gradient(90deg,#16d9c5,#ff7849,#ff2e63)",
                boxShadow: "0 0 8px var(--glow-rose)",
              }}
            />
          </div>
        </div>
      </div>

      {/* le hook */}
      <div className="mt-9 animate-glow-enter" style={{ "--i": 1 } as React.CSSProperties}>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-tight">
          {fr ? "La ville s'allume." : "The city lights up."}
          <br />
          <span className="text-gradient neon-text">{fr ? "T'es où?" : "Where you at?"}</span>
        </h1>
        <p className="mt-2.5 text-[15px] text-text-dim">
          {fr
            ? "Vois qui est sorti, en ce moment, autour de toi."
            : "See who's out, right now, around you."}
        </p>
        <div className="mt-4 flex items-center gap-2.5 text-[13px] text-text-dim">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          {fr ? "Des gens sont sortis à MTL en ce moment" : "People are out in MTL right now"}
        </div>
      </div>

      {/* conversion : lumière → preuve → bouton */}
      {!showForm ? (
        <div className="mt-auto flex flex-col gap-3 pt-10 animate-glow-enter" style={{ "--i": 2 } as React.CSSProperties}>
          <button
            onClick={() => {
              setMode("up");
              setShowForm(true);
            }}
            className="glow-cta brand-gradient pressable rounded-full py-4 font-display text-base font-bold text-white"
          >
            {fr ? "Voir où ça bouge" : "See what's buzzing"}
          </button>
          <button
            onClick={() => {
              setMode("in");
              setShowForm(true);
            }}
            className="rounded-full py-2 text-sm font-semibold text-text-dim"
          >
            {fr ? "J'ai déjà un compte" : "I already have an account"}
          </button>
          <div className="mt-1">
            <p className="mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-text-dim">
              {fr ? "Essayer avec un compte démo" : "Try a demo account"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => demoLogin(d.email)}
                  disabled={busy}
                  className="glass pressable rounded-2xl py-2.5 text-sm font-bold disabled:opacity-60"
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 animate-fade">
          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === "up" && (
              <>
                <Field label={t.auth.username} value={username} onChange={setUsername} placeholder="aria_mtl" required />
                <Field label={t.auth.displayName} value={displayName} onChange={setDisplayName} placeholder="Aria" />
                <Field
                  label={fr ? "Date de naissance (16+)" : "Date of birth (16+)"}
                  type="date"
                  value={birthdate}
                  onChange={setBirthdate}
                  required
                />
              </>
            )}
            <Field label={t.auth.email} type="email" value={email} onChange={setEmail} placeholder="toi@exemple.com" required />
            <Field label={t.auth.password} type="password" value={password} onChange={setPassword} placeholder="••••••••" required />

            {msg && <p className="glass rounded-xl px-3 py-2 text-sm text-brand-2">{msg}</p>}

            <button
              type="submit"
              disabled={busy}
              className="glow-cta brand-gradient pressable mt-1 rounded-full py-3.5 font-display text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy ? t.common.loading : mode === "in" ? t.auth.signIn : t.auth.signUp}
            </button>
            {mode === "up" && (
              <p className="text-center text-[11px] leading-relaxed text-text-dim">
                {fr ? "En créant un compte, tu acceptes notre " : "By creating an account, you accept our "}
                <a href="/confidentialite" className="font-bold text-brand-2 underline">
                  {fr ? "politique de confidentialité" : "privacy policy"}
                </a>
                {fr
                  ? ". Ta position n'est partagée que quand tu le choisis."
                  : ". Your location is only shared when you choose."}
              </p>
            )}
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button onClick={() => setShowForm(false)} className="text-text-dim">
              ← {t.common.cancel}
            </button>
            <button
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setMsg(null);
              }}
              className="font-semibold"
            >
              {mode === "in" ? t.auth.signUp : t.auth.signIn}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => demoLogin(d.email)}
                disabled={busy}
                className="glass pressable rounded-2xl py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
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
        className="rounded-2xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-brand"
      />
    </label>
  );
}
