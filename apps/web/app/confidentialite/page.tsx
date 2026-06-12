"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 📜 Politique de confidentialité — Loi 25 (Québec).
 * Page publique : lisible sans compte, FR par défaut, EN disponible.
 */
export default function PrivacyPage() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const fr = lang === "fr";

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-5 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-display text-xl font-extrabold no-underline">
          Whoz<span className="text-gradient">in</span>
        </Link>
        <button
          onClick={() => setLang(fr ? "en" : "fr")}
          className="glass rounded-full px-3 py-1 text-xs font-bold text-text-dim"
        >
          {fr ? "EN" : "FR"}
        </button>
      </div>

      <h1 className="mt-6 font-display text-2xl font-extrabold">
        📜 {fr ? "Confidentialité" : "Privacy policy"}
      </h1>
      <p className="mt-1 text-sm text-text-dim">
        {fr ? "Dernière mise à jour : 11 juin 2026" : "Last updated: June 11, 2026"}
      </p>

      <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-text">
        <Section title={fr ? "En une phrase" : "In one sentence"}>
          {fr
            ? "Whozin te montre où ça bouge — et c'est TOI qui décides ce que les autres voient de toi, à chaque instant."
            : "Whozin shows you where the city is buzzing — and YOU decide what others see about you, at every moment."}
        </Section>

        <Section title={fr ? "Ce qu'on collecte" : "What we collect"}>
          {fr ? (
            <>
              <b>Compte</b> : courriel, nom d'utilisateur, date de naissance (jamais affichée — sert
              au verrou 18+ des rencontres). <b>Contenu</b> : check-ins, publications, stories,
              messages, réservations. <b>Localisation</b> : seulement quand tu check-in ou actives
              un mode de partage — jamais en arrière-plan.
            </>
          ) : (
            <>
              <b>Account</b>: email, username, date of birth (never displayed — used for the 18+
              dating lock). <b>Content</b>: check-ins, posts, stories, messages, reservations.{" "}
              <b>Location</b>: only when you check in or enable a sharing mode — never in the
              background.
            </>
          )}
        </Section>

        <Section title={fr ? "Ta position : 3 modes, ton choix" : "Your location: 3 modes, your choice"}>
          {fr ? (
            <>
              📍 <b>Précis</b> (Proximité) : paliers seulement (« ici », « proche ») — tes
              coordonnées exactes ne sont JAMAIS lisibles par d'autres. 📡 <b>Approximatif</b> :
              position floutée. 👻 <b>Caché</b> : invisible. Tu changes de mode en un tap, en tout
              temps. Le consentement est demandé par ton navigateur avant tout accès GPS.
            </>
          ) : (
            <>
              📍 <b>Precise</b> (Proximity): buckets only ("here", "close") — your exact coordinates
              are NEVER readable by others. 📡 <b>Approximate</b>: blurred position. 👻{" "}
              <b>Hidden</b>: invisible. Switch anytime, in one tap. Your browser asks consent before
              any GPS access.
            </>
          )}
        </Section>

        <Section title={fr ? "Ce qu'on ne fait pas" : "What we don't do"}>
          {fr
            ? "On ne vend pas tes données. Pas de publicité ciblée sur ta position. Pas de suivi en arrière-plan. Les agrégats montrés aux lieux partenaires (ex. « 12 personnes ici ») sont anonymes."
            : "We don't sell your data. No ads targeted on your location. No background tracking. Aggregates shown to partner venues (e.g. \"12 people here\") are anonymous."}
        </Section>

        <Section title={fr ? "Sécurité" : "Security"}>
          {fr
            ? "Chiffrement en transit (TLS) et au repos (AES-256), règles d'accès appliquées au niveau de la base de données, 2FA disponible, blocages appliqués en base. Hébergement : Supabase (AWS, ca-central-1, Canada) et Vercel."
            : "Encryption in transit (TLS) and at rest (AES-256), access rules enforced at the database level, 2FA available, blocks enforced in the database. Hosting: Supabase (AWS ca-central-1, Canada) and Vercel."}
        </Section>

        <Section title={fr ? "Tes droits (Loi 25)" : "Your rights (Law 25)"}>
          {fr ? (
            <>
              Accès, rectification, retrait du consentement, <b>portabilité</b> (exporte toutes tes
              données en JSON) et <b>effacement complet</b> (supprime ton compte et tout son
              contenu) — les deux sont disponibles en libre-service dans{" "}
              <b>Profil → 🔐 Sécurité</b>, sans formulaire ni délai.
            </>
          ) : (
            <>
              Access, rectification, consent withdrawal, <b>portability</b> (export all your data as
              JSON) and <b>full erasure</b> (delete your account and all its content) — both are
              self-serve in <b>Profile → 🔐 Security</b>, no forms, no waiting.
            </>
          )}
        </Section>

        <Section title={fr ? "Âge minimum" : "Minimum age"}>
          {fr
            ? "Whozin est réservé aux 16 ans et plus. La section rencontres est verrouillée aux 18 ans et plus, au niveau de la base de données."
            : "Whozin is 16+. The dating section is locked to 18+, at the database level."}
        </Section>

        <Section title={fr ? "Conservation" : "Retention"}>
          {fr
            ? "Les check-ins expirent d'eux-mêmes (2 h), les stories après 24 h. Le reste vit tant que ton compte existe. Compte supprimé = données supprimées, immédiatement."
            : "Check-ins expire on their own (2h), stories after 24h. Everything else lives while your account exists. Account deleted = data deleted, immediately."}
        </Section>

        <Section title={fr ? "Responsable & contact" : "Officer & contact"}>
          {fr ? (
            <>
              Responsable de la protection des renseignements personnels : l'équipe Whozin —{" "}
              <span className="text-brand-2">privacy@whozin.app</span>. Toute atteinte à la
              confidentialité présentant un risque sérieux serait notifiée à la Commission d'accès à
              l'information du Québec et aux personnes concernées.
            </>
          ) : (
            <>
              Privacy officer: the Whozin team — <span className="text-brand-2">privacy@whozin.app</span>.
              Any confidentiality incident presenting serious risk would be reported to Québec's
              Commission d'accès à l'information and to affected users.
            </>
          )}
        </Section>
      </div>

      <Link
        href="/feed"
        className="brand-gradient pressable mt-8 inline-block rounded-full px-7 py-3 font-display text-sm font-bold text-white no-underline"
      >
        ← {fr ? "Retour à l'app" : "Back to the app"}
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="font-display text-base font-bold">{title}</h2>
      <p className="mt-1.5 text-sm text-text-dim">{children}</p>
    </section>
  );
}
