// Schéma du questionnaire de CV — identique pour tous les designs.
// Chaque réponse est ensuite injectée dans le design choisi à la position prévue.

// Réponses vides (structure de référence). Toute nouvelle donnée doit y figurer.
export function emptyAnswers() {
  return {
    prenom: '',
    nom: '',
    titre: '',        // Titre du CV (ex : « Développeur Full-Stack »)
    email: '',
    telephone: '',
    ville: '',
    photo: '',        // dataURL optionnelle
    resume: '',       // Résumé / accroche
    objectif: '',     // Objectif professionnel
    portfolio: '',    // URL portfolio
    experiences: [],  // { id, poste, entreprise, ville, debut, fin, description }
    diplomes: [],     // { id, intitule, ecole, ville, debut, fin, description }
    competences: [],  // [string]
    langues: [],      // { id, langue, niveau }
    interets: [],     // [string]
    reseaux: [],      // { id, label, url }
    typeKeywords: '', // Dernière question : « Quel type de CV souhaitez-vous ? »
  }
}

// Niveaux de langue proposés.
export const LANG_LEVELS = ['Notions', 'Intermédiaire', 'Courant', 'Bilingue', 'Langue maternelle']

// Étapes du questionnaire (wizard). Les champs « list » sont des tableaux d'objets répétables.
export const STEPS = [
  {
    id: 'identite', title: 'Identité', icon: 'User',
    fields: [
      { key: 'prenom', label: 'Prénom', type: 'text', placeholder: 'Marie', required: true },
      { key: 'nom', label: 'Nom', type: 'text', placeholder: 'Dupont', required: true },
      { key: 'titre', label: 'Titre du CV', type: 'text', placeholder: 'Développeuse Full-Stack' },
      { key: 'photo', label: 'Photo (optionnelle)', type: 'photo' },
    ],
  },
  {
    id: 'contact', title: 'Coordonnées', icon: 'Mail',
    fields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'marie.dupont@email.com' },
      { key: 'telephone', label: 'Téléphone', type: 'text', placeholder: '06 12 34 56 78' },
      { key: 'ville', label: 'Ville', type: 'text', placeholder: 'Paris' },
      { key: 'portfolio', label: 'Portfolio (URL)', type: 'text', placeholder: 'monsite.com' },
    ],
  },
  {
    id: 'profil', title: 'Profil', icon: 'FileText',
    fields: [
      { key: 'resume', label: 'Résumé / accroche', type: 'textarea', placeholder: 'Quelques phrases qui vous présentent…' },
      { key: 'objectif', label: 'Objectif professionnel', type: 'textarea', placeholder: 'Le poste ou la mission que vous visez…' },
    ],
  },
  {
    id: 'experiences', title: 'Expériences', icon: 'Briefcase',
    list: 'experiences',
    itemLabel: 'expérience',
    fields: [
      { key: 'poste', label: 'Poste', type: 'text', placeholder: 'Développeuse Front-End' },
      { key: 'entreprise', label: 'Entreprise', type: 'text', placeholder: 'Acme Corp' },
      { key: 'ville', label: 'Ville', type: 'text', placeholder: 'Lyon' },
      { key: 'debut', label: 'Début', type: 'text', placeholder: '2021' },
      { key: 'fin', label: 'Fin', type: 'text', placeholder: 'Aujourd’hui' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Vos missions et résultats…' },
    ],
  },
  {
    id: 'diplomes', title: 'Diplômes', icon: 'GraduationCap',
    list: 'diplomes',
    itemLabel: 'diplôme',
    fields: [
      { key: 'intitule', label: 'Intitulé', type: 'text', placeholder: 'Master Informatique' },
      { key: 'ecole', label: 'École / Université', type: 'text', placeholder: 'Université de Paris' },
      { key: 'ville', label: 'Ville', type: 'text', placeholder: 'Paris' },
      { key: 'debut', label: 'Début', type: 'text', placeholder: '2016' },
      { key: 'fin', label: 'Fin', type: 'text', placeholder: '2018' },
      { key: 'description', label: 'Mention / détails', type: 'textarea', placeholder: 'Mention Très Bien…' },
    ],
  },
  {
    id: 'competences', title: 'Compétences', icon: 'Sparkles',
    tags: 'competences',
    placeholder: 'Ajouter une compétence (ex : React)',
  },
  {
    id: 'langues', title: 'Langues', icon: 'Languages',
    list: 'langues',
    itemLabel: 'langue',
    compact: true,
    fields: [
      { key: 'langue', label: 'Langue', type: 'text', placeholder: 'Anglais' },
      { key: 'niveau', label: 'Niveau', type: 'select', options: LANG_LEVELS },
    ],
  },
  {
    id: 'interets', title: 'Centres d’intérêt', icon: 'Heart',
    tags: 'interets',
    placeholder: 'Ajouter un centre d’intérêt (ex : Photographie)',
  },
  {
    id: 'reseaux', title: 'Réseaux sociaux', icon: 'Share2',
    list: 'reseaux',
    itemLabel: 'réseau',
    compact: true,
    fields: [
      { key: 'label', label: 'Réseau', type: 'text', placeholder: 'LinkedIn' },
      { key: 'url', label: 'Lien', type: 'text', placeholder: 'linkedin.com/in/marie' },
    ],
  },
  {
    id: 'type', title: 'Type de CV', icon: 'Wand2',
    fields: [
      { key: 'typeKeywords', label: 'Quel type de CV souhaitez-vous ?', type: 'textarea',
        placeholder: 'Décrivez le style recherché avec des mots-clés : moderne, créatif, tech, minimaliste, corporate, luxe, coloré…' },
    ],
  },
]

// Jeu de réponses d'exemple (utilisé pour les aperçus de designs et le test de fumée).
export function sampleAnswers() {
  return {
    ...emptyAnswers(),
    prenom: 'Marie', nom: 'Dupont', titre: 'Développeuse Full-Stack',
    email: 'marie.dupont@email.com', telephone: '06 12 34 56 78', ville: 'Paris',
    portfolio: 'marie-dupont.dev',
    resume: 'Développeuse passionnée avec 6 ans d’expérience dans la conception d’applications web performantes et accessibles.',
    objectif: 'Rejoindre une équipe produit ambitieuse pour concevoir des interfaces qui allient design et performance.',
    experiences: [
      { id: 'e1', poste: 'Développeuse Front-End', entreprise: 'Acme Corp', ville: 'Lyon', debut: '2021', fin: 'Aujourd’hui', description: 'Refonte de l’application principale (React), +30 % de conversion.' },
      { id: 'e2', poste: 'Développeuse Web', entreprise: 'StartUp SA', ville: 'Paris', debut: '2018', fin: '2021', description: 'Développement de features produit et mise en place des tests automatisés.' },
    ],
    diplomes: [
      { id: 'd1', intitule: 'Master Informatique', ecole: 'Université de Paris', ville: 'Paris', debut: '2016', fin: '2018', description: 'Mention Très Bien' },
    ],
    competences: ['React', 'TypeScript', 'Node.js', 'UI/UX', 'GraphQL', 'Git'],
    langues: [
      { id: 'l1', langue: 'Français', niveau: 'Langue maternelle' },
      { id: 'l2', langue: 'Anglais', niveau: 'Courant' },
    ],
    interets: ['Photographie', 'Course à pied', 'Cuisine'],
    reseaux: [
      { id: 'r1', label: 'LinkedIn', url: 'linkedin.com/in/marie' },
      { id: 'r2', label: 'GitHub', url: 'github.com/marie' },
    ],
    typeKeywords: 'moderne tech',
  }
}
