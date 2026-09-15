# Brancher vos scripts — un exemple par rubrique

La ressource `origin_logs` journalise toute seule ce que le serveur de jeu
publie lui-même : connexions, déconnexions, morts, anticheat, bannissements,
actions staff, et — quand le framework est reconnu — l'argent, les métiers et
les coffres. **Sept rubriques ne peuvent venir que de VOS scripts**, parce
que rien de standard ne les émet : la boutique, le casino, les factures EMS,
l'immobilier et les objets au sol appartiennent à des ressources que chaque
serveur choisit, écrit ou achète.

Ce fichier donne **une ligne à copier pour chacune**. Elles fonctionnent
quel que soit votre framework — ESX, QBCore, QBox, ox, ou un socle maison :
l'export ne demande rien d'autre qu'un `source` et une phrase.

> ⚠️ **Collez ces lignes dans VOS ressources, pas dans `origin_logs`.**
> Une mise à jour du panneau remplacerait le dossier ; votre code, lui, doit
> survivre. Et c'est au script qui connaît l'évènement de le raconter :
> `origin_logs` n'a pas à deviner le nom de vos produits ni le tarif de vos
> soins.

---

## L'appel, une fois pour toutes

```lua
exports['origin_logs']:Log({
  cat    = 'casino',        -- la rubrique (voir le tableau plus bas)
  sev    = 'info',          -- info | notice | alerte | critique
  actor  = source,          -- l'ID du joueur, ou sa table framework
  target = autreSource,     -- facultatif : l'autre joueur concerné
  msg    = 'phrase lisible par un humain',
  data   = { },             -- ce qu'on relira dans l'inspecteur
  res    = 'ma_ressource'   -- qui a écrit : on remonte à la source d'un bug
})
```

**`msg` se lit, `data` se cherche.** Le flux affiche `msg` — écrivez-le comme
vous le diriez à un modérateur, avec le nom et le montant DEDANS. `data` n'est
pas décoratif : la recherche plein texte va le chercher, et c'est lui qu'on
ouvre quand la phrase ne suffit plus.

**Choisir la gravité.** `info` pour ce qui est normal, `notice` pour ce qu'on
veut pouvoir retrouver, `alerte` pour ce qui mérite un coup d'œil ce soir,
`critique` pour ce qui ne peut pas attendre. Une rubrique entièrement en
`alerte` ne dit plus rien : c'est le contraste qui fait le tri.

Deux raccourcis existent quand il n'y a rien de plus à dire :

```lua
exports['origin_logs']:Info('casino', 'Kaleb a misé 500 $ au blackjack', { mise = 500 }, source)
exports['origin_logs']:Alerte('casino', 'Kaleb a gagné 42 000 $ en 4 mains', { gain = 42000 }, source)
```

---

## Boutique : caisse — `boutique_caisse`

Les paiements réels. C'est la rubrique qu'on rouvre quand un joueur dit
« j'ai payé et je n'ai rien reçu » : sans elle, on n'a que le relevé du
prestataire de paiement, d'un côté, et un joueur mécontent de l'autre.

```lua
-- À l'encaissement (webhook Tebex/Paypal, ou votre panel de vente)
exports['origin_logs']:Log({
  cat = 'boutique_caisse', sev = 'notice', actor = source,
  msg = ('%s a payé %.2f € — commande %s'):format(nomJoueur, montant, refCommande),
  data = { kind = 'paiement', montant = montant, devise = 'EUR',
           commande = refCommande, moyen = 'paypal', statut = 'valide' },
  res = 'ma_boutique'
})

-- Un échec compte AUTANT qu'une réussite : c'est lui qui explique
-- « j'ai payé trois fois » sur le relevé bancaire d'un joueur.
exports['origin_logs']:Log({
  cat = 'boutique_caisse', sev = 'alerte', actor = source,
  msg = ('Paiement REFUSÉ pour %s — %.2f € (%s)'):format(nomJoueur, montant, raison),
  data = { kind = 'echec', montant = montant, commande = refCommande, raison = raison },
  res = 'ma_boutique'
})

-- Un remboursement se journalise comme un paiement, en négatif assumé.
exports['origin_logs']:Log({
  cat = 'boutique_caisse', sev = 'alerte', actor = source,
  msg = ('Remboursement de %.2f € à %s — %s'):format(montant, nomJoueur, motif),
  data = { kind = 'remboursement', montant = montant, commande = refCommande, motif = motif },
  res = 'ma_boutique'
})
```

## Boutique : monnaie et grades — `boutique_monnaie`

La monnaie premium et les grades VIP. Deux choses qui se donnent à la main
bien plus souvent qu'on ne le croit — concours, dédommagement, erreur — et
qui n'ont aucune trace ailleurs.

```lua
exports['origin_logs']:Log({
  cat = 'boutique_monnaie', sev = 'info', actor = source,
  msg = ('%s a reçu %d jetons (%s)'):format(nomJoueur, nb, origine),
  data = { kind = 'credit', jetons = nb, origine = origine, solde = soldeApres },
  res = 'ma_boutique'
})

-- ⚠️ Un don du staff n'est PAS un achat : le dire, sinon la comptabilité
-- de la boutique compte comme vendu ce qui a été offert.
exports['origin_logs']:Log({
  cat = 'boutique_monnaie', sev = 'notice', actor = staffSource, target = source,
  msg = ('%s a offert %d jetons à %s — %s'):format(nomStaff, nb, nomJoueur, motif),
  data = { kind = 'don_staff', jetons = nb, motif = motif },
  res = 'ma_boutique'
})

exports['origin_logs']:Log({
  cat = 'boutique_monnaie', sev = 'notice', actor = source,
  msg = ('%s passe au grade %s jusqu’au %s'):format(nomJoueur, grade, finLisible),
  data = { kind = 'grade', grade = grade, expire = finTimestamp, commande = refCommande },
  res = 'ma_boutique'
})
```

## Boutique : produits — `boutique_produits`

Ce que le joueur a réellement REÇU en jeu, et ce que vous avez changé au
catalogue. La caisse dit qu'il a payé ; celle-ci dit que la voiture est
arrivée dans son garage.

```lua
exports['origin_logs']:Log({
  cat = 'boutique_produits', sev = 'info', actor = source,
  msg = ('%s a reçu « %s » (commande %s)'):format(nomJoueur, produit, refCommande),
  data = { kind = 'livraison', produit = produit, quantite = qte,
           commande = refCommande, vehicule = plaque },
  res = 'ma_boutique'
})

-- Un changement de prix explique à lui seul la moitié des réclamations.
exports['origin_logs']:Log({
  cat = 'boutique_produits', sev = 'notice', actor = staffSource,
  msg = ('%s passe « %s » de %.2f € à %.2f €'):format(nomStaff, produit, avant, apres),
  data = { kind = 'prix', produit = produit, avant = avant, apres = apres },
  res = 'ma_boutique'
})

exports['origin_logs']:Log({
  cat = 'boutique_produits', sev = 'alerte', actor = source,
  msg = ('Livraison IMPOSSIBLE de « %s » à %s — %s'):format(produit, nomJoueur, raison),
  data = { kind = 'echec_livraison', produit = produit, commande = refCommande, raison = raison },
  res = 'ma_boutique'
})
```

## Casino — `casino`

```lua
exports['origin_logs']:Log({
  cat = 'casino', sev = 'info', actor = source,
  msg = ('%s mise %d $ au %s'):format(nomJoueur, mise, jeu),
  data = { kind = 'mise', jeu = jeu, mise = mise, table = idTable },
  res = 'mon_casino'
})

-- ⚠️ Le SEUIL est tout l'intérêt de la rubrique : un gain ordinaire est du
-- bruit, un gain énorme est soit une belle soirée, soit un exploit. Faites
-- monter la gravité avec le montant, sinon personne ne relira jamais rien.
exports['origin_logs']:Log({
  cat = 'casino', sev = gain >= 100000 and 'alerte' or 'info', actor = source,
  msg = ('%s gagne %d $ au %s'):format(nomJoueur, gain, jeu),
  data = { kind = 'gain', jeu = jeu, gain = gain, mise = mise,
           solde = soldeApres, table = idTable },
  res = 'mon_casino'
})

exports['origin_logs']:Log({
  cat = 'casino', sev = 'info', actor = source,
  msg = ('%s échange %d jetons contre %d $'):format(nomJoueur, jetons, argent),
  data = { kind = 'change', jetons = jetons, argent = argent, sens = 'sortie' },
  res = 'mon_casino'
})
```

## Facture EMS — `facture_ems`

```lua
exports['origin_logs']:Log({
  cat = 'facture_ems', sev = 'info', actor = medecinSource, target = patientSource,
  msg = ('%s facture %d $ à %s — %s'):format(nomMedecin, montant, nomPatient, soin),
  data = { kind = 'facture', montant = montant, soin = soin,
           lieu = lieu, duree = dureeMinutes },
  res = 'mon_ems'
})

-- ⚠️ `target` n'est pas un détail : c'est ce qui fait apparaître la facture
-- dans le DOSSIER du patient. Sans lui, l'évènement n'existe que du côté du
-- médecin, et l'on ne peut plus répondre à « combien m'a-t-il facturé ? ».
exports['origin_logs']:Log({
  cat = 'facture_ems', sev = 'notice', actor = medecinSource, target = patientSource,
  msg = ('%s a réanimé %s (facture %d $)'):format(nomMedecin, nomPatient, montant),
  data = { kind = 'reanimation', montant = montant, sur_place = true },
  res = 'mon_ems'
})

exports['origin_logs']:Log({
  cat = 'facture_ems', sev = 'alerte', actor = medecinSource, target = patientSource,
  msg = ('Facture ANNULÉE : %d $ à %s — %s'):format(montant, nomPatient, motif),
  data = { kind = 'annulation', montant = montant, motif = motif },
  res = 'mon_ems'
})
```

## Immobilier — `proprietes`

```lua
exports['origin_logs']:Log({
  cat = 'proprietes', sev = 'notice', actor = source,
  msg = ('%s achète %s pour %d $'):format(nomJoueur, adresse, prix),
  data = { kind = 'achat', bien = idBien, adresse = adresse, prix = prix },
  res = 'mon_immobilier'
})

exports['origin_logs']:Log({
  cat = 'proprietes', sev = 'notice', actor = vendeurSource, target = acheteurSource,
  msg = ('%s vend %s à %s pour %d $'):format(nomVendeur, adresse, nomAcheteur, prix),
  data = { kind = 'vente', bien = idBien, adresse = adresse, prix = prix },
  res = 'mon_immobilier'
})

-- ⚠️ La CLÉ PARTAGÉE est la rubrique entière. « On m'a vidé mon coffre »
-- se règle en regardant qui avait la clé, et depuis quand — jamais en
-- regardant qui est entré.
exports['origin_logs']:Log({
  cat = 'proprietes', sev = 'alerte', actor = source, target = beneficiaireSource,
  msg = ('%s donne une clé de %s à %s'):format(nomJoueur, adresse, nomAutre),
  data = { kind = 'cle', bien = idBien, adresse = adresse, action = 'donnee' },
  res = 'mon_immobilier'
})

exports['origin_logs']:Log({
  cat = 'proprietes', sev = 'info', actor = source,
  msg = ('%s retire %d× %s du coffre de %s'):format(nomJoueur, qte, item, adresse),
  data = { kind = 'coffre', bien = idBien, item = item, quantite = qte, sens = 'retrait' },
  res = 'mon_immobilier'
})
```

## Items au sol — `items_sol`

⚠️ **Celle-ci se règle avant de la brancher.** Un serveur bien rempli jette
des objets en permanence : tout journaliser noie la rubrique et gonfle la
base pour rien. Ne remontez que ce qui a de la valeur — un seuil de prix, une
liste d'items sensibles, ou les deux.

```lua
-- Un filtre, pas un robinet ouvert.
local SURVEILLES = { weapon_pistol = true, weapon_assaultrifle = true, gold_bar = true }

local function meriteUnLog(item, qte, valeur)
  return SURVEILLES[item] or (valeur or 0) * qte >= 5000
end

if meriteUnLog(item, qte, valeurUnitaire) then
  exports['origin_logs']:Log({
    cat = 'items_sol', sev = 'notice', actor = source,
    msg = ('%s jette %d× %s'):format(nomJoueur, qte, item),
    data = { kind = 'drop', item = item, quantite = qte,
             coords = { x = c.x, y = c.y, z = c.z } },
    res = 'mon_inventaire'
  })
end

-- Le ramassage est l'autre moitié : un objet jeté puis ramassé par un
-- inconnu quinze secondes plus tard, c'est une histoire ; jeté seul, non.
exports['origin_logs']:Log({
  cat = 'items_sol', sev = 'notice', actor = source,
  msg = ('%s ramasse %d× %s'):format(nomJoueur, qte, item),
  data = { kind = 'pickup', item = item, quantite = qte, jete_par = proprietaireInitial },
  res = 'mon_inventaire'
})
```

## Écran du joueur — `ecran_joueur`

Cette rubrique a **deux moitiés**, et une seule est déjà branchée. Les
captures d'écran demandées depuis le panneau y arrivent toutes seules (voir
`server/captures.lua`). L'autre moitié — ce que le joueur a sous les yeux :
menus ouverts, interactions, HUD — ne peut venir que de votre interface.

⚠️ **C'est ce qui donne son sens à une capture.** Une image seule montre un
écran à un instant ; la suite des menus ouverts juste avant montre ce que le
joueur était en train de faire. C'est cette suite qu'on relit quand la
capture ne prouve rien par elle-même.

```lua
exports['origin_logs']:Log({
  cat = 'ecran_joueur', sev = 'info', actor = source,
  msg = ('%s a ouvert %s'):format(nomJoueur, libelleEcran),
  data = { kind = 'screen', ecran = idEcran, zone = zone },
  res = 'mon_hud'
})

-- Une interaction qui échoue en dit plus qu'une qui réussit : c'est là que
-- se voient les menus forcés et les distances impossibles.
exports['origin_logs']:Log({
  cat = 'ecran_joueur', sev = 'notice', actor = source,
  msg = ('%s tente %s hors de portée (%.1f m)'):format(nomJoueur, action, distance),
  data = { kind = 'interaction', action = action, distance = distance, cible = idCible },
  res = 'mon_hud'
})
```

⚠️ Comme pour les objets au sol, **filtrez**. Un HUD ouvre et ferme des
panneaux en permanence ; ne remontez que ce qui a une conséquence — un menu
qui donne de l'argent, un achat, une interaction refusée.

---

## Le tableau complet

| Rubrique | `cat` | Qui l'émet |
|---|---|---|
| Bannissement | `bans` | `origin_logs` |
| Avertissement | `sanctions` | `origin_logs` |
| Anticheat | `anticheat` | `origin_logs` |
| Connexion | `connexions` | `origin_logs` |
| Déconnexion | `deconnexion` | `origin_logs` |
| Écran du joueur | `ecran_joueur` | `origin_logs` pour les captures · **vos scripts** pour les menus |
| Mort joueur | `combat` | `origin_logs` (via `baseevents`) |
| Transactions et coffres | `inventaire` | framework + `ox_inventory` |
| Entreprise et crew | `jobs` | framework (ESX / QBCore / QBox) |
| Action staff | `admin` | `origin_logs` |
| **Boutique : caisse** | `boutique_caisse` | **vos scripts** |
| **Boutique : monnaie et grades** | `boutique_monnaie` | **vos scripts** |
| **Boutique : produits** | `boutique_produits` | **vos scripts** |
| **Casino** | `casino` | **vos scripts** |
| **Facture EMS** | `facture_ems` | **vos scripts** |
| **Immobilier** | `proprietes` | **vos scripts** |
| **Items au sol** | `items_sol` | **vos scripts** |

Une rubrique inconnue n'est pas rejetée : elle est rattachée à **Action
staff** et reste visible. Une faute de frappe dans un `cat` ne perd donc rien
— mais elle range l'évènement au mauvais endroit, et c'est exactement ce
qu'on voit en ouvrant « Action staff » après avoir branché un script.

## Vérifier que ça marche

1. Déclenchez l'action en jeu.
2. Ouvrez la rubrique dans le panneau. Le flux est en **temps réel** :
   l'évènement doit apparaître en quelques secondes, sans recharger.
3. Rien ne vient ? Regardez la console du serveur de jeu : `origin_logs`
   annonce ses envois et ses refus. Un `401` est une clé qui ne correspond
   pas (`set origin_logs_key` dans `server.cfg`) **ou un espace fermé** —
   les deux se disent de la même façon, exprès : un serveur de jeu n'a pas
   à apprendre d'un refus que l'espace existe. Un `429` est un débit trop
   élevé : groupez vos appels plutôt que d'en émettre un par objet.
4. **Supervision → Vérifier** dit, côté panneau, si cet espace reçoit bien
   quelque chose.

## Les envois sont groupés

`Origin.Log` n'ouvre pas une requête HTTP par évènement : les lignes
s'accumulent et partent par lots (`Config.BatchSize`, `Config.FlushMs` dans
`config.lua`), et un dernier envoi a lieu à l'arrêt de la ressource pour que
la fin de soirée ne disparaisse pas. Vous pouvez donc appeler l'export dans
une boucle sans précaution particulière — c'est prévu pour.
