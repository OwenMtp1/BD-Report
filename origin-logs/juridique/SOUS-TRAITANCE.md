# Contrat de sous-traitance — modèle

> ⚠️ **MODÈLE À FAIRE RELIRE PAR UN JURISTE.** Il est écrit d'après ce que le
> logiciel fait réellement, ce qui le rend exact sur l'outil et muet sur
> votre situation. Les passages entre `⟨crochets⟩` sont à compléter.

**Accord de traitement des données à caractère personnel**
conclu en application de l'article 28 du règlement (UE) 2016/679 (RGPD).

---

## Entre les parties

**Le Responsable de traitement** — ci-après « le Client »
⟨nom ou raison sociale du serveur⟩, ⟨adresse⟩, représenté par ⟨nom⟩,
contact : ⟨e-mail⟩.

**Le Sous-traitant** — ci-après « l'Éditeur »
⟨votre nom ou raison sociale⟩, ⟨adresse⟩, représenté par ⟨nom⟩,
contact : ⟨e-mail⟩.

## 1. Objet

L'Éditeur fournit au Client le panneau de journalisation **Origin Logs**, qui
enregistre et présente les évènements du serveur de jeu du Client. Dans ce
cadre, l'Éditeur traite des données à caractère personnel **pour le seul
compte du Client et sur ses seules instructions**.

## 2. Nature et finalité du traitement

| | |
|---|---|
| **Finalité** | Modération du serveur de jeu : détecter la triche, instruire un litige entre joueurs, justifier une sanction, retrouver un objet ou une somme perdus. |
| **Nature** | Collecte, enregistrement, conservation, consultation et effacement d'évènements de jeu. |
| **Durée** | La durée du contrat de service, augmentée de la durée de conservation choisie par le Client (article 6). |

⚠️ **Le traitement n'a aucune finalité commerciale ni publicitaire.** Les
journaux ne sont ni revendus, ni agrégés, ni utilisés pour entraîner un
modèle, ni exploités pour le compte de l'Éditeur ou d'un autre client.

## 3. Catégories de personnes et de données

**Personnes concernées** : les joueurs du serveur du Client, et les membres
de son équipe de modération.

**Données traitées** :

| Catégorie | Détail |
|---|---|
| Identifiants de jeu | licence FiveM (identifiant stable), identifiants Steam, Discord et FiveM lorsque le joueur les a liés, identifiant de session |
| Identité déclarative | pseudonyme en jeu, nom du personnage |
| Évènements de jeu | horodatage, rubrique, description, données associées (montants, objets, coordonnées), ressource émettrice |
| Mesures de modération | avertissements, expulsions, bannissements, motifs, auteur, durée |
| Captures d'écran | image de l'écran du joueur, **uniquement lorsqu'un membre du staff en fait la demande**, avec le motif et l'auteur de la demande |
| Comptes du staff | pseudonyme, empreinte du mot de passe, identifiant et rôles Discord, dates de connexion |

**Ne sont PAS collectés** : adresse IP, adresse postale, adresse e-mail d'un
joueur, coordonnées bancaires, contenu des conversations vocales. Aucune
donnée relevant de l'article 9 du RGPD (santé, opinions, origine, orientation
sexuelle) n'est demandée par l'outil ; le Client s'abstient d'en faire porter
par les motifs de sanction qu'il rédige librement.

⚠️ **Les captures d'écran sont la donnée la plus sensible du dispositif** :
elles peuvent contenir ce que le joueur a par ailleurs à l'écran. Elles ne
sont jamais prises automatiquement, exigent une permission dédiée
(`screens.request`), portent le motif et le nom du demandeur, et suivent la
durée de conservation de l'article 6.

## 4. Instructions du Client

L'Éditeur ne traite les données que sur instruction documentée du Client. Le
paramétrage du panneau — rubriques activées, durée de conservation, rôles et
permissions — **vaut instruction**.

L'Éditeur informe le Client s'il estime qu'une instruction constitue une
violation du RGPD.

## 5. Accès de l'Éditeur aux données du Client

L'Éditeur n'accède aux journaux du Client **que** pour :
a) assurer le fonctionnement et la maintenance du service ;
b) répondre à une demande d'assistance du Client ;
c) exécuter une obligation légale.

Ces accès sont **techniquement tracés** : entrer dans l'espace d'un client
suppose une permission dédiée, chaque entrée est inscrite au journal
d'administration avec son auteur et sa date, et **le Client peut consulter
cette trace**. L'Éditeur s'engage à ce que le nombre de personnes disposant
de cette permission reste limité à ⟨nombre⟩ et à la retirer sans délai à
qui quitte ses fonctions.

## 6. Durée de conservation

Le Client choisit la durée de conservation de ses journaux, dans la limite
permise par sa formule. Au terme de cette durée, les évènements et les
captures sont **effacés automatiquement**, sans intervention.

Durée retenue au titre du présent contrat : **⟨30⟩ jours**.

⚠️ **Les sauvegardes suivent leur propre cycle.** Une donnée effacée du
service peut subsister dans une sauvegarde jusqu'à ⟨14⟩ jours, le temps que
la rotation la remplace. C'est une conséquence assumée : une sauvegarde
qu'on rouvrirait pour en retirer une ligne ne serait plus une sauvegarde
fiable. Aucune sauvegarde n'est restaurée pour un autre motif qu'un incident.

## 7. Droits des personnes

L'Éditeur met à la disposition du Client les moyens de répondre lui-même aux
demandes des joueurs, sans intervention de l'Éditeur :

- **Accès et portabilité** (art. 15 et 20) — export en un fichier de tout ce
  que le panneau détient sur une personne.
- **Effacement** (art. 17) — suppression des évènements la concernant.
- **Opposition et limitation** (art. 18 et 21) — par la désactivation des
  rubriques concernées ou la réduction de la durée de conservation.

⚠️ **Un bannissement en cours n'est pas effacé : il est pseudonymisé.** La
mesure reste opposable — c'est l'intérêt légitime du Client à protéger sa
communauté — mais elle cesse de porter le nom de la personne. Le panneau
demande une confirmation explicite avant cet effacement, précisément parce
que les deux intérêts s'opposent ici.

Si une demande parvient directement à l'Éditeur, il la transmet au Client
sans y répondre lui-même et sans délai.

## 8. Sécurité

L'Éditeur met en œuvre :

- **Cloisonnement par espace** : les journaux d'un client ne sont accessibles
  ni à un autre client, ni par le cache, ni par une clé d'un autre espace.
- **Mots de passe** conservés sous forme d'empreinte non réversible
  (scrypt) ; **aucun mot de passe en clair** n'existe en base.
- **Masquage des identifiants** : un membre du staff dépourvu de la
  permission correspondante reçoit un alias stable et non réversible à la
  place de la licence du joueur.
- **Contrôle d'accès par rôle**, appliqué côté serveur — la restriction
  d'une rubrique est écrite dans la requête, non dans l'interface.
- **Révocation automatique** : le staff qui perd son rôle Discord perd son
  accès au panneau sans geste manuel.
- **Journalisation des accès** : consultations sensibles, exports,
  effacements et entrées dans un espace.
- **Sauvegardes** quotidiennes, conservées ⟨14⟩ jours.
- **Chiffrement du transport** (HTTPS) — ⚠️ à la charge de celui qui héberge,
  voir article 10.

## 9. Sous-traitants ultérieurs

L'Éditeur ne recourt à d'autres sous-traitants que pour l'hébergement. Liste
au jour de la signature :

| Prestataire | Rôle | Pays |
|---|---|---|
| ⟨hébergeur⟩ | serveur et stockage | ⟨pays⟩ |
| ⟨sauvegarde, si externalisée⟩ | copie de sécurité | ⟨pays⟩ |

L'Éditeur informe le Client de tout changement ⟨30⟩ jours à l'avance ; le
Client peut s'y opposer et résilier.

## 10. Hébergement et transferts

Les données sont hébergées à ⟨lieu⟩, ⟨pays⟩.

⚠️ **Si l'hébergement a lieu hors de l'Union européenne**, le transfert doit
être encadré (clauses contractuelles types, ou pays reconnu adéquat) : ce
point est à compléter par les parties et ne se règle pas par une simple
mention.

Lorsque le Client héberge lui-même le panneau sur son propre serveur,
l'Éditeur n'est **pas** sous-traitant du traitement : il n'est que fournisseur
d'un logiciel, et les articles 5, 8 et 9 du présent contrat sont sans objet.
Le cas est courant : dites lequel s'applique. ⟨cocher : hébergé par
l'Éditeur / hébergé par le Client⟩

## 11. Violation de données

L'Éditeur notifie le Client **dans les 48 heures** après avoir eu
connaissance d'une violation, avec la nature de l'incident, les catégories et
le volume approximatif de données concernées, les conséquences probables et
les mesures prises. Le Client reste seul chargé de la notification à
l'autorité de contrôle et, s'il y a lieu, aux personnes concernées.

## 12. Fin du contrat

Au terme du contrat, au choix du Client exprimé par écrit dans les ⟨30⟩ jours :

- **restitution** — le Client reçoit un export complet de son espace ;
- **suppression** — l'espace et ses journaux sont effacés.

Sans instruction au terme de ce délai, l'Éditeur supprime. Les sauvegardes
existantes disparaissent par rotation dans les ⟨14⟩ jours qui suivent.

## 13. Audit

Le Client peut demander, une fois par an et avec un préavis de ⟨30⟩ jours,
les éléments justifiant du respect du présent contrat. Le journal
d'administration de son espace lui est accessible **en permanence** et sans
demande : c'est la première pièce d'un audit.

---

Fait à ⟨lieu⟩, le ⟨date⟩, en deux exemplaires.

**Le Client** ⟨nom, qualité, signature⟩

**L'Éditeur** ⟨nom, qualité, signature⟩
