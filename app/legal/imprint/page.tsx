import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Mentions légales — AIflex",
  description: "Éditeur du site, hébergeur, contact, directeur de la publication.",
};

export default function ImprintPage() {
  return (
    <LegalLayout
      title="Mentions légales"
      eyebrow="Imprint"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Éditeur du site</h2>
      <p>
        <strong>AIflex SAS</strong>
        <br />
        [Adresse du siège à compléter]
        <br />
        [Ville, code postal, pays]
        <br />
        SIRET : [À compléter]
        <br />
        N° TVA intracommunautaire : [À compléter]
        <br />
        Capital social : [À compléter]
      </p>

      <h2>2. Directeur de la publication</h2>
      <p>[Nom du représentant légal — à compléter]</p>

      <h2>3. Contact</h2>
      <p>
        Email :{" "}
        <a href="mailto:contact@aiflex.com">contact@aiflex.com</a>
        <br />
        Pour les signalements :{" "}
        <a href="mailto:abuse@aiflex.com">abuse@aiflex.com</a>
        <br />
        Pour le juridique :{" "}
        <a href="mailto:legal@aiflex.com">legal@aiflex.com</a>
      </p>

      <h2>4. Hébergeur</h2>
      <p>
        [Nom de l&apos;hébergeur — ex: OVHcloud SAS]
        <br />
        [Adresse]
        <br />
        [Téléphone]
      </p>

      <h2>5. Propriété intellectuelle</h2>
      <p>
        La marque AIflex, son logo, son interface et son code sont
        protégés par les droits d&apos;auteur et de marque. Toute
        reproduction non autorisée est interdite.
      </p>

      <h2>6. Données personnelles</h2>
      <p>
        Consulte notre <a href="/legal/privacy">politique de confidentialité</a>
        {" "}pour le détail du traitement de tes données personnelles.
        Délégué à la Protection des Données (DPO) :{" "}
        <a href="mailto:dpo@aiflex.com">dpo@aiflex.com</a>.
      </p>

      <h2>7. Conservation des logs</h2>
      <p>
        Conformément à la LCEN (FR), les logs de connexion sont conservés
        12 mois. Les logs de modération 24 mois. Les logs de transactions
        Stripe 10 ans (obligations comptables).
      </p>
    </LegalLayout>
  );
}
