import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — AIflex",
  description:
    "Conditions Générales d'Utilisation de la plateforme AIflex.",
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Conditions Générales d'Utilisation"
      eyebrow="CGU"
      lastUpdated="11 avril 2026"
    >
      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (CGU)
        régissent l&apos;accès et l&apos;utilisation de la plateforme
        AIflex (« la Plateforme »), un service de streaming et de
        création de films assistée par intelligence artificielle. En
        utilisant AIflex, vous acceptez sans réserve les présentes CGU.
      </p>

      <h2>2. Création de compte</h2>
      <p>
        L&apos;accès au studio de création nécessite la création d&apos;un
        compte. Vous vous engagez à fournir des informations exactes et à
        protéger la confidentialité de votre mot de passe. Un compte est
        strictement personnel ; tout partage entraînera sa suspension.
      </p>

      <h2>3. Contenu généré par l&apos;utilisateur</h2>
      <p>
        Vous restez propriétaire des idées que vous saisissez dans le
        studio. Les concepts, scénarios, scènes et vidéos générés par
        l&apos;IA à partir de vos saisies vous sont concédés pour un
        usage personnel et la diffusion sur AIflex. Vous garantissez que
        vos saisies ne portent pas atteinte aux droits de tiers (droit
        d&apos;auteur, droit à l&apos;image, marques).
      </p>

      <h2>4. Contenus interdits</h2>
      <p>
        Sont strictement interdits les contenus :
      </p>
      <ul>
        <li>impliquant des mineurs dans des situations sexualisées ;</li>
        <li>
          incitant à la haine, à la violence ou à la discrimination ;
        </li>
        <li>
          reproduisant ou imitant des personnes réelles sans leur
          consentement (deepfakes) ;
        </li>
        <li>
          portant atteinte à des œuvres protégées (franchises, marques,
          personnages existants) ;
        </li>
        <li>à caractère pornographique ou ultra-violent gratuit ;</li>
        <li>
          propageant de la désinformation ou présentant un caractère
          frauduleux.
        </li>
      </ul>
      <p>
        Tout contenu en infraction sera retiré sans préavis et pourra
        entraîner la suspension définitive du compte.
      </p>

      <h2>5. Modération</h2>
      <p>
        AIflex met en œuvre une modération automatisée et humaine. Vous
        pouvez signaler tout contenu inapproprié depuis sa fiche
        publique. Les signalements sont examinés sous 72 heures.
      </p>

      <h2>6. Quotas et coûts de génération</h2>
      <p>
        L&apos;usage du studio IA est soumis à un quota mensuel de
        générations vidéo, configurable par l&apos;équipe AIflex. Une
        offre payante pourra être proposée pour étendre ces quotas.
      </p>

      <h2>7. Responsabilité</h2>
      <p>
        AIflex agit comme hébergeur des contenus générés par ses
        utilisateurs. Le créateur reste seul responsable du respect des
        droits de tiers et des présentes CGU. AIflex ne peut être tenue
        responsable des indisponibilités techniques liées aux modèles IA
        tiers (Anthropic, fal.ai, ByteDance, etc.).
      </p>

      <h2>8. Modification des CGU</h2>
      <p>
        AIflex peut faire évoluer les présentes CGU. Toute modification
        substantielle vous sera notifiée par email ou en application.
      </p>

      <h2>9. Loi applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. Tout litige
        relèvera des tribunaux compétents du lieu du siège social
        d&apos;AIflex.
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute question : <strong>legal@aiflex.app</strong>
      </p>
    </LegalLayout>
  );
}
