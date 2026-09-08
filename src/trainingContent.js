// ---------------------------------------------------------------------------
//  Contenu de l'espace de formation du staff.
//  Des cas fictifs mais réalistes, destinés à s'entraîner sans toucher aux données
//  réelles : projets à différents stades, tickets couvrant tous les sujets, et une
//  discussion de projet qui accumule les difficultés qu'on rencontre vraiment.
//  Rien ici n'est enregistré ni synchronisé : c'est du matériel pédagogique.
// ---------------------------------------------------------------------------

export const TRAINING_PROJECTS = [
  {
    id: 'tp-1', name: 'Déploiement Vallon Industries', client: 'Vallon Industries', owner: 'Non assigné',
    status: 'a-parametrer', seats: 25,
    todo: ['Créer l\'environnement', 'Importer les 25 utilisateurs', 'Définir les barèmes de primes', 'Planifier la formation'],
    brief: "Contrat signé vendredi. L'entreprise attend une mise en service sous dix jours, avant le lancement de sa campagne de recrutement.",
  },
  {
    id: 'tp-2', name: 'Reprise de données Hexatel', client: 'Hexatel', owner: 'Non assigné',
    status: 'a-parametrer', seats: 12,
    todo: ['Récupérer l\'export du CRM actuel', 'Vérifier les doublons', 'Importer contacts et rendez-vous', 'Faire valider par le client'],
    brief: "Le client arrive d'un tableur partagé. L'export contient des doublons et des effectifs manquants : à nettoyer avant import.",
  },
  {
    id: 'tp-3', name: 'Onboarding Groupe Lamarche', client: 'Groupe Lamarche', owner: 'Sofia',
    status: 'encours', seats: 40,
    todo: ['Organigramme à finaliser', 'Rôles personnalisés par filiale'],
    brief: "Quatre filiales, quatre organisations différentes. Le client veut des rôles distincts par filiale avec des onglets différents.",
  },
  {
    id: 'tp-4', name: 'Intégration CRM Novaterre', client: 'Novaterre', owner: 'Sofia',
    status: 'encours', seats: 18,
    todo: ['Connecter le portail CRM', 'Mapper les phases', 'Test d\'envoi sur cinq rendez-vous'],
    brief: "Le client a déjà un CRM en production. Attention à ne pas créer de doublons lors du premier envoi.",
  },
  {
    id: 'tp-5', name: 'Formation équipe Aurea', client: 'Aurea Consulting', owner: 'Marc',
    status: 'encours', seats: 8,
    todo: ['Préparer le support', 'Caler deux sessions'],
    brief: "Petite équipe, très peu à l'aise avec les outils. Prévoir une session courte et une session de rattrapage.",
  },
  {
    id: 'tp-6', name: 'Migration Bardin & Fils', client: 'Bardin & Fils', owner: 'Marc',
    status: 'pause', seats: 15,
    todo: ['Relancer le client', 'Confirmer la date de bascule'],
    brief: "Projet en pause depuis trois semaines : le contact interne a changé de poste et personne n'a repris le dossier.",
  },
  {
    id: 'tp-7', name: 'Extension de sièges Kastel', client: 'Kastel', owner: 'Sofia',
    status: 'encours', seats: 60,
    todo: ['Ajouter 20 sièges', 'Ajuster la facturation au prorata'],
    brief: "Le client recrute et demande 20 sièges supplémentaires en cours de période.",
  },
  {
    id: 'tp-8', name: 'Mise en place Océan Bleu', client: 'Océan Bleu', owner: 'Non assigné',
    status: 'a-parametrer', seats: 30,
    todo: ['Créer l\'environnement', 'Paramétrer les primes par activité', 'Créer trois rôles sur mesure'],
    brief: "Le client rémunère à l'activité et non au lead : les barèmes standards ne conviennent pas.",
  },
  {
    id: 'tp-9', name: 'Audit qualité Prisma', client: 'Prisma Group', owner: 'Marc',
    status: 'encours', seats: 22,
    todo: ['Analyser le score de qualité', 'Proposer un plan de nettoyage'],
    brief: "Le client se plaint de doublons et de relances manquées. Son score de qualité est à 41/100.",
  },
  {
    id: 'tp-10', name: 'Clôture Vent Debout', client: 'Vent Debout', owner: 'Sofia',
    status: 'termine', seats: 10,
    todo: [],
    closeReason: "Le client cesse son activité de prospection externalisée. Aucun grief sur le produit, décision purement stratégique.",
    brief: "Projet clôturé le mois dernier. Sert d'exemple pour la saisie d'un motif de clôture.",
  },
]

export const TRAINING_TICKETS = [
  {
    id: 'tt-1', category: 'Connexion & authentification', client: 'Vallon Industries', priority: 'urgente', status: 'open',
    lesson: "Vérifier d'abord si l'accès est désactivé ou si l'adresse Google diffère du compte, avant de réinitialiser quoi que ce soit.",
    messages: [
      ['user', "Impossible de me connecter depuis ce matin, ni avec mon mot de passe ni avec Google. Toute l'équipe est bloquée."],
      ['user', 'C\'est urgent, on a des rendez-vous toute la journée.'],
    ],
  },
  {
    id: 'tt-2', category: 'Primes & commissions', client: 'Aurea Consulting', priority: 'haute', status: 'open',
    lesson: "La prime est figée au passage en SQL. Corriger l'effectif après coup ne la recalcule pas : c'est au manager de réviser la ligne.",
    messages: [
      ['user', "J'ai corrigé l'effectif d'un client passé de 300 à 900 salariés, mais ma prime n'a pas bougé. C'est un bug ?"],
    ],
  },
  {
    id: 'tt-3', category: 'Import / export de données', client: 'Hexatel', priority: 'normale', status: 'open',
    lesson: 'Faire vérifier le fichier avant import : une ligne d\'en-têtes, un e-mail par contact. Toujours proposer un export préalable.',
    messages: [
      ['user', "Mon import de 400 contacts n'a repris que 120 lignes. Où sont passées les autres ?"],
      ['support', 'Bonjour, pouvez-vous me confirmer que chaque ligne comporte bien une adresse e-mail ?'],
      ['user', 'Non, une partie n\'en a pas. C\'est ça le problème ?'],
    ],
  },
  {
    id: 'tt-4', category: 'Intégration CRM', client: 'Novaterre', priority: 'haute', status: 'open',
    lesson: "Un « Unable to load app information » vient presque toujours d'un identifiant d'application erroné, pas du réseau.",
    messages: [
      ['user', "La connexion à notre CRM affiche « Unable to load app information ». On a pourtant tout renseigné."],
    ],
  },
  {
    id: 'tt-5', category: 'Facturation & abonnement', client: 'Kastel', priority: 'normale', status: 'open',
    lesson: 'Les sièges ajoutés en cours de période sont facturés au prorata ; une réduction ne prend effet qu\'à l\'échéance.',
    messages: [
      ['user', 'On recrute 20 personnes le mois prochain. Comment ça se passe pour la facturation ?'],
    ],
  },
  {
    id: 'tt-6', category: 'Bug / anomalie', client: 'Prisma Group', priority: 'haute', status: 'open',
    lesson: "Demander navigateur, page et heure. Une page blanche vient souvent du cache : proposer d'abord une fenêtre privée.",
    messages: [
      ['user', "La page Leads reste blanche depuis la mise à jour. Ça marche chez ma collègue."],
    ],
  },
  {
    id: 'tt-7', category: 'Question produit', client: 'Groupe Lamarche', priority: 'basse', status: 'open',
    lesson: "Réponse dans la base de connaissances : orienter vers l'article plutôt que de tout réécrire, et vérifier qu'il est à jour.",
    messages: [
      ['user', 'Peut-on avoir des rôles différents selon les filiales ? Chacune a son organisation.'],
    ],
  },
  {
    id: 'tt-8', category: 'Sécurité & données', client: 'Océan Bleu', priority: 'haute', status: 'open',
    lesson: "Le client est responsable de traitement pour ses prospects : il peut supprimer lui-même, et doit vider la corbeille.",
    messages: [
      ['user', "Un prospect nous demande la suppression de ses données. Comment on procède ?"],
    ],
  },
  {
    id: 'tt-9', category: 'Formation & prise en main', client: 'Bardin & Fils', priority: 'basse', status: 'open',
    lesson: "Client en difficulté sur les bases : proposer une session courte plutôt qu'une réponse écrite qui ne sera pas lue.",
    messages: [
      ['user', "Personne chez nous ne comprend la différence entre MQL et SQL. On fait n'importe quoi dans le pipeline."],
    ],
  },
  {
    id: 'tt-10', category: 'Demande d\'évolution', client: 'Vallon Industries', priority: 'basse', status: 'open',
    lesson: "Ne rien promettre. Reformuler le besoin réel derrière la demande, et le remonter tel quel.",
    messages: [
      ['user', 'Il nous faudrait un export automatique tous les lundis matin vers notre outil de BI.'],
    ],
  },
  {
    id: 'tt-11', category: 'Insatisfaction', client: 'Prisma Group', priority: 'urgente', status: 'open',
    lesson: "Client à risque : deux notes basses et trois tickets ouverts. Prendre en charge personnellement, ne pas répondre par un article.",
    messages: [
      ['user', "Troisième ticket en deux semaines. On commence à se demander si l'outil est fiable. La direction pose des questions."],
    ],
  },
  {
    id: 'tt-12', category: 'Connexion & authentification', client: 'Aurea Consulting', priority: 'normale', status: 'closed',
    lesson: "Exemple de ticket bien mené : reformulation, cause identifiée, vérification, clôture avec accord du client.",
    messages: [
      ['user', "Un collaborateur ne reçoit pas l'écran de connexion Google."],
      ['support', "Bonjour, son adresse Google correspond-elle exactement à celle de son compte BD Report ?"],
      ['user', "Effectivement non, il utilise son adresse personnelle."],
      ['support', "C'est la cause : le rattachement se fait sur l'e-mail. Je vous laisse aligner l'adresse, et ce sera réglé."],
      ['user', 'Parfait, ça fonctionne. Merci !'],
    ],
  },
]

// Discussion d'un projet difficile : le cas d'école, avec des demandes de rôles
// particulières et un client qui pousse.
export const TRAINING_THREAD = {
  project: 'Onboarding Groupe Lamarche',
  messages: [
    ['Sofia', -52, "Je démarre l'onboarding Lamarche. Quatre filiales, 40 sièges. Le client veut que chaque filiale ait ses propres rôles."],
    ['Marc', -50, "Ça se fait : rôles par environnement, avec les onglets cochés par rôle. Attention à ne pas créer un rôle par personne, ça devient ingérable."],
    ['Sofia', -49, "Justement, ils demandent un rôle « Responsable régional » qui verrait le pipeline de sa filiale mais pas les primes des autres."],
    ['Marc', -48, "Le cloisonnement par filiale n'existe pas dans le produit : un rôle décide des onglets, pas du périmètre de données. À dire clairement au client plutôt que de bricoler."],
    ['Sofia', -30, "Dit au client. Il insiste, dit que c'était « promis en avant-vente »."],
    ['Chloé', -28, "Je reprends ce point avec eux. Ne promettez jamais un cloisonnement de données : on ne l'a pas, et le contourner par des environnements séparés casse leur reporting global."],
    ['Sofia', -26, "Compris. Je propose quoi en attendant ?"],
    ['Chloé', -25, "Un environnement par filiale + un accès manager global au niveau groupe. C'est plus lourd à administrer mais ça répond au besoin réel, qui est le reporting consolidé."],
    ['Marc', -6, "Autre point : ils veulent 40 comptes créés pour lundi. On a leur fichier ?"],
    ['Sofia', -5, "Reçu ce matin, mais sans les e-mails professionnels pour douze personnes. Je relance."],
    ['Chloé', -4, "Ne créez pas de comptes avec des adresses personnelles : la connexion Google se rattache sur l'e-mail, ils seraient bloqués dès le premier jour."],
  ],
}

export const TRAINING_STATUS = {
  'a-parametrer': { label: 'À paramétrer', color: 'bg-amber-100 text-amber-700' },
  encours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  pause: { label: 'En pause', color: 'bg-gray-200 text-gray-600' },
  termine: { label: 'Terminé', color: 'bg-emerald-100 text-emerald-700' },
}
