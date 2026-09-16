import type { PlacementQuestion } from "../questions";

/**
 * French placement bank: one vocabulary + one grammar + one reading item
 * per CEFR level (A1–C2), 18 items total. Content is written IN French —
 * this is what the original bug got wrong: a French learner must be
 * tested in French, not English.
 */
export const FR_PLACEMENT_BANK: PlacementQuestion[] = [
  // A1
  {
    id: "fr-a1-vocab",
    level: "A1",
    category: "vocabulary",
    prompt: "Choisissez le mot qui signifie « un endroit où on achète de la nourriture ».",
    options: [
      { id: "a", label: "Bibliothèque" },
      { id: "b", label: "Supermarché" },
      { id: "c", label: "Hôpital" },
      { id: "d", label: "Aéroport" },
    ],
    correctOptionId: "b",
  },
  {
    id: "fr-a1-grammar",
    level: "A1",
    category: "grammar",
    prompt: "Choisissez la phrase correcte.",
    options: [
      { id: "a", label: "Elle vas au travail tous les jours." },
      { id: "b", label: "Elle va au travail tous les jours." },
      { id: "c", label: "Elle aller au travail tous les jours." },
      { id: "d", label: "Elle allé au travail tous les jours." },
    ],
    correctOptionId: "b",
  },
  {
    id: "fr-a1-reading",
    level: "A1",
    category: "reading",
    prompt: "Lisez : « Tom a un chien. Le chien est petit et marron. » De quelle couleur est le chien ?",
    options: [
      { id: "a", label: "Noir" },
      { id: "b", label: "Blanc" },
      { id: "c", label: "Marron" },
      { id: "d", label: "Gris" },
    ],
    correctOptionId: "c",
  },
  // A2
  {
    id: "fr-a2-vocab",
    level: "A2",
    category: "vocabulary",
    prompt: "Quel est le contraire de « cher » ?",
    options: [
      { id: "a", label: "Bon marché" },
      { id: "b", label: "Lourd" },
      { id: "c", label: "Rapide" },
      { id: "d", label: "Lumineux" },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-a2-grammar",
    level: "A2",
    category: "grammar",
    prompt: "Choisissez le passé composé correct de « aller » (elle).",
    options: [
      { id: "a", label: "Elle a allé au marché." },
      { id: "b", label: "Elle est allée au marché." },
      { id: "c", label: "Elle allait au marché." },
      { id: "d", label: "Elle va aller au marché." },
    ],
    correctOptionId: "b",
  },
  {
    id: "fr-a2-reading",
    level: "A2",
    category: "reading",
    prompt:
      "Lisez : « Maria travaille dans une petite boulangerie. Elle commence tôt le matin et termine avant midi. » À quelle heure Maria commence-t-elle probablement à travailler ?",
    options: [
      { id: "a", label: "Très tôt le matin" },
      { id: "b", label: "Tard le soir" },
      { id: "c", label: "L'après-midi" },
      { id: "d", label: "Après le dîner" },
    ],
    correctOptionId: "a",
  },
  // B1
  {
    id: "fr-b1-vocab",
    level: "B1",
    category: "vocabulary",
    prompt: "Choisissez le mot le plus proche de « énorme ».",
    options: [
      { id: "a", label: "Minuscule" },
      { id: "b", label: "Immense" },
      { id: "c", label: "Calme" },
      { id: "d", label: "Étroit" },
    ],
    correctOptionId: "b",
  },
  {
    id: "fr-b1-grammar",
    level: "B1",
    category: "grammar",
    prompt: "Complétez : « S'il pleut demain, nous ___ à la maison. »",
    options: [
      { id: "a", label: "restons" },
      { id: "b", label: "resterons" },
      { id: "c", label: "restions" },
      { id: "d", label: "resté" },
    ],
    correctOptionId: "b",
  },
  {
    id: "fr-b1-reading",
    level: "B1",
    category: "reading",
    prompt:
      "Lisez : « Bien qu'il soit fatigué après une longue journée de travail, Jacques a décidé de courir parce qu'il voulait se vider la tête avant le week-end. » Pourquoi Jacques a-t-il couru ?",
    options: [
      { id: "a", label: "Il n'était pas du tout fatigué" },
      { id: "b", label: "Pour se vider la tête" },
      { id: "c", label: "Parce que c'était le week-end" },
      { id: "d", label: "Son patron lui a demandé de le faire" },
    ],
    correctOptionId: "b",
  },
  // B2
  {
    id: "fr-b2-vocab",
    level: "B2",
    category: "vocabulary",
    prompt: "Quel mot est le plus proche de « réticent » ?",
    options: [
      { id: "a", label: "Peu disposé" },
      { id: "b", label: "Enthousiaste" },
      { id: "c", label: "Confiant" },
      { id: "d", label: "Curieux" },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-b2-grammar",
    level: "B2",
    category: "grammar",
    prompt: "Choisissez la phrase correcte.",
    options: [
      { id: "a", label: "Le rapport a été terminé par l'équipe avant la date limite." },
      { id: "b", label: "Le rapport a été terminée par l'équipe avant la date limite." },
      { id: "c", label: "Le rapport était terminé pour l'équipe avant la date limite." },
      { id: "d", label: "L'équipe a été terminé le rapport avant la date limite." },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-b2-reading",
    level: "B2",
    category: "reading",
    prompt:
      "Lisez : « L'entreprise avait promis une décision pour vendredi, mais au fil de la semaine, les employés ont remarqué un silence particulier de la direction — un silence qui, en soi, en disait plus long qu'une annonce. » Que suggère ce passage ?",
    options: [
      { id: "a", label: "La direction a fait une annonce positive vendredi" },
      { id: "b", label: "Le manque de communication laissait présager de mauvaises nouvelles" },
      { id: "c", label: "Les employés ont été informés à temps" },
      { id: "d", label: "L'entreprise n'avait aucune décision à prendre" },
    ],
    correctOptionId: "b",
  },
  // C1
  {
    id: "fr-c1-vocab",
    level: "C1",
    category: "vocabulary",
    prompt: "Complétez : « Malgré ce revers, elle est restée ___ quant au succès du projet. »",
    options: [
      { id: "a", label: "optimiste" },
      { id: "b", label: "indifférente" },
      { id: "c", label: "inconsciente" },
      { id: "d", label: "rancunière" },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-c1-grammar",
    level: "C1",
    category: "grammar",
    prompt: "Choisissez la phrase correcte.",
    options: [
      { id: "a", label: "Si elle avait su pour la réunion, elle y serait allée." },
      { id: "b", label: "Si elle a su pour la réunion, elle ira." },
      { id: "c", label: "Si elle aurait su pour la réunion, elle serait allée." },
      { id: "d", label: "Si elle savait pour la réunion, elle aura été." },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-c1-reading",
    level: "C1",
    category: "reading",
    prompt:
      "Lisez : « Ce n'est pas qu'il manquait d'ambition ; il s'était plutôt mis à se méfier de la notion même d'ambition, l'ayant vue vider de leur substance tous ceux qu'il admirait. » Que suggère l'auteur à propos de cette personne ?",
    options: [
      { id: "a", label: "Il n'a jamais voulu réussir" },
      { id: "b", label: "Il évitait l'ambition à cause de ce qu'il avait vu chez les autres" },
      { id: "c", label: "Il admirait les gens qui travaillaient dur" },
      { id: "d", label: "Il ne savait pas que l'ambition existait" },
    ],
    correctOptionId: "b",
  },
  // C2
  {
    id: "fr-c2-vocab",
    level: "C2",
    category: "vocabulary",
    prompt:
      "Quelle expression décrit le mieux un compliment qui est en réalité une critique déguisée ?",
    options: [
      { id: "a", label: "Un compliment empoisonné" },
      { id: "b", label: "Un compliment sincère" },
      { id: "c", label: "Un compliment banal" },
      { id: "d", label: "Un compliment mérité" },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-c2-grammar",
    level: "C2",
    category: "grammar",
    prompt: "Choisissez la phrase qui exprime le mieux le regret d'une occasion manquée.",
    options: [
      { id: "a", label: "Ce n'est que maintenant que je réalise ce que j'ai laissé m'échapper." },
      { id: "b", label: "C'est maintenant je réalise ce que j'ai laissé m'échapper." },
      { id: "c", label: "Ce n'est que maintenant que je réaliserai ce que j'avais laissé m'échapper." },
      { id: "d", label: "Ce n'est que maintenant que j'ai réalisé ce que je laisse m'échapper." },
    ],
    correctOptionId: "a",
  },
  {
    id: "fr-c2-reading",
    level: "C2",
    category: "reading",
    prompt:
      "Lisez : « Que les négociations aient réussi tenait, en fin de compte, moins à un triomphe de la diplomatie qu'au fait qu'aucune des deux parties n'avait plus grand-chose à perdre. » Qu'est-ce que l'auteur sous-entend à propos des négociations ?",
    options: [
      { id: "a", label: "La diplomatie habile est la principale raison de leur succès" },
      { id: "b", label: "Elles ont réussi en partie parce que les deux parties avaient peu à risquer" },
      { id: "c", label: "Une partie avait clairement plus à perdre que l'autre" },
      { id: "d", label: "Les négociations ont finalement échoué" },
    ],
    correctOptionId: "b",
  },
];
