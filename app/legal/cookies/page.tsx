import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Politique de cookies — AIflex",
  description: "Types de cookies utilisés, finalités, et comment les contrôler.",
};

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Politique de cookies"
      eyebrow="Cookies"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Ce qu&apos;est un cookie</h2>
      <p>
        Un cookie est un petit fichier texte déposé par ton navigateur
        lorsque tu visites un site. Il permet au site de se souvenir de
        toi (ta session, tes préférences) ou de mesurer ton usage à des
        fins d&apos;amélioration.
      </p>

      <h2>2. Catégories utilisées sur AIflex</h2>
      <h3>Essentiels (toujours actifs)</h3>
      <p>
        Indispensables au fonctionnement : cookie de session
        <code>aiflex_session</code>, consentement, choix de langue,
        protection anti-CSRF. Pas de base légale au consentement car
        techniques.
      </p>
      <h3>Analytics (opt-in)</h3>
      <p>
        Mesure d&apos;audience via PostHog auto-hébergé : pages consultées,
        temps passé, funnels de conversion. Anonymisés (pas d&apos;IP brute
        conservée après agrégation). Désactivables dans le bandeau ou
        depuis{" "}
        <a href="/account/privacy">/account/privacy</a>.
      </p>
      <h3>Marketing (opt-in)</h3>
      <p>
        Tracking des campagnes d&apos;affiliation et des codes de parrainage.
        Désactivés par défaut dans l&apos;UE.
      </p>

      <h2>3. Durée de conservation</h2>
      <p>
        Session : jusqu&apos;à 30 jours après ta dernière visite. Analytics :
        13 mois maximum. Marketing : 90 jours.
      </p>

      <h2>4. Contrôle</h2>
      <p>
        Tu peux à tout moment rouvrir le bandeau de consentement, ajuster
        tes choix dans <a href="/account/privacy">/account/privacy</a>,
        ou bloquer/supprimer les cookies depuis les paramètres de ton
        navigateur.
      </p>

      <h2>5. Base légale</h2>
      <p>
        Cookies essentiels : intérêt légitime (art. 6.1.f RGPD). Cookies
        analytics et marketing : consentement explicite (art. 6.1.a RGPD,
        directive ePrivacy).
      </p>

      <h2>6. Contact</h2>
      <p>
        Pour toute question relative à notre politique de cookies :{" "}
        <a href="mailto:privacy@aiflex.com">privacy@aiflex.com</a>.
      </p>
    </LegalLayout>
  );
}
