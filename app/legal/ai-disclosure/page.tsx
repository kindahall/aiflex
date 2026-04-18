import type { Metadata } from "next";
import LegalLayout from "../LegalLayout";

export const metadata: Metadata = {
  title: "Transparence IA — AIflex",
  description:
    "Comment AIflex utilise l'intelligence artificielle, et comment nous identifions les contenus générés.",
};

export default function AiDisclosurePage() {
  return (
    <LegalLayout
      title="Transparence sur l'IA générative"
      eyebrow="AI disclosure"
      lastUpdated="11 avril 2026"
    >
      <h2>1. Pourquoi cette page</h2>
      <p>
        AIflex est une plateforme dont l&apos;essence même repose sur
        l&apos;intelligence artificielle générative. Conformément à nos
        valeurs de transparence et au futur AI Act européen, cette page
        décrit précisément où et comment l&apos;IA intervient dans la
        Plateforme.
      </p>

      <h2>2. Modèles utilisés</h2>
      <p>
        AIflex orchestre plusieurs modèles, dont la liste exacte est
        configurable par notre équipe et visible dans la page admin
        des paramètres :
      </p>
      <ul>
        <li>
          <strong>Modèles narratifs</strong> : famille Claude
          (Anthropic) — Opus, Sonnet, Haiku — pour la génération du
          concept, du scénario et du découpage en scènes.
        </li>
        <li>
          <strong>Modèles vidéo (text-to-video)</strong> : Seedance 2 Pro
          (ByteDance), Veo 3 (Google), Kling (Kuaishou), Hailuo
          (MiniMax), Dream Machine (Luma), tous accédés via fal.ai.
        </li>
      </ul>

      <h2>3. Identification des contenus IA</h2>
      <p>
        Tout film publié sur AIflex est identifié comme contenu généré
        par IA via :
      </p>
      <ul>
        <li>
          un badge <em>« ✦ Créé sur AIflex »</em> visible sur la fiche
          du film et sur les vignettes du feed ;
        </li>
        <li>
          des métadonnées techniques (à venir) compatibles avec le
          standard C2PA, permettant aux navigateurs et moteurs de
          recherche de tracer l&apos;origine du contenu.
        </li>
      </ul>

      <h2>4. Limites de la génération IA</h2>
      <p>
        Les contenus générés par AIflex peuvent contenir :
      </p>
      <ul>
        <li>
          des incohérences narratives ou visuelles (cohérence des
          personnages, continuité d&apos;une scène à l&apos;autre) ;
        </li>
        <li>
          des hallucinations factuelles si vous demandez des univers
          basés sur des événements réels ;
        </li>
        <li>
          des biais hérités des données d&apos;entraînement des modèles
          tiers.
        </li>
      </ul>
      <p>
        Le rôle du créateur reste central : c&apos;est vous qui validez,
        corrigez et publiez le résultat final.
      </p>

      <h2>5. Garde-fous</h2>
      <p>AIflex met en place plusieurs garde-fous :</p>
      <ul>
        <li>
          un prompt système strict qui interdit aux modèles de générer
          des contenus prohibés (mineurs, violence explicite,
          franchises existantes) ;
        </li>
        <li>
          une vérification automatique des prompts visuels avant leur
          envoi aux modèles vidéo ;
        </li>
        <li>une modération humaine sur signalement.</li>
      </ul>

      <h2>6. Vos données et l&apos;entraînement</h2>
      <p>
        Vos saisies et vos films générés <strong>ne sont jamais
        utilisés pour entraîner les modèles</strong>. Nos contrats avec
        Anthropic et fal.ai l&apos;interdisent explicitement.
      </p>

      <h2>7. Signaler un problème</h2>
      <p>
        Pour signaler un contenu généré problématique, contactez-nous
        à <strong>moderation@aiflex.app</strong>.
      </p>
    </LegalLayout>
  );
}
