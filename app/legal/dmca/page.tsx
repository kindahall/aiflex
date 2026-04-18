import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";
import DMCAForm from "@/components/legal/DMCAForm";

export const metadata: Metadata = {
  title: "Procédure DMCA — AIflex",
  description:
    "Signaler un contenu contrefaisant sur AIflex. Formulaire de takedown DMCA et procédure de contre-notification.",
};

export default function DMCAPage() {
  return (
    <LegalLayout
      title="Procédure DMCA"
      eyebrow="DMCA"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Respect des droits d&apos;auteur</h2>
      <p>
        AIflex respecte la propriété intellectuelle et applique la{" "}
        <strong>Digital Millennium Copyright Act</strong> (DMCA) américaine
        ainsi que la Directive européenne sur le droit d&apos;auteur.
        Tout ayant-droit peut demander le retrait d&apos;un contenu qu&apos;il
        estime contrefaisant.
      </p>

      <h2>2. Comment signaler</h2>
      <p>
        Utilise le formulaire ci-dessous ou envoie un email signé à{" "}
        <a href="mailto:dmca@aiflex.com">dmca@aiflex.com</a> incluant :
      </p>
      <ul>
        <li>ton nom, adresse et coordonnées ;</li>
        <li>l&apos;URL précise du contenu AIflex concerné ;</li>
        <li>la description de l&apos;œuvre originale que tu revendiques ;</li>
        <li>une déclaration de bonne foi ;</li>
        <li>une déclaration sous peine de parjure que tu es l&apos;ayant-droit ou agis en son nom ;</li>
        <li>ta signature physique ou électronique.</li>
      </ul>

      <h2>3. Délai de traitement</h2>
      <p>
        Les demandes valides sont traitées sous <strong>24 heures ouvrées</strong>.
        Le contenu est retiré et le créateur notifié. Il peut alors
        déposer une <strong>contre-notification</strong> sous 10 jours.
      </p>

      <h2>4. Contre-notification</h2>
      <p>
        Si ton contenu a été retiré à tort, tu peux contester en nous
        écrivant avec les mêmes éléments que le signalement initial, plus :
      </p>
      <ul>
        <li>la déclaration sous peine de parjure que le retrait résulte d&apos;une erreur ou mauvaise identification ;</li>
        <li>ton consentement à la juridiction des tribunaux de Paris et à recevoir signification du plaignant initial.</li>
      </ul>

      <h2>5. Signalements abusifs</h2>
      <p>
        Tout signalement frauduleux ou répété de mauvaise foi peut
        entraîner la suspension du compte de l&apos;émetteur et des poursuites.
      </p>

      <h2>6. Formulaire</h2>
      <DMCAForm />

      <h2>7. Contact</h2>
      <p>
        Email officiel DMCA :{" "}
        <a href="mailto:dmca@aiflex.com">dmca@aiflex.com</a>.
      </p>
    </LegalLayout>
  );
}
