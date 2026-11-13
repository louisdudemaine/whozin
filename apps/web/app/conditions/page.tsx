"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 📋 Conditions d'utilisation — page publique, lisible sans compte (lien depuis l'inscription mobile).
 * Apple 1.2 (contenu des utilisateurs) : règles acceptées à l'inscription, aucune tolérance pour les
 * contenus et comportements abusifs, signalement, blocage, contact.
 */
export default function TermsPage() {
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
        📋 {fr ? "Conditions d'utilisation" : "Terms of use"}
      </h1>
      <p className="mt-1 text-sm text-text-dim">
        {fr ? "Dernière mise à jour : 13 novembre 2026" : "Last updated: November 13, 2026"}
      </p>

      <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-text">
        <Section title={fr ? "Qui peut utiliser Whozin" : "Who can use Whozin"}>
          {fr
            ? "Whozin est réservé aux personnes de 16 ans et plus. Tu donnes ta vraie date de naissance et tu n'utilises qu'un seul compte, le tien."
            : "Whozin is for people aged 16 and over. You give your real date of birth and use only one account: your own."}
        </Section>

        <Section title={fr ? "Aucune tolérance pour les abus" : "Zero tolerance for abuse"}>
          {fr
            ? "Sont interdits, sans exception : le harcèlement, les menaces et l'intimidation ; les propos haineux ; le contenu sexuel, et tout contenu sexualisant une personne mineure ; la violence ou son apologie ; l'usurpation d'identité ; le spam et les arnaques ; partager la position ou les photos de quelqu'un sans son accord ; tout ce qui est illégal."
            : "Strictly forbidden: harassment, threats and intimidation; hate speech; sexual content, and any content sexualizing a minor; violence or its glorification; impersonation; spam and scams; sharing someone's location or photos without their consent; anything illegal."}
        </Section>

        <Section title={fr ? "Signaler et bloquer" : "Report and block"}>
          {fr
            ? "Dans l'app, le menu ⋯ d'une publication, d'une présence ou d'une conversation permet de signaler ou de bloquer, et un appui long sur un message reçu fait de même ; sur le web, le menu ⋯ d'une publication, d'une story ou d'un profil. Le blocage est immédiat : vous ne voyez plus vos publications ni vos présences, dans les deux sens, et vous ne pouvez plus vous écrire en privé."
            : "In the app, the ⋯ menu on a post, a check-in or a conversation lets you report or block, and long-pressing a received message does the same; on the web, the ⋯ menu on a post, a story or a profile. Blocking is immediate: you no longer see each other's posts or check-ins, both ways, and you can no longer message each other privately."}
        </Section>

        <Section title={fr ? "Ce que nous faisons d'un signalement" : "What we do with a report"}>
          {fr
            ? "Nous examinons chaque signalement dans les 24 heures. Le contenu qui enfreint ces règles est retiré, et le compte de son auteur peut être suspendu ou supprimé."
            : "We review every report within 24 hours. Content that breaks these rules is removed, and its author's account may be suspended or deleted."}
        </Section>

        <Section title={fr ? "Ton contenu" : "Your content"}>
          {fr
            ? "Ce que tu publies reste à toi. Tu nous permets seulement de l'afficher aux personnes que tu as choisies, dans l'app. Tes présences expirent d'elles-mêmes, et supprimer ton compte efface tout ton contenu."
            : "What you post stays yours. You only allow us to show it, in the app, to the people you chose. Your check-ins expire on their own, and deleting your account erases all your content."}
        </Section>

        <Section title={fr ? "Ta position et ta sécurité" : "Your location and your safety"}>
          {fr
            ? "C'est toi qui décides quand et avec qui tu partages où tu es. Ne te mets pas en danger pour une publication. Whozin ne remplace pas les services d'urgence : en cas de danger, compose le 911."
            : "You decide when, and with whom, you share where you are. Never put yourself at risk for a post. Whozin does not replace emergency services: if you are in danger, call 911."}
        </Section>

        <Section title={fr ? "Quitter Whozin" : "Leaving Whozin"}>
          {fr
            ? "Tu peux supprimer ton compte en tout temps : dans l'app (Profil, puis Supprimer mon compte) ou sur le web (Sécurité). Nous pouvons fermer un compte qui enfreint ces conditions."
            : "You can delete your account at any time: in the app (Profile, then Delete my account) or on the web (Security). We may close an account that breaks these terms."}
        </Section>

        <Section title={fr ? "Droit applicable et contact" : "Governing law and contact"}>
          {fr ? (
            <>
              Ces conditions relèvent des lois du Québec. Une question ou un problème :{" "}
              <span className="text-brand-2">privacy@whozin.app</span>. Voir aussi la{" "}
              <Link href="/confidentialite">politique de confidentialité</Link>.
            </>
          ) : (
            <>
              These terms are governed by the laws of Québec. Questions or problems:{" "}
              <span className="text-brand-2">privacy@whozin.app</span>. See also the{" "}
              <Link href="/confidentialite">privacy policy</Link>.
            </>
          )}
        </Section>
      </div>

      <Link
        href="/"
        className="brand-gradient pressable mt-8 inline-block rounded-full px-7 py-3 font-display text-sm font-bold text-white no-underline"
      >
        ← {fr ? "Accueil Whozin" : "Whozin home"}
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
