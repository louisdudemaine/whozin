"use client";

import { useState } from "react";
import { CATEGORY_LIST, estTexteInterdit } from "@whosin/shared";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/locale";
import { updateProfile } from "@/lib/data";
import { toast } from "@/lib/toast";

/** vibes perso au-delà des catégories de lieux */
const VIBES: { key: string; fr: string; en: string; emoji: string }[] = [
  { key: "foodie", fr: "Foodie", en: "Foodie", emoji: "🍜" },
  { key: "nightlife", fr: "Vie nocturne", en: "Nightlife", emoji: "🌃" },
  { key: "musique", fr: "Musique live", en: "Live music", emoji: "🎧" },
  { key: "plein-air", fr: "Plein air", en: "Outdoors", emoji: "🌲" },
  { key: "art", fr: "Art & culture", en: "Art & culture", emoji: "🎨" },
  { key: "fitness", fr: "Sport & fitness", en: "Sport & fitness", emoji: "💪" },
  { key: "voyage", fr: "Voyage", en: "Travel", emoji: "✈️" },
  { key: "gaming", fr: "Gaming", en: "Gaming", emoji: "🎮" },
];

/** secteurs (mode pro) */
const INDUSTRIES = [
  { key: "tech", fr: "Tech / Startup", en: "Tech / Startup" },
  { key: "finance", fr: "Finance", en: "Finance" },
  { key: "immobilier", fr: "Immobilier", en: "Real estate" },
  { key: "sante", fr: "Santé", en: "Health" },
  { key: "creatif", fr: "Créatif / Médias", en: "Creative / Media" },
  { key: "hospitalite", fr: "Hôtellerie / Restauration", en: "Hospitality" },
  { key: "education", fr: "Éducation", en: "Education" },
  { key: "autre", fr: "Autre", en: "Other" },
];

/** objectifs de réseautage (mode pro) */
const GOALS: { key: string; fr: string; en: string; emoji: string }[] = [
  { key: "clients", fr: "Trouver des clients", en: "Find clients", emoji: "🤝" },
  { key: "embauche", fr: "Recruter / être recruté", en: "Hire / get hired", emoji: "💼" },
  { key: "partenaires", fr: "Partenaires d'affaires", en: "Business partners", emoji: "🧩" },
  { key: "mentorat", fr: "Mentorat", en: "Mentorship", emoji: "🧭" },
  { key: "investisseurs", fr: "Investisseurs", en: "Investors", emoji: "💰" },
  { key: "evenements", fr: "Événements & 5 à 7", en: "Events & meetups", emoji: "🥂" },
];

/** 🧭 Questionnaire d'onboarding — intérêts perso, puis pro si désiré. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { t, locale } = useT();
  const fr = locale === "fr";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [wantsPro, setWantsPro] = useState<boolean | null>(null);
  const [title, setTitle] = useState(profile?.pro_title ?? "");
  const [company, setCompany] = useState(profile?.pro_company ?? "");
  const [industry, setIndustry] = useState(profile?.pro_industry ?? "");
  const [goals, setGoals] = useState<string[]>(profile?.pro_goals ?? []);
  const [busy, setBusy] = useState(false);

  const firstName = (profile?.display_name || profile?.username || "").split(" ")[0];

  function toggle(arr: string[], set: (v: string[]) => void, v: string) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function finish(asPro: boolean) {
    if (!profile) return;
    setBusy(true);
    try {
      await updateProfile(profile.id, {
        interests,
        onboarded: true,
        pro_mode: asPro,
        ...(asPro
          ? { pro_title: title.trim() || null, pro_company: company.trim() || null, pro_industry: industry || null, pro_goals: goals }
          : {}),
      });
      await refreshProfile();
      onDone();
    } catch (e) {
      toast(estTexteInterdit(e) ? t.common.forbiddenWord : t.common.error, "error");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!profile) return;
    setBusy(true);
    try {
      await updateProfile(profile.id, { onboarded: true });
      await refreshProfile();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden px-6 pb-8 pt-[max(28px,env(safe-area-inset-top))]">
      <div className="neon-rain neon-rain--intense absolute inset-0 -z-10" aria-hidden />

      {/* progression */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: s <= step ? "var(--brand)" : "var(--surface-2)" }}
          />
        ))}
      </div>

      {/* ── Étape 1 : intérêts personnels ── */}
      {step === 1 && (
        <div className="flex flex-1 flex-col animate-glow-enter">
          <h1 className="mt-8 font-display text-[2rem] font-extrabold leading-tight">
            {firstName ? `${fr ? "Salut" : "Hey"} ${firstName} 👋` : "👋"}
            <br />
            <span className="text-gradient neon-text">{fr ? "Qu'est-ce qui t'allume?" : "What lights you up?"}</span>
          </h1>
          <p className="mt-2 text-[15px] text-text-dim">
            {fr
              ? "Choisis ce que tu aimes — ça personnalise tes suggestions de soirées et de gens."
              : "Pick what you love — it tailors your night & people suggestions."}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORY_LIST.filter((c) => c.key !== "other").map((c) => {
              const on = interests.includes(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => toggle(interests, setInterests, c.key)}
                  className="pressable rounded-full border px-4 py-2.5 text-sm font-bold"
                  style={{
                    borderColor: on ? c.color : "var(--border)",
                    background: on ? `${c.color}22` : "var(--surface-2)",
                    color: on ? c.color : "var(--text)",
                  }}
                >
                  {c.emoji} {c.label[fr ? "fr" : "en"]}
                </button>
              );
            })}
            {VIBES.map((v) => {
              const on = interests.includes(v.key);
              return (
                <button
                  key={v.key}
                  onClick={() => toggle(interests, setInterests, v.key)}
                  className="pressable rounded-full border px-4 py-2.5 text-sm font-bold"
                  style={{
                    borderColor: on ? "var(--brand)" : "var(--border)",
                    background: on ? "rgba(255,46,99,.12)" : "var(--surface-2)",
                    color: on ? "var(--brand)" : "var(--text)",
                  }}
                >
                  {v.emoji} {v[fr ? "fr" : "en"]}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={() => setStep(2)}
              disabled={interests.length === 0}
              className="glow-cta brand-gradient pressable w-full rounded-full py-4 font-display text-base font-bold text-white disabled:opacity-50"
            >
              {interests.length === 0
                ? fr ? "Choisis au moins 1" : "Pick at least 1"
                : `${fr ? "Continuer" : "Continue"} (${interests.length})`}
            </button>
            <button onClick={skip} disabled={busy} className="mt-2 w-full py-2 text-sm font-semibold text-text-dim">
              {fr ? "Passer pour l'instant" : "Skip for now"}
            </button>
          </div>
        </div>
      )}

      {/* ── Étape 2 : compte pro? ── */}
      {step === 2 && (
        <div className="flex flex-1 flex-col animate-glow-enter">
          <h1 className="mt-8 font-display text-[2rem] font-extrabold leading-tight">
            💼 {fr ? "Tu veux aussi un" : "Want a"}
            <br />
            <span className="text-gradient neon-text">{fr ? "profil professionnel?" : "professional profile too?"}</span>
          </h1>
          <p className="mt-2 text-[15px] text-text-dim">
            {fr
              ? "Whozin a un mode Pro pour le réseautage : 5 à 7, opportunités, événements d'affaires. Tu basculeras entre Social 🎉 et Pro 💼 quand tu veux."
              : "Whozin has a Pro mode for networking: meetups, opportunities, business events. Switch between Social 🎉 and Pro 💼 anytime."}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => {
                setWantsPro(true);
                setStep(3);
              }}
              className="halo-card pressable rounded-3xl p-5 text-left"
              style={{ "--glow": "rgba(77,159,255,.4)", "--int": 0.6 } as React.CSSProperties}
            >
              <p className="font-display text-lg font-bold">💼 {fr ? "Oui, je veux réseauter" : "Yes, I want to network"}</p>
              <p className="mt-0.5 text-sm text-text-dim">
                {fr ? "Quelques questions de plus sur ton métier." : "A few more questions about your work."}
              </p>
            </button>
            <button
              onClick={() => {
                setWantsPro(false);
                finish(false);
              }}
              disabled={busy}
              className="rounded-3xl border border-border bg-surface p-5 text-left"
            >
              <p className="font-display text-lg font-bold">🎉 {fr ? "Non, juste pour le fun" : "No, just for fun"}</p>
              <p className="mt-0.5 text-sm text-text-dim">
                {fr ? "Tu pourras l'activer plus tard dans ton profil." : "You can turn it on later in your profile."}
              </p>
            </button>
          </div>

          <button onClick={() => setStep(1)} className="mt-auto pt-6 text-sm font-semibold text-text-dim">
            ← {fr ? "Retour" : "Back"}
          </button>
        </div>
      )}

      {/* ── Étape 3 : détails pro ── */}
      {step === 3 && wantsPro && (
        <div className="flex flex-1 flex-col animate-glow-enter">
          <h1 className="mt-8 font-display text-[1.7rem] font-extrabold leading-tight">
            💼 {fr ? "Parle-nous de ton" : "Tell us about your"}{" "}
            <span className="text-gradient">{fr ? "métier" : "work"}</span>
          </h1>

          <label className="mt-5 block text-xs font-bold text-text-dim">{fr ? "Titre / poste" : "Title / role"}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={fr ? "Ex : Fondateur, Designer, Courtier…" : "e.g. Founder, Designer, Broker…"}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />

          <label className="mt-3 block text-xs font-bold text-text-dim">{fr ? "Entreprise" : "Company"}</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={fr ? "Ex : Whozin inc." : "e.g. Whozin inc."}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />

          <label className="mt-3 block text-xs font-bold text-text-dim">{fr ? "Secteur" : "Industry"}</label>
          <div className="no-scrollbar mt-1.5 flex flex-wrap gap-2">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind.key}
                onClick={() => setIndustry(ind.key)}
                className="pressable rounded-full border px-3.5 py-2 text-[13px] font-bold"
                style={{
                  borderColor: industry === ind.key ? "#4d9fff" : "var(--border)",
                  background: industry === ind.key ? "rgba(77,159,255,.14)" : "var(--surface-2)",
                  color: industry === ind.key ? "#4d9fff" : "var(--text)",
                }}
              >
                {ind[fr ? "fr" : "en"]}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-bold text-text-dim">
            {fr ? "Tu cherches quoi en réseautage?" : "What are you networking for?"}
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GOALS.map((g) => {
              const on = goals.includes(g.key);
              return (
                <button
                  key={g.key}
                  onClick={() => toggle(goals, setGoals, g.key)}
                  className="pressable rounded-full border px-3.5 py-2 text-[13px] font-bold"
                  style={{
                    borderColor: on ? "#4d9fff" : "var(--border)",
                    background: on ? "rgba(77,159,255,.14)" : "var(--surface-2)",
                    color: on ? "#4d9fff" : "var(--text)",
                  }}
                >
                  {g.emoji} {g[fr ? "fr" : "en"]}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={() => finish(true)}
              disabled={busy}
              className="glow-cta brand-gradient pressable w-full rounded-full py-4 font-display text-base font-bold text-white disabled:opacity-60"
            >
              {busy ? "…" : fr ? "C'est parti 🚀" : "Let's go 🚀"}
            </button>
            <button onClick={() => setStep(2)} className="mt-2 w-full py-2 text-sm font-semibold text-text-dim">
              ← {fr ? "Retour" : "Back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
