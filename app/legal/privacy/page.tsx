import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Politique de confidentialité — AIflex",
  description:
    "Comment AIflex collecte, utilise et protège vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      eyebrow="Privacy"
      lastUpdated="11 avril 2026"
    >
      <h2>1. Responsable de traitement</h2>
      <p>
        Le responsable du traitement des données personnelles collectées
        sur AIflex est l&apos;équipe AIflex, joignable à{" "}
        <strong>privacy@aiflex.app</strong>.
      </p>

      <h2>2. Données collectées</h2>
      <p>Lors de votre utilisation de la Plateforme, nous collectons :</p>
      <ul>
        <li>
          <strong>Données de compte</strong> : adresse email, nom public,
          mot de passe (haché via scrypt) ;
        </li>
        <li>
          <strong>Données de création</strong> : idées, concepts,
          scénarios, scènes, vidéos générées ;
        </li>
        <li>
          <strong>Données d&apos;usage</strong> : nombre de générations,
          films publiés, likes donnés, watchlist ;
        </li>
        <li>
          <strong>Cookies techniques</strong> : un cookie de session
          httpOnly nécessaire à votre authentification.
        </li>
      </ul>

      <h2>3. Finalités</h2>
      <p>Vos données sont traitées pour :</p>
      <ul>
        <li>permettre votre authentification et l&apos;usage du studio ;</li>
        <li>assurer la modération des contenus publiés ;</li>
        <li>
          calculer vos quotas de génération et prévenir les abus ;
        </li>
        <li>
          améliorer la qualité du service (statistiques anonymisées).
        </li>
      </ul>

      <h2>4. Sous-traitants</h2>
      <p>
        Pour fournir le service, vos saisies sont transmises aux
        fournisseurs de modèles IA suivants :
      </p>
      <ul>
        <li>
          <strong>Anthropic</strong> (Claude) — pour la génération
          narrative (concept, scénario, découpage) ;
        </li>
        <li>
          <strong>fal.ai</strong> et son réseau de modèles vidéo
          (ByteDance, Google, Kuaishou, MiniMax, Luma…) — pour la
          génération des plans vidéo.
        </li>
      </ul>
      <p>
        Ces fournisseurs sont engagés contractuellement à ne pas
        réutiliser vos saisies pour entraîner leurs propres modèles.
      </p>

      <h2>5. Durée de conservation</h2>
      <ul>
        <li>Compte actif : tant que le compte existe.</li>
        <li>
          Compte supprimé : effacement immédiat des données personnelles
          et des projets associés.
        </li>
        <li>
          Logs techniques : 30 jours, puis purge automatique.
        </li>
      </ul>

      <h2>6. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès,
        de rectification, d&apos;effacement, de portabilité et
        d&apos;opposition au traitement de vos données. Pour exercer
        ces droits : <strong>privacy@aiflex.app</strong>.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Les mots de passe sont stockés sous forme de hash scrypt avec
        sel aléatoire. Les sessions sont des cookies httpOnly,
        SameSite=Lax. Toutes les communications passent en HTTPS en
        production.
      </p>

      <h2>8. Cookies</h2>
      <p>
        AIflex n&apos;utilise qu&apos;un cookie strictement nécessaire
        (cookie de session). Aucun cookie publicitaire ou de suivi
        tiers.
      </p>
    </LegalLayout>
  );
}
