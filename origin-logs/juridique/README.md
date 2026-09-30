# Documents RGPD — modèles

Un panneau de logs enregistre, par construction, des données personnelles :
un identifiant FiveM désigne une personne, même sans son nom. Vendre ce
panneau à un serveur, c'est donc traiter des données **pour le compte
d'autrui** — ce que le RGPD appelle la sous-traitance, et qui impose un
contrat écrit (article 28).

Ces trois modèles couvrent ce qui est demandé en pratique :

| Fichier | À quoi il sert | Qui le signe / le lit |
|---|---|---|
| **[SOUS-TRAITANCE.md](SOUS-TRAITANCE.md)** | Le contrat entre vous (l'éditeur) et le serveur client | les deux parties |
| **[MENTION-JOUEURS.md](MENTION-JOUEURS.md)** | Ce que le serveur affiche à ses joueurs | les joueurs |
| **[CONSERVATION.md](CONSERVATION.md)** | Ce qui est gardé, où, combien de temps | vous, et l'autorité qui demande |

---

## ⚠️ Ce sont des MODÈLES, pas un avis juridique

Ils sont écrits d'après ce que le logiciel fait réellement — chaque
affirmation renvoie au code qui la tient — et **c'est justement leur
limite** : ils décrivent l'outil, pas votre situation. Votre forme
juridique, votre pays d'hébergement, l'âge de vos joueurs et ce que vos
clients font du panneau changent le reste.

**Faites-les relire par un juriste avant de les signer ou de les publier.**
Un modèle signé sans relecture engage exactement comme un contrat rédigé :
c'est la relecture qui manque, pas la signature.

## Qui est qui

Dans le vocabulaire du RGPD, et tel que le produit est construit :

- **Le serveur de jeu client est le RESPONSABLE DE TRAITEMENT.** C'est lui
  qui décide de journaliser, ce qu'il journalise et combien de temps. C'est
  lui qui répond à ses joueurs.
- **Vous, éditeur du panneau, êtes le SOUS-TRAITANT.** Vous fournissez
  l'outil et l'hébergement, vous n'avez aucune raison légitime d'exploiter
  les journaux d'un serveur pour votre compte.

⚠️ **Cette répartition n'est pas une commodité de rédaction : elle doit être
vraie.** Le jour où vous lisez les journaux d'un client pour votre propre
usage — statistiques commerciales, entraînement d'un modèle, curiosité — vous
cessez d'être sous-traitant sur ce point, et le contrat ci-joint ne décrit
plus la réalité. Techniquement, l'accès est déjà borné : entrer dans l'espace
d'un client est une **permission** (`env.access`), chaque entrée laisse une
trace dans le journal d'administration, et le client peut la relire.

## Ce que l'outil sait déjà faire

Les modèles s'appuient sur des fonctions qui existent, pas sur des promesses :

- **Export des données d'un joueur** — bouton dans le dossier joueur, droit
  `players.gdpr`. Rend un fichier JSON complet (droit d'accès, art. 15).
- **Effacement** — même écran. Efface les évènements et **pseudonymise** les
  sanctions : un bannissement reste opposable sans porter le nom de la
  personne. Un bannissement actif exige une confirmation explicite.
- **Durée de conservation par espace**, appliquée par une purge automatique.
- **Journal d'administration** — qui a consulté, exporté, effacé, et quand.
- **Cloisonnement par espace** — un client ne voit jamais les journaux d'un
  autre, y compris à travers le cache.

Ce qui reste **à votre charge**, et qu'aucun modèle ne remplace : héberger
dans l'Union européenne (ou encadrer le transfert), chiffrer les sauvegardes
si elles quittent le serveur, tenir la liste de vos propres sous-traitants
(hébergeur, sauvegarde), et répondre aux demandes dans le délai d'un mois.
