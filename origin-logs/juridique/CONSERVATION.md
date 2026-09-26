# Registre de conservation — ce qui est gardé, où, combien de temps

> ⚠️ **MODÈLE À FAIRE RELIRE PAR UN JURISTE.** Ce document a une vertu que
> les deux autres n'ont pas : il n'est pas déclaratif. Chaque ligne renvoie
> au code qui l'applique. S'il cesse d'être vrai, c'est que le code a changé.

Ce registre sert deux fois : à remplir l'article 30 du RGPD (registre des
activités de traitement), et à répondre à un client qui demande « et
concrètement, ça part quand ? ».

---

## 1. Ce qui est stocké, et où

| Donnée | Emplacement | Effacée par |
|---|---|---|
| Évènements de jeu | table `events` (SQLite) | purge automatique (durée de l'espace), **sauf conservation illimitée** |
| Joueurs vus | table `players` | effacement RGPD, ou suppression de l'espace |
| Sanctions | table `sanctions` | jamais automatiquement — voir §3 |
| Captures d'écran (métadonnées) | table `screens` | purge automatique |
| Captures d'écran (images) | fichiers, `api/data/screens/<espace>/` | purge automatique, **fichier compris** |
| Comptes du staff | table `staff` | suppression du compte ou de l'espace |
| Journal d'administration | table `audit` | purge automatique à 180 jours |
| Sanctions en attente d'exécution | table `actions` | 7 jours après exécution |
| Sauvegardes | fichiers, `api/data/backups/` | rotation (14 fichiers gardés) |

⚠️ **Aucune adresse IP n'est collectée.** La colonne `players.ip_hash` existe
dans le schéma mais **n'est jamais renseignée** : la ressource de jeu ne
transmet que la licence, le Steam, le Discord et le FiveM. Si un jour elle
devait l'être, la mention aux joueurs et le contrat de sous-traitance
devraient être modifiés d'abord — c'est le genre d'ajout qui se fait sans y
penser, d'où cette ligne.

⚠️ **Aucun mot de passe en clair.** `staff.pass` est une empreinte scrypt.
Un mot de passe oublié se réinitialise, il ne se retrouve pas.

## 2. Durées appliquées

**La durée est réglée par espace**, donc par client, et la purge tourne
toutes les 6 heures ainsi qu'à chaque démarrage.

| | Durée | Réglage |
|---|---|---|
| Évènements | **30 jours** par défaut, ou jamais | fiche de l'espace, `RETENTION_DAYS` |
| Captures d'écran | la même, sauf réglage distinct | `SCREEN_DAYS` |
| Sessions de connexion au panneau | 7 jours | `SESSION_DAYS` |
| Sauvegardes | 14 fichiers, soit ~14 jours | `BACKUP_KEEP` |
| Journal d'administration | **180 jours** | `AUDIT_DAYS` |

⚠️ **La formule commerciale BORNE la durée, elle ne la fixe pas.** Un client
qui demande 7 jours en formule illimitée garde 7 jours : c'est le plafond qui
descend, jamais la demande qui monte. Une formule Starter plafonnée à 7 jours
raccourcira en revanche un espace réglé sur 30.

### La conservation illimitée

La fiche d'un espace porte une case **« Ne jamais effacer les journaux »**
(`spaces.keep_forever`, appliquée par `api/conservation.js`). Cochée, la purge
saute cet espace : ni les évènements, ni les captures d'écran n'en partent.

⚠️ **C'est une décision à prendre en connaissance de cause, pas un confort.**
Le RGPD n'interdit pas une conservation longue, mais il interdit une
conservation *indéterminée* : l'article 5.1.e demande une durée **justifiée
par la finalité**. « On garde tout, au cas où » n'est pas une finalité. Si un
client active cette case, il lui faut une raison écrite — contentieux en
cours, obligation de preuve, archive de saison fermée — et sa mention aux
joueurs (`MENTION-JOUEURS.md`) doit dire « conservation illimitée » et non
« 30 jours ». Le droit à l'effacement d'un joueur, lui, continue de
s'appliquer : c'est `/api/rgpd/<clé>` qui le sert, pas la purge.

⚠️ **La case ne passe pas au-dessus du plafond d'une formule.** Sous une
formule plafonnée à 7 jours, elle reste cochée mais sans effet, et la fiche
l'écrit en clair plutôt que de le taire — sinon le commercial promettrait ce
que la purge ne tiendra pas.

⚠️ **La décocher détruit.** Au balayage suivant (6 h au plus), tout ce qui
dépasse la durée redevenue active part définitivement. Le panneau demande
confirmation, et les deux décisions — cocher, décocher — sont inscrites au
journal d'administration (`plateforme.conservation.*`) avec leur auteur.

⚠️ **Le disque, lui, n'est pas illimité.** Les captures d'écran restent
bornées par le quota par espace (`SCREEN_QUOTA_MB`), qui **refuse** les
nouvelles au lieu d'effacer les anciennes : un espace en conservation
illimitée cesse d'accepter des captures une fois son quota atteint, et le
dit. Les journaux texte, eux, n'ont pas de plafond — la page *Supervision*
affiche le poids de chaque espace, et c'est là qu'on le surveille.

⚠️ **La purge ne se rattrape pas d'elle-même sur les sauvegardes.** Une donnée
effacée du service subsiste dans les sauvegardes déjà prises, jusqu'à ce que
la rotation les remplace — environ 14 jours. C'est un choix : une sauvegarde
qu'on rouvrirait pour en retirer une ligne ne serait plus fiable, et une
sauvegarde non fiable ne sert à rien le jour où elle sert.

## 3. Les sanctions ne s'effacent pas toutes seules

Un bannissement reste au registre tant qu'il produit effet : c'est ce
registre que le serveur de jeu interroge à chaque connexion. Le purger à
30 jours reviendrait à lever les bannissements définitifs au bout d'un mois.

Un effacement RGPD demandé par un joueur banni **pseudonymise** la sanction
au lieu de la supprimer : le nom devient `effacé-xxxxxxxx`, la mesure
demeure. Le panneau exige une confirmation explicite dans ce cas — il y a
deux intérêts opposés, et c'est à un humain de trancher.

## 4. Le journal d'administration a sa propre durée

Qui a consulté un dossier, qui a exporté, qui a effacé, qui est entré dans
l'espace d'un client : ces traces **ne suivent pas** la durée des journaux de
jeu. Elles sont gardées **180 jours**, puis purgées comme le reste.

Elles ne suivent pas cette durée parce qu'elles n'ont pas le même objet : les
effacer à 30 jours priverait un audit de sa matière, puisqu'un audit porte
justement sur la période écoulée. Elles ne sont pas gardées indéfiniment non
plus — ce serait le seul endroit du produit où une donnée ne partirait jamais.

⚠️ Elles contiennent des pseudonymes de staff, et le nom de la personne
concernée lorsque l'action en nomme une. Un effacement RGPD ne les touche
pas : la trace « telles données ont été effacées, par untel, à telle date »
est précisément ce qui prouve que l'effacement a eu lieu. Vérifiez cette
durée de 180 jours avec votre juriste : certaines obligations en imposent
une autre, et elle se règle par `AUDIT_DAYS` dans `api/.env`. Si vous la
changez, **changez aussi ce document** — c'est lui qu'on opposera à votre
client, pas le fichier de configuration.

## 5. Ce qui part quand un client s'en va

| Geste | Effet |
|---|---|
| **Fermer** un espace | plus personne n'entre, le serveur de jeu cesse d'écrire, **les journaux restent** |
| **Exporter** un espace | un fichier remis au client, contenant tout — y compris les empreintes de mots de passe et la clé d'ingestion : il vaut un accès |
| **Supprimer** un espace | journaux, joueurs, sanctions, captures et comptes effacés ; le nom exact doit être retapé pour confirmer |

Après suppression, les sauvegardes antérieures gardent les données jusqu'à
leur rotation (~14 jours). Si le client exige un effacement immédiat et
total, il faut **aussi** supprimer les sauvegardes concernées — geste manuel,
à faire en connaissance de cause puisqu'il retire un filet de sécurité.

## 6. Vérifier que tout cela est vrai

- **Supervision → Vérifier** contrôle l'intégrité de la base, l'âge de la
  dernière sauvegarde et la place occupée.
- **Supervision → Sauvegardes** montre ce qui existe réellement, avec les
  dates.
- **Journal d'administration** montre les accès.
- Les suites de contrôle (`node test/run.js`) figent le cloisonnement entre
  espaces, l'absence de mot de passe en clair, le masquage des identifiants
  et le comportement de l'effacement RGPD.

---

*Établi le ⟨date⟩ · à revoir à chaque changement de durée ou de périmètre.*
