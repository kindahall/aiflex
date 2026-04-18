import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Conditions créateurs — AIflex",
  description: "Cession des droits, royalties, suites et revenus pour les créateurs AIflex.",
};

export default function CreatorTermsPage() {
  return (
    <LegalLayout
      title="Conditions créateurs"
      eyebrow="CGU créateurs"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Qualité de créateur</h2>
      <p>
        En publiant un film sur AIflex en mode <code>public</code>, tu
        deviens créateur au sens des présentes. Les créations en mode{" "}
        <code>private</code> ou <code>private_circle</code> ne sont pas
        soumises à ce document.
      </p>

      <h2>2. Licence accordée à AIflex</h2>
      <p>
        Tu accordes à AIflex une licence <strong>non-exclusive, mondiale,
        gratuite</strong> de reproduction, représentation, adaptation
        technique (transcodage, thumbnails, sous-titres, dubbing) et de
        communication au public, pour toute la durée de la publication.
        Cette licence prend fin à la suppression du film.
      </p>
      <p>
        Tu conserves la <strong>propriété pleine et entière</strong> de tes
        œuvres. Rien dans ce document n&apos;opère cession patrimoniale.
      </p>

      <h2>3. Garanties du créateur</h2>
      <ul>
        <li>
          Tu garantis que tu détiens les droits nécessaires sur l&apos;idée de
          départ et, pour les uploads, sur le matériel vidéo.
        </li>
        <li>
          Tu t&apos;interdis toute contrefaçon, diffamation, atteinte à la vie
          privée, et tout contenu impliquant des mineurs en situation
          inappropriée.
        </li>
        <li>
          Tu nous indemnises de toute réclamation fondée sur une violation
          de ces garanties.
        </li>
      </ul>

      <h2>4. Suites (clef d&apos;AiFlex)</h2>
      <p>
        Si tu actives <code>allowSequels = true</code> sur un film public, tu
        permets à <strong>tout abonné</strong> de générer une suite à partir de
        ton œuvre, même sans ta permission individuelle. Tu perçois une
        <strong> royalty</strong> configurable (5, 10, 15 ou 20 %) sur chaque
        vue qualifiée de la suite.
      </p>
      <p>
        Tu disposes d&apos;un <strong>droit de désaveu</strong> : à tout moment,
        tu peux retirer une suite de l&apos;arbre de ton film. La suite reste
        accessible par lien direct mais cesse de percevoir ta royalty au
        mois suivant. Si tu actives <code>requireSequelApproval</code>,
        les suites ne sont publiées qu&apos;après validation de ta part.
      </p>

      <h2>5. Partage des revenus</h2>
      <p>
        La valeur d&apos;une vue est calculée de manière « Spotify » :
        <code>prix_abonnement / nb_films_vus_dans_le_mois</code>.
      </p>
      <p>
        Pour chaque vue qualifiée (≥ 30 % de complétion) :
      </p>
      <ul>
        <li>100 % complété → 50 % pour le créateur</li>
        <li>70–99 % → 35 %</li>
        <li>30–69 % → 15 %</li>
        <li>&lt; 30 % → 0 %</li>
      </ul>
      <p>
        Les collaborateurs reçoivent une part selon la grille{" "}
        <code>CollaboratorSplit</code>. Le créateur original d&apos;un film dont
        une suite est visionnée reçoit la royalty choisie.
      </p>

      <h2>6. Versement (Stripe Connect)</h2>
      <p>
        Les payouts sont calculés le 1er de chaque mois. Versement via
        Stripe Connect (onboarding Express). <strong>Seuil minimum 10 USD</strong>,
        frais AiFlex de 2 %. Sous le seuil, le solde est reporté.
      </p>

      <h2>7. Modération et retrait</h2>
      <p>
        AIflex se réserve le droit de démonétiser, retirer, ou ne pas
        publier une œuvre pour non-respect des CGU ou des règles
        communautaires, avec ou sans avis selon la gravité. En cas de
        refus d&apos;un upload public, un avoir est crédité (voir CGV).
      </p>

      <h2>8. Résiliation</h2>
      <p>
        Tu peux retirer toute œuvre à tout moment. Les payouts déjà
        calculés restent acquis. Les droits déjà versés ne sont pas
        récupérables.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question créateur :{" "}
        <a href="mailto:creators@aiflex.com">creators@aiflex.com</a>.
      </p>
    </LegalLayout>
  );
}
