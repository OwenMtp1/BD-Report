// ---------------------------------------------------------------------------
//  Contenu de la base de connaissances.
//  Séparé du store pour rester lisible et pour que l'ajout d'un article ne
//  demande aucune modification de logique : il suffit d'une entrée ici.
//
//  Chaque article porte un `id` STABLE (préfixe `kb-`) : c'est lui qui permet de
//  publier les nouveaux articles sur les bases existantes sans jamais écraser une
//  version retouchée par le support, ni ressusciter un article supprimé.
//  `keywords` élargit la recherche aux mots que les clients emploient vraiment,
//  qui ne figurent pas toujours dans le texte.
// ---------------------------------------------------------------------------

export const KB_CATEGORIES = [
  { id: 'Prise en main', emoji: '🚀', desc: 'Premiers pas, navigation et réglages de base.' },
  { id: 'Compte & accès', emoji: '🔑', desc: 'Connexion, mots de passe, rôles et droits.' },
  { id: 'Rendez-vous & pipeline', emoji: '📅', desc: 'Créer un RDV, suivre les phases, conclure.' },
  { id: 'Contacts & données', emoji: '📇', desc: 'Import, export, qualité et corbeille.' },
  { id: 'Primes & commissions', emoji: '💶', desc: 'Barèmes, calcul, prévisionnel et simulateur.' },
  { id: 'Pilotage & équipe', emoji: '📊', desc: 'Indicateurs, organisation et animation.' },
  { id: 'Conversations', emoji: '💬', desc: 'Canaux, reporting automatique et présence.' },
  { id: 'Intégrations', emoji: '🔌', desc: 'Connecter votre CRM et vos outils.' },
  { id: 'Offre & facturation', emoji: '🧾', desc: 'Souscription, sièges, changement et résiliation.' },
  { id: 'Sécurité & données', emoji: '🔒', desc: 'Protection, export et confidentialité.' },
  { id: 'Dépannage', emoji: '🛠️', desc: 'Que faire quand quelque chose ne va pas.' },
]

const A = (id, title, category, keywords, content) => ({ id, title, category, keywords, content })

export const KB_ARTICLES = [

  // ------------------------------------------------------------ Prise en main
  A('kb-start-first', 'Première connexion : par où commencer', 'Prise en main',
    'démarrer débuter commencer découverte onboarding premier',
    `Après votre première connexion, BD Report vous demande trois choses dans l'ordre :

1. Votre environnement — l'espace de votre entreprise. Si vous n'en voyez qu'un, il est sélectionné automatiquement.
2. Votre espace personnel — votre nom dans la liste. C'est là que vivent vos rendez-vous et vos primes.
3. Votre code PIN à 4 chiffres — il protège votre espace des regards sur un poste partagé.

Vous arrivez ensuite sur le Dashboard. Le menu de gauche est rangé par thème : Pilotage, Activité commerciale, Échanges, Mes données, Administration.

Conseil : commencez par créer un rendez-vous. C'est l'action qui alimente presque tout le reste — contacts, pipeline, primes et indicateurs.`),

  A('kb-start-pin', 'À quoi sert le code PIN et comment le changer', 'Prise en main',
    'pin code chiffres verrouillage protection espace',
    `Le PIN à 4 chiffres verrouille votre espace personnel. Il évite qu'un collègue ouvre vos données sur un poste laissé déverrouillé — il ne remplace pas votre mot de passe, qui protège l'accès à l'application.

Pour le changer : Paramètres → votre profil → code PIN.

PIN oublié ? Votre manager ou le support peut le réinitialiser. Ouvrez un ticket depuis l'onglet Support, ou demandez à votre manager.`),

  A('kb-start-nav', 'Comprendre le menu et retrouver une page', 'Prise en main',
    'menu navigation onglet page introuvable trouver barre latérale',
    `Le menu de gauche regroupe les pages par thème. Chaque rubrique se replie d'un clic sur son titre, ce qui aide quand vous en avez beaucoup.

Vous ne voyez pas une page dont on vous a parlé ? Trois raisons possibles :

• Elle n'est pas incluse dans l'offre de votre entreprise.
• Elle est réservée à un rôle que vous n'avez pas (manager, administrateur).
• Elle a été regroupée : les outils réservés aux managers vivent désormais dans « Gestion Manager », qui réunit vos utilisateurs, l'organigramme, le pilotage d'équipe, les KPI et l'intégration CRM.

La recherche globale (loupe en haut) retrouve aussi bien une entreprise qu'un contact ou un rendez-vous.`),

  A('kb-start-lang', 'Changer la langue, le thème et la devise', 'Prise en main',
    'langue anglais espagnol thème sombre nuit devise euro dollar',
    `Tout se règle dans Paramètres :

• Langue — français, anglais ou espagnol. Le changement est immédiat et propre à votre compte.
• Thème — clair, sombre, ou selon votre système. Plusieurs variantes de couleurs sont proposées.
• Devise — utilisée pour l'affichage des montants et des primes.

Ces réglages vous suivent d'un appareil à l'autre puisqu'ils sont attachés à votre compte.`),

  A('kb-start-mobile', 'Utiliser BD Report sur mobile ou hors connexion', 'Prise en main',
    'mobile téléphone tablette hors ligne offline installer application pwa',
    `L'application s'adapte aux écrans de téléphone et de tablette : ouvrez simplement l'adresse dans votre navigateur.

Pour un accès plus direct, votre navigateur propose « Ajouter à l'écran d'accueil » : l'application s'ouvre alors en plein écran, comme une application installée.

Hors connexion, vous pouvez continuer à consulter vos données déjà chargées. Les modifications faites hors ligne repartent vers le cloud dès que la connexion revient — évitez toutefois de travailler longtemps hors ligne sur deux appareils à la fois, la dernière écriture l'emporte.`),

  // ------------------------------------------------------------ Compte & accès
  A('kb-acc-password', 'Mot de passe oublié ou à réinitialiser', 'Compte & accès',
    'mot de passe oublié perdu réinitialiser connexion impossible bloqué',
    `Vous ne pouvez pas réinitialiser votre mot de passe seul : c'est votre manager ou l'équipe support qui le fait, pour éviter qu'un tiers puisse s'emparer d'un compte.

• Vous êtes dans une équipe : demandez à votre manager, il peut le réinitialiser depuis « Gestion Manager ».
• Vous n'avez pas de manager : ouvrez un ticket depuis l'onglet Support.

Après réinitialisation, changez-le dès votre première connexion depuis Paramètres.`),

  A('kb-acc-google', 'Se connecter avec Google', 'Compte & accès',
    'google gmail sso authentification connexion rapide compte google',
    `Le bouton « Continuer avec Google » vous connecte sans saisir de mot de passe.

Une condition : l'adresse de votre compte Google doit être exactement celle de votre compte BD Report. Le rattachement se fait sur l'e-mail.

Si le message « Aucun compte BD Report n'est associé à cette adresse Google » s'affiche, c'est que les deux adresses diffèrent. Demandez à votre manager d'aligner l'e-mail de votre compte, puis réessayez.

Aucun compte n'est créé automatiquement par Google : les accès restent délivrés par votre entreprise.

À chaque connexion, Google vous redemande quel compte utiliser. C'est voulu : sur un poste partagé, personne n'est reconnecté à votre place.`),

  A('kb-acc-stay', 'Rester connecté et enregistrer son identifiant', 'Compte & accès',
    'rester connecté 30 jours se souvenir enregistrer identifiant navigateur',
    `Deux cases distinctes sur l'écran de connexion :

• « Rester connecté pendant 30 jours » — vous n'aurez plus à ressaisir votre mot de passe pendant un mois sur cet appareil.
• « Enregistrer mon mot de passe sur cet appareil » — pré-remplit votre identifiant au prochain passage. Le mot de passe lui-même est confié au gestionnaire de votre navigateur, jamais stocké par l'application.

À éviter sur un ordinateur partagé ou public.`),

  A('kb-acc-roles', 'Les rôles et ce qu’ils permettent', 'Compte & accès',
    'rôle manager administrateur membre développeur droit permission accès',
    `Chaque compte porte un rôle qui détermine ce qu'il voit :

• Membre — ses propres rendez-vous, contacts, tâches et primes.
• Manager — en plus : son équipe, l'organigramme, le pilotage, les KPI et la gestion de ses utilisateurs.
• Administrateur — comme le manager, avec une portée plus large dans l'entreprise.
• Développeur — accès technique, sans les droits de gestion des personnes.

Seul un manager, un administrateur ou le support peut modifier un rôle. Si vous pensez ne pas avoir le bon, demandez-le à votre manager plutôt qu'au support : il est mieux placé pour décider.`),

  A('kb-acc-add', 'Ajouter un collaborateur à mon équipe', 'Compte & accès',
    'ajouter membre collaborateur créer utilisateur inviter équipe nouveau salarié',
    `Depuis « Gestion Manager » → onglet Utilisateurs → « Créer un utilisateur ».

Renseignez l'e-mail et le nom affiché : l'identifiant et le mot de passe initial sont générés, à transmettre à la personne. Elle apparaît aussitôt dans votre équipe et dans l'organigramme.

Attention au nombre de sièges : votre offre en fixe la limite. Si la création est refusée, c'est généralement que tous les sièges sont occupés — libérez-en un en désactivant un accès, ou demandez une extension au support.`),

  A('kb-acc-disable', 'Désactiver un accès plutôt que le supprimer', 'Compte & accès',
    'désactiver supprimer départ salarié partir compte inactif suspendre',
    `Quand un collaborateur quitte l'entreprise, préférez la désactivation à la suppression :

• Désactiver — la connexion est refusée immédiatement, mais ses rendez-vous, son historique et ses primes restent intacts pour vos statistiques et vos calculs.
• Supprimer — retire la personne définitivement.

La désactivation se fait depuis « Gestion Manager » → Utilisateurs. Elle libère le siège tout en préservant l'historique : c'est presque toujours le bon choix.`),

  // -------------------------------------------------- Rendez-vous & pipeline
  A('kb-rdv-create', 'Créer un rendez-vous', 'Rendez-vous & pipeline',
    'créer rdv rendez-vous nouveau ajouter meeting',
    `« Mes Rendez-vous » → « Créer un RDV ».

Les champs qui comptent vraiment :

• Entreprise — regroupe tout l'historique sur une même fiche.
• Date et phase — la phase décrit où en est l'affaire (R1, R2, MQL, SQL…).
• Provenance et source — d'où vient le lead. Ce champ conditionne le calcul de votre prime : ne le laissez pas vide.
• Effectif — la taille de l'entreprise, qui entre aussi dans le barème.
• Contacts — vous pouvez en associer plusieurs ; ils alimentent automatiquement « Mes contacts ».`),

  A('kb-rdv-phases', 'Les phases : R1, R2, MQL, SQL et les autres', 'Rendez-vous & pipeline',
    'phase r1 r2 mql sql étape statut avancement pipeline entonnoir',
    `Les phases décrivent l'avancement d'une affaire :

• R1 — premier rendez-vous, découverte.
• R2 — rendez-vous de suivi, approfondissement.
• MQL — le prospect est qualifié côté marketing.
• SQL — le prospect est qualifié commercialement. C'est l'étape qui déclenche votre prime.
• Signée — affaire gagnée. • KO — affaire perdue.

Faites glisser une carte dans le kanban « Leads » pour changer sa phase. Le passage en SQL fige la prime au barème en vigueur à cet instant : une modification ultérieure du barème ne la change plus.`),

  A('kb-rdv-sub', 'Sous-rendez-vous et suivi d’une même affaire', 'Rendez-vous & pipeline',
    'sous rdv relance suivi deuxième rendez-vous rattacher historique',
    `Un deuxième rendez-vous avec le même prospect n'est pas une nouvelle affaire : créez un sous-rendez-vous rattaché au premier.

Vous conservez ainsi un historique lisible, une seule affaire dans le pipeline, et une prime comptée une seule fois.

Depuis la fiche d'un rendez-vous : « Ajouter un sous-RDV ».`),

  A('kb-rdv-company', 'La fiche entreprise : tout voir au même endroit', 'Rendez-vous & pipeline',
    'fiche entreprise société compte 360 historique commentaires',
    `Cliquez sur le nom d'une entreprise, où qu'il apparaisse : sa fiche s'ouvre avec l'ensemble des rendez-vous, contacts, notes et commentaires la concernant.

C'est le réflexe à avoir avant un rendez-vous : vous savez en dix secondes qui a déjà parlé à qui, et ce qui s'est dit.

Vous pouvez y commenter et mentionner un collègue avec @ : il reçoit une notification.`),

  A('kb-rdv-lost', 'Marquer une affaire gagnée ou perdue', 'Rendez-vous & pipeline',
    'gagné perdu closed won lost signée ko conclure issue',
    `Sur la fiche du rendez-vous, indiquez l'issue : Gagnée ou Perdue.

L'issue prime sur la phase : une affaire marquée Gagnée est comptée comme telle même si sa phase n'a pas été mise à jour.

Renseignez-la systématiquement, même pour une affaire perdue : c'est ce qui rend vos taux de conversion et vos prévisions fiables.`),

  // -------------------------------------------------------- Contacts & données
  A('kb-data-import', 'Importer et exporter mes contacts', 'Contacts & données',
    'import export csv excel fichier contacts tableur télécharger',
    `Depuis « Mes contacts », les boutons d'import et d'export gèrent les fichiers CSV et Excel.

Pour un import réussi : une ligne par contact, une première ligne d'en-têtes, et au minimum un nom et un e-mail. Les colonnes supplémentaires sont associées automatiquement quand leur intitulé est reconnu.

Vos contacts se remplissent aussi tout seuls : chaque contact associé à un rendez-vous y apparaît sans saisie supplémentaire.

Exportez avant toute opération de masse : c'est votre filet de sécurité.`),

  A('kb-data-quality', 'Améliorer mon score de qualité des données', 'Contacts & données',
    'qualité données score doublon téléphone email manquant nettoyer',
    `La page « Qualité des données » note votre base sur 100 et détaille ce qui la pénalise : téléphones absents ou mal formés, e-mails invalides, doublons, prochaines actions non planifiées, contacts sans activité depuis longtemps.

Chaque anomalie est cliquable et vous emmène directement sur la fiche à corriger.

Un quart d'heure par semaine suffit à maintenir un score élevé — et une base propre fait gagner bien plus de temps qu'elle n'en coûte.`),

  A('kb-data-trash', 'Récupérer un élément supprimé', 'Contacts & données',
    'corbeille supprimé restaurer récupérer effacé erreur annuler',
    `Rien n'est détruit immédiatement : les suppressions passent par la Corbeille.

Ouvrez « Corbeille » dans « Mes données », retrouvez l'élément et cliquez sur Restaurer.

Vider la corbeille est en revanche définitif. Si un élément n'y figure plus, ouvrez un ticket rapidement : une restauration depuis les sauvegardes reste parfois possible dans les jours qui suivent.`),

  A('kb-data-notes', 'Notes et tâches : quoi mettre où', 'Contacts & données',
    'note tâche rappel todo mémo organiser prioriser',
    `• Mes notes — pour ce que vous voulez retenir : compte rendu, argumentaire, information glanée. Une note peut se transformer en rendez-vous d'un clic.
• Mes tâches — pour ce que vous devez faire, avec une échéance. À cocher une fois fait.
• Recommandations prioritaires — ce que l'application vous suggère de traiter en premier, calculé à partir de vos rendez-vous et relances en retard.

En pratique : commencez votre journée par les Recommandations, finissez-la en notant ce que vous ne voulez pas oublier.`),

  // --------------------------------------------------- Primes & commissions
  A('kb-prime-how', 'Comment ma prime est-elle calculée', 'Primes & commissions',
    'prime commission calcul montant barème combien gagne rémunération variable',
    `Deux mécanismes coexistent, et vos primes peuvent venir des deux.

1. Prime par lead — déclenchée au passage d'un rendez-vous en SQL. Le montant vient du barème de votre entreprise, croisant l'effectif de la société prospectée et la source du lead.

2. Prime par activité — liée à un volume atteint sur une période : « au moins 12 RDV dans le mois → tel montant ». Les paliers et les périodes sont définis par votre manager.

La page « Primes & Commissions » fusionne les deux et détaille chaque ligne : vous pouvez toujours savoir d'où vient un euro.`),

  A('kb-prime-frozen', 'Pourquoi ma prime n’a pas changé après une correction', 'Primes & commissions',
    'prime figée bloquée modifiée barème changé montant incorrect erreur',
    `Une prime par lead est figée au moment du passage en SQL, avec le barème en vigueur à cet instant.

C'est délibéré : sans cela, une évolution du barème modifierait rétroactivement des primes déjà annoncées, voire déjà versées.

Conséquence : corriger l'effectif ou la source après coup ne recalcule pas la prime. Si la correction est légitime, demandez à votre manager de réviser la ligne — il peut le faire depuis la page Primes.`),

  A('kb-prime-15', 'La règle du 15 et le rattachement au mois', 'Primes & commissions',
    'règle 15 quinze mois rattachement période versement quand payé',
    `Un rendez-vous passé en SQL avant le 15 du mois est rattaché au mois en cours ; à partir du 15, il bascule sur le mois suivant.

Cette règle donne au mois le temps d'être clôturé sans que des lignes s'y ajoutent après coup.

Dans la page Primes, chaque ligne indique son mois de rattachement : c'est celui-ci qui compte, pas la date du rendez-vous.`),

  A('kb-prime-sim', 'Simuler ce que je vais toucher', 'Primes & commissions',
    'simulateur simulation prévision combien objectif projection estimer',
    `La page « Simulateur de primes » répond à une seule question : combien vais-je toucher ?

Faites glisser le curseur de la jauge pour tester des hypothèses de volume. L'écran distingue :

• Acquise — déjà figée, elle ne bougera plus.
• Probable — attendue au vu de vos affaires en cours.
• Potentielle — atteignable si vos affaires ouvertes aboutissent.

Il vous indique aussi combien de passages en SQL il vous manque pour atteindre le palier suivant.`),

  // ------------------------------------------------------- Pilotage & équipe
  A('kb-team-kpi', 'Lire les KPI de mon entreprise', 'Pilotage & équipe',
    'kpi indicateur statistique tableau chiffres performance analyse',
    `« KPI Entreprise », dans la console Gestion Manager, agrège l'activité de toute l'équipe : volumes par phase, taux de conversion d'une étape à l'autre, primes engagées, comparaison entre commerciaux et évolution dans le temps.

Deux réflexes utiles : regardez les taux de passage plutôt que les volumes bruts — ils disent où ça bloque ; et comparez toujours à la période précédente, un chiffre isolé ne veut rien dire.`),

  A('kb-team-lead', 'Animer mon équipe au quotidien', 'Pilotage & équipe',
    'pilotage équipe forecast standup daily alerte dérive management',
    `« Pilotage équipe » est conçu pour le rituel quotidien : forecast du mois avec projection, préparation du point d'équipe, et alertes automatiques quand un commercial dérive par rapport à son rythme habituel.

Les alertes sont un signal, pas un verdict : elles servent à ouvrir la conversation, pas à la clore.`),

  A('kb-team-org', 'Organigramme et rattachements', 'Pilotage & équipe',
    'organigramme hiérarchie rattacher manager équipe structure service',
    `L'onglet Organigramme de la console Gestion Manager dessine l'arbre de votre équipe.

Activez « Modifier l'organigramme » pour faire glisser une personne sous un autre manager, ou utilisez le menu « Rattaché à ». Les rattachements circulaires sont refusés automatiquement.

Les services (Sales, Marketing…) se gèrent au même endroit : ils servent aussi à cibler l'accès aux canaux de discussion.`),

  A('kb-team-rank', 'Le classement et les badges', 'Pilotage & équipe',
    'classement gamification podium badge motivation concours challenge',
    `Le Classement compare l'équipe sur six critères et attribue des badges : série en cours, objectif atteint, cap des 2000 €, forte progression.

Il est conçu pour animer, pas pour sanctionner. Chacun voit sa position ; c'est au manager de décider de l'usage qu'il en fait.`),

  // ------------------------------------------------------------ Conversations
  A('kb-conv-channels', 'Créer et gérer un canal de discussion', 'Conversations',
    'canal channel discussion groupe conversation créer message chat',
    `Dans Conversations, « Nouveau canal » vous laisse choisir qui y accède : tout le monde, un service, ou des personnes choisies une à une.

Deux canaux existent d'office : « Général », qui réunit tout votre environnement, et votre « Bloc notes » personnel, visible de vous seul — pratique pour se laisser un message à soi-même.

Vous pouvez y partager des images et des fichiers, réagir avec un émoji, répondre à un message précis ou le transférer ailleurs.`),

  A('kb-conv-report', 'Les canaux de reporting automatique', 'Conversations',
    'reporting automatique notification canal alerte activité flux temps réel',
    `Un canal de reporting est alimenté par l'application elle-même : chaque rendez-vous créé, chaque changement d'étape, chaque affaire gagnée ou perdue y est publié.

Le manager choisit à la fois les événements suivis et les champs affichés, pour éviter le bruit.

C'est le moyen le plus simple de garder l'équipe informée sans réunion supplémentaire ni saisie en double.`),

  A('kb-conv-presence', 'Présence et mode « ne pas déranger »', 'Conversations',
    'présence en ligne statut disponible occupé ne pas déranger notification couper',
    `Votre statut apparaît en pastille sur votre avatar : en ligne, hors ligne, ou ne pas déranger.

« Ne pas déranger » coupe vos notifications sans vous déconnecter — utile en rendez-vous ou en session de prospection.

Pour faire taire un canal en particulier sans changer votre statut, utilisez le mode silencieux depuis le menu du canal.`),

  A('kb-conv-leave', 'Quitter, masquer ou supprimer une conversation', 'Conversations',
    'quitter groupe supprimer conversation masquer partir cacher archiver',
    `Cela dépend du type de conversation :

• Message direct ou bloc-notes — vous pouvez le supprimer entièrement.
• Groupe (à partir de deux interlocuteurs) — « supprimer pour moi » le masque jusqu'au prochain message, « quitter le groupe » vous en retire définitivement.

Seul un manager peut supprimer un canal pour tout le monde.

Un message vous concernant peut aussi être marqué comme non lu, pour le retrouver plus tard.`),

  // -------------------------------------------------------------- Intégrations
  A('kb-int-why', 'Faut-il connecter mon CRM', 'Intégrations',
    'crm intégration connecter synchroniser hubspot outil externe',
    `Connecter votre CRM évite la double saisie : entreprises, contacts, rendez-vous et notes partent automatiquement vers votre outil habituel.

C'est utile si votre direction pilote depuis le CRM, ou si d'autres équipes y travaillent. Ça ne l'est pas si BD Report est votre seul outil commercial.

La connexion se fait en un clic et reste révocable à tout moment, sans que vos données BD Report soient affectées.`),

  A('kb-int-what', 'Ce qui est envoyé vers le CRM', 'Intégrations',
    'synchronisation quoi envoyé données transférées doublon écrasement',
    `Sont envoyés : l'entreprise du rendez-vous, ses contacts, le rendez-vous lui-même sous forme d'affaire, le créneau et les notes associées, ainsi que vos tâches.

Les envois sont idempotents : renvoyer deux fois le même rendez-vous met à jour l'enregistrement existant au lieu d'en créer un second.

Les associations entre entreprise, contacts et affaire sont posées automatiquement.`),

  // ---------------------------------------------------- Offre & facturation
  A('kb-offer-what', 'Ce que contient mon offre', 'Offre & facturation',
    'offre abonnement formule plan starter beta fonctionnalité incluse',
    `Une offre détermine deux choses : les pages accessibles et le nombre de sièges.

Vous retrouvez le détail dans « Souscrire à une offre », qui affiche l'offre en cours et les autres formules.

Une page absente du menu n'est pas un bug : elle n'est simplement pas comprise dans votre offre. Le comparatif indique laquelle l'inclut.`),

  A('kb-offer-change', 'Changer d’offre ou ajouter des sièges', 'Offre & facturation',
    'changer offre upgrade sièges ajouter utilisateur augmenter passer',
    `Depuis « Souscrire à une offre », choisissez la formule souhaitée : un ticket est ouvert auprès du support, qui applique le changement et vous confirme.

Les sièges ajoutés en cours de période sont facturés au prorata. Une réduction du nombre de sièges prend effet à l'échéance suivante.

Vos données ne sont jamais affectées par un changement d'offre : seules changent les pages accessibles et la limite de sièges.`),

  A('kb-offer-cancel', 'Résilier et ce qui se passe ensuite', 'Offre & facturation',
    'résilier résiliation arrêter annuler stopper fin contrat partir',
    `Paramètres → Gérer mes environnements → Résilier.

Un ticket est ouvert et votre environnement passe en lecture seule : vos données restent consultables et exportables, mais ne peuvent plus être modifiées. Le support reste joignable.

Vous disposez de 30 jours pour exporter ce que vous souhaitez conserver. Faites-le avant toute autre démarche : c'est irréversible ensuite.`),

  A('kb-offer-readonly', 'Mon espace est en lecture seule', 'Offre & facturation',
    'lecture seule bloqué modification impossible readonly figé',
    `Un bandeau annonce la lecture seule et les boutons de modification disparaissent. Trois causes possibles :

• Une résiliation est en cours.
• Le support a temporairement bloqué l'environnement, généralement pour un impayé.
• Une opération de maintenance est en cours.

La consultation et l'export restent possibles. Ouvrez un ticket pour connaître la raison exacte : le support voit immédiatement laquelle s'applique.`),

  // ---------------------------------------------------- Sécurité & données
  A('kb-sec-where', 'Où sont mes données et qui peut les voir', 'Sécurité & données',
    'données hébergement rgpd confidentialité qui voit accès sécurité',
    `Vos données sont hébergées dans l'Union européenne, chiffrées en transit et au repos.

Chaque entreprise dispose d'un environnement séparé : aucun autre client ne voit vos données.

En interne, l'accès est régi par les rôles : un membre voit son espace, un manager voit son équipe. L'équipe support de BD Report peut y accéder pour traiter vos demandes, dans la limite de ses droits, et ces accès sont journalisés.

Le détail figure dans la politique de confidentialité, accessible depuis l'écran de connexion.`),

  A('kb-sec-export', 'Exporter toutes mes données', 'Sécurité & données',
    'export sauvegarde télécharger récupérer portabilité rgpd copie',
    `Les exports sont disponibles page par page : contacts, rendez-vous, primes disposent chacun de leur bouton d'export au format tableur.

Pour un export complet, notamment dans le cadre d'une portabilité RGPD, ouvrez un ticket : le support vous fournit l'ensemble dans un format structuré.

Prenez l'habitude d'exporter avant toute opération de masse, et avant une résiliation.`),

  A('kb-sec-delete', 'Faire supprimer des données personnelles', 'Sécurité & données',
    'rgpd suppression effacement droit oubli prospect contact retirer',
    `Un prospect vous demande la suppression de ses données ? C'est votre entreprise qui est responsable de ce traitement, pas BD Report : vous pouvez répondre directement.

Supprimez le contact concerné, puis videz la corbeille pour rendre la suppression définitive.

Si la demande porte sur des données que vous ne parvenez pas à retrouver, ouvrez un ticket : le support vous aide à les localiser.`),

  // ----------------------------------------------------------------- Dépannage
  A('kb-fix-sync', 'Mes données ne sont pas à jour sur un autre appareil', 'Dépannage',
    'synchronisation pas à jour différent appareil ordinateur téléphone décalage',
    `La synchronisation est quasi instantanée quand la connexion le permet. En cas de décalage :

1. Vérifiez votre connexion sur les deux appareils.
2. Rechargez la page avec Ctrl + Maj + R (Cmd + Maj + R sur Mac).
3. Vérifiez que vous êtes bien dans le même environnement et le même espace.

Si l'écart persiste après plusieurs minutes, ouvrez un ticket sans modifier davantage les données des deux côtés : la dernière écriture l'emporte, et continuer risquerait d'écraser la bonne version.`),

  A('kb-fix-blank', 'Page blanche ou affichage figé', 'Dépannage',
    'page blanche bug plantage bloqué figé ne charge pas erreur affichage',
    `Dans l'ordre :

1. Rechargez en vidant le cache : Ctrl + Maj + R.
2. Essayez une fenêtre de navigation privée — cela écarte une extension ou un cache récalcitrant.
3. Essayez un autre navigateur récent (Chrome, Edge, Firefox, Safari).

Si le problème persiste, ouvrez un ticket en précisant votre navigateur, la page concernée et l'heure : ces trois informations suffisent presque toujours à le reproduire.`),

  A('kb-fix-missing', 'Un rendez-vous ou un contact a disparu', 'Dépannage',
    'disparu perdu introuvable supprimé manquant retrouver',
    `Avant de conclure à une perte :

1. Vérifiez le filtre actif sur la page — une période ou une phase sélectionnée masque le reste.
2. Utilisez la recherche globale plutôt que la liste.
3. Vérifiez que vous êtes dans le bon espace : un rendez-vous créé dans un autre espace n'apparaît pas dans le vôtre.
4. Regardez la Corbeille.

Si rien de tout cela ne donne de résultat, ouvrez un ticket en indiquant le nom de l'entreprise et la date approximative.`),

  A('kb-fix-ticket', 'Bien rédiger un ticket pour être aidé vite', 'Dépannage',
    'ticket support demande aide contacter assistance écrire signaler',
    `Un bon ticket contient quatre choses :

1. Ce que vous vouliez faire.
2. Ce qui s'est passé à la place, avec le message d'erreur exact si vous en avez un.
3. Où : la page concernée, et le nom de l'enregistrement si c'est pertinent.
4. Quand : l'heure approximative.

Une capture d'écran vaut souvent trois paragraphes.

Choisissez la priorité honnêtement : tout marquer en urgent finit par ne plus rien signaler du tout. L'urgence est réservée à ce qui empêche complètement de travailler.`),
]

// Association rapide id → article, utilisée par la publication incrémentale.
export const KB_BY_ID = Object.fromEntries(KB_ARTICLES.map(a => [a.id, a]))
