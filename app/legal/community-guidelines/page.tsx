import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Règles de la communauté — AIflex",
  description: "Ce qui est attendu, encouragé, et strictement interdit sur AIflex.",
};

export default function CommunityPage() {
  return (
    <LegalLayout
      title="Règles de la communauté"
      eyebrow="Communauté"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Ce qu&apos;on veut</h2>
      <p>
        AIflex existe pour que chacun puisse raconter des histoires en
        vidéo. On célèbre la créativité, l&apos;originalité, la diversité des
        regards, et la curiosité qui pousse à générer la suite d&apos;un film
        qu&apos;on a aimé — même si ce n&apos;est pas le sien.
      </p>

      <h2>2. Ce qui est interdit</h2>
      <ul>
        <li>Contenus impliquant des mineurs en situation sexualisée, violente ou inappropriée (suspension immédiate, signalement aux autorités).</li>
        <li>Haine, racisme, sexisme, homophobie, transphobie, apologie du terrorisme.</li>
        <li>Harcèlement ciblé, doxing, menaces.</li>
        <li>Contrefaçon manifeste (reprise d&apos;une franchise protégée, plagiat intégral).</li>
        <li>Nudité explicite en dehors des sections vérifiées par âge.</li>
        <li>Spam, liens malveillants, promotion d&apos;arnaques.</li>
      </ul>

      <h2>3. Critique oui, agression non</h2>
      <p>
        La critique honnête fait partie d&apos;une communauté saine. Dire
        « j&apos;ai pas aimé », « c&apos;est lent » ou « l&apos;écriture est faible »
        est parfaitement autorisé. Viser une personne pour blesser
        (insulte, moquerie ciblée) ne l&apos;est pas.
      </p>

      <h2>4. Suites et désaveu</h2>
      <p>
        Si tu génères la suite d&apos;un film qui n&apos;est pas le tien, respecte
        l&apos;œuvre originale. Ne cherche pas à dénaturer, ridiculiser ou
        détourner le propos du créateur initial. Il peut désavouer une
        suite qui nuit à son univers.
      </p>

      <h2>5. Transparence IA</h2>
      <p>
        Tous les films générés sur AIflex portent un watermark « Généré
        par IA » conformément à la réglementation européenne. Ne tente
        pas de le retirer ni de faire passer un film IA pour une œuvre
        non-générée.
      </p>

      <h2>6. Signalements</h2>
      <p>
        Un bouton « Signaler » est disponible sur chaque film, commentaire
        et profil. Les signalements abusifs (trolling, signalements en
        masse) peuvent eux-mêmes entraîner une sanction.
      </p>

      <h2>7. Sanctions</h2>
      <ul>
        <li>Avertissement → rappel par email.</li>
        <li>Retrait de contenu → démonétisation.</li>
        <li>Suspension temporaire ou permanente du compte.</li>
        <li>Signalement aux autorités compétentes dans les cas graves.</li>
      </ul>

      <h2>8. Contact</h2>
      <p>
        Pour signaler un problème :{" "}
        <a href="mailto:abuse@aiflex.com">abuse@aiflex.com</a>.
      </p>
    </LegalLayout>
  );
}
