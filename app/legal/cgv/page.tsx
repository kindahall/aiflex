import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Conditions Générales de Vente — AIflex",
  description:
    "Modalités d'achat, de paiement, de remboursement et d'exécution des services payants sur AIflex.",
};

export default function CGVPage() {
  return (
    <LegalLayout
      title="Conditions Générales de Vente"
      eyebrow="CGV"
      lastUpdated="14 avril 2026"
    >
      <h2>1. Services payants</h2>
      <p>
        AIflex propose deux catégories de services payants : (a) les
        abonnements mensuels ou annuels donnant accès au catalogue
        (Light, Premium, Famille), et (b) les générations de contenu à la
        carte (films, séries, suites, uploads, boosts, publicités).
      </p>

      <h2>2. Prix et facturation</h2>
      <p>
        Les prix sont affichés en dollars américains (USD), TVA
        applicable en sus selon ton pays de résidence (MOSS UE pour les
        consommateurs européens). Le paiement est traité par Stripe et
        exécuté au moment de la commande.
      </p>

      <h2>3. Abonnements</h2>
      <p>
        Les abonnements sont reconduits tacitement à chaque échéance.
        Tu peux résilier à tout moment depuis ton espace compte — l&apos;accès
        est maintenu jusqu&apos;à la fin de la période en cours, sans
        remboursement au prorata.
      </p>

      <h2>4. Générations à la carte</h2>
      <p>
        Le paiement d&apos;une génération vidéo déclenche immédiatement une
        consommation d&apos;API auprès de nos prestataires. Conformément à
        l&apos;article L221-28 du Code de la consommation, le droit de
        rétractation ne s&apos;applique pas aux contenus numériques dont
        l&apos;exécution a commencé après accord exprès de l&apos;utilisateur.
      </p>

      <h2>5. Refus et avoir</h2>
      <p>
        Si un upload public est refusé par la modération admin, un avoir
        du montant payé est automatiquement crédité sur ton compte (champ
        <code>credits</code>). Aucun remboursement bancaire direct.
        L&apos;avoir est utilisable indéfiniment sur toute future commande.
      </p>

      <h2>6. Revenus créateurs</h2>
      <p>
        Les créateurs perçoivent 50 % de la valeur mensuelle des vues
        qualifiées sur leurs œuvres, selon la formule décrite dans les
        CGU créateurs. Le versement s&apos;effectue via Stripe Connect, seuil
        minimum de 10 USD, avec 2 % de frais de traitement. Sous le seuil,
        le solde est reporté au mois suivant.
      </p>

      <h2>7. Publicité annonceurs</h2>
      <p>
        Les annonceurs achètent des impressions au CPM auprès d&apos;AIflex,
        prépayé ou facturé mensuellement. Les budgets non consommés
        restent utilisables 12 mois après leur achat.
      </p>

      <h2>8. Litiges</h2>
      <p>
        Toute contestation relative à un paiement doit être notifiée par
        email à <a href="mailto:support@aiflex.com">support@aiflex.com</a>{" "}
        dans un délai de 30 jours. À défaut, l&apos;achat est réputé accepté.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question commerciale :{" "}
        <a href="mailto:billing@aiflex.com">billing@aiflex.com</a>.
      </p>
    </LegalLayout>
  );
}
