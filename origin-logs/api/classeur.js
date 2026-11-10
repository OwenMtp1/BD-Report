'use strict';
/* ============================================================
   LE CLASSEUR — ranger un log dans la bonne rubrique
   SANS CONNAÎTRE LE SERVEUR
   ============================================================
   On ne voit jamais la base ni les scripts du client : on reçoit un nom
   de ressource (`okokBanking`), un nom d'évènement
   (`okokBanking:server:withdrawMoney`) et parfois une phrase. Tout le
   rangement se fait donc sur des MOTS.

   Le premier dictionnaire tenait en seize lignes, ne regardait que le
   nom de l'évènement et retenait « le mot le plus long ». Chez un
   client, cela donnait des journaux rangés au hasard :
     · tout ce qui parlait de banque partait en « Boutique : caisse »
       (la caisse de la boutique en euros — rien à voir avec un retrait) ;
     · les téléphones partaient en « Logs des Reports » ;
     · `admin:giveMoney` partait en transactions, parce que « money »
       est plus long que « admin » ;
     · un évènement de `esx_society` sans mot connu n'allait nulle part,
       alors que le nom de la RESSOURCE disait déjà tout.

   Trois choses changent :

   1. ON NOTE, on ne prend plus le premier venu. Chaque mot rapporte des
      points à sa rubrique (fort 5, moyen 3, faible 1), multipliés par
      l'endroit où il a été lu : le nom de l'évènement compte triple, le
      nom de la ressource et le texte libre comptent double. La rubrique
      la mieux notée gagne.

   2. LES ACCORDS. Certains mots ne veulent rien dire seuls : « give »
      est un échange entre joueurs, « admin » + « give » est un don du
      staff ; « ambulance » seule n'est pas une facture, « ambulance » +
      « bill » en est une. Un accord ajoute des points quand ses deux
      familles de mots sont présentes.

   3. LE NOM DE LA RESSOURCE COMPTE. `jg-advancedgarages` range ses
      évènements même quand leur nom ne dit rien.

   ⚠️ POUR AJOUTER UN MOT : une ligne dans DICO, rien d'autre. Montez
   ensuite DICO_VERSION : au démarrage suivant, l'API re-range d'elle-même
   les raccordements déjà posés chez tous les clients — sauf ceux qu'un
   humain a rangés à la main, qui ne bougent jamais.

   Pour voir où tombe un nom, sans serveur ni base :
       node api/classeur.js okokBanking okokBanking:server:withdrawMoney
   ============================================================ */

const DICO_VERSION = 2;

/* ---------- le dictionnaire ----------
   forts   : le mot suffit à désigner la rubrique.
   moyens  : il l'indique, mais un mot fort d'une autre rubrique l'emporte.
   faibles : simple penchant, utile pour départager.
   Tout est en minuscules, SANS ACCENTS (le texte lu est normalisé pareil),
   en français et en anglais : les scripts FiveM mélangent les deux. */
const DICO = {
  bans: {
    forts: ['ban', 'bans', 'banned', 'banni', 'bannir', 'bannissement', 'unban', 'unbanned', 'deban',
            'debannir', 'tempban', 'permban', 'permaban', 'banlist', 'banplayer', 'blacklist', 'blacklisted'],
    moyens: ['banhammer']
  },
  sanctions: {
    forts: ['kick', 'kicked', 'warn', 'warned', 'warns', 'avertissement', 'avertir', 'averti', 'expulser',
            'expulsion', 'expulse', 'mute', 'muted', 'unmute', 'strike', 'sanction', 'sanctions', 'punish',
            'punishment', 'punition'],
    moyens: ['jail', 'jailed', 'unjail', 'prison', 'adminjail', 'comserv', 'communityservice']
  },
  anticheat: {
    forts: ['anticheat', 'cheat', 'cheater', 'cheating', 'triche', 'tricheur', 'hack', 'hacker', 'hacking',
            'exploit', 'exploiting', 'injector', 'injection', 'injected', 'aimbot', 'wallhack', 'modmenu',
            'executor', 'spoof', 'spoofing', 'spoofer', 'detection', 'detected', 'violation', 'fiveguard',
            'secureserve', 'wavesshield', 'phoenixac', 'reaperac', 'electronac', 'valkyrie', 'tampering'],
    moyens: ['detect', 'suspicious', 'suspect', 'illegal', 'abuse', 'flagged', 'forbidden', 'unauthorized']
  },
  reports: {
    forts: ['report', 'reports', 'reported', 'reportplayer', 'ticket', 'tickets', 'signalement', 'signaler',
            'signale', 'helpme', 'calladmin', 'needadmin', 'assistance'],
    moyens: ['support', 'plainte', 'complaint']
  },

  connexions: {
    forts: ['connect', 'connecting', 'connected', 'connexion', 'connecte', 'login', 'loggedin', 'logged',
            'join', 'joined', 'joining', 'queue', 'whitelist', 'whitelisted', 'deferral', 'deferrals',
            'firstjoin', 'firstspawn', 'multichar', 'multicharacter', 'charselect', 'characterselected',
            'characterloaded', 'playerloaded', 'playerjoined', 'playerconnecting', 'arrivee'],
    moyens: ['identifiers', 'character', 'personnage']
  },
  deconnexion: {
    forts: ['disconnect', 'disconnected', 'disconnecting', 'deconnexion', 'deconnecte', 'logout', 'loggedout',
            'leave', 'leaving', 'left', 'quit', 'quitte', 'crash', 'crashed', 'timeout', 'timedout',
            'combatlog', 'playerdropped', 'playerleft', 'depart'],
    moyens: ['unload', 'unloaded']
  },
  ecran_joueur: {
    forts: ['screenshot', 'screenshots', 'capture', 'ecran', 'phone', 'telephone', 'smartphone', 'sms',
            'tweet', 'twitter', 'twitch', 'instagram', 'darkchat', 'darkweb', 'chat', 'chatmessage', 'ooc',
            'annonce', 'announce', 'announcement', 'advert', 'advertisement', 'mail', 'email'],
    moyens: ['screen', 'message', 'messages', 'call', 'appel', 'menu', 'radial', 'interact', 'interaction',
             'emote', 'radio', 'camera', 'photo', 'selfie', 'gallery']
  },
  combat: {
    forts: ['death', 'deaths', 'dead', 'die', 'died', 'dies', 'mort', 'morts', 'deces', 'kill', 'killed',
            'killer', 'kills', 'killfeed', 'murder', 'tuer', 'tue', 'playerdied', 'playerkilled', 'downed',
            'laststand', 'knockout', 'knockedout', 'bleedout', 'coma', 'revive', 'revived', 'reviving',
            'reanimer', 'reanime', 'reanimation', 'respawn', 'respawned', 'headshot'],
    moyens: ['damage', 'damaged', 'shot', 'shoot', 'shooting', 'shots', 'wound', 'wounded', 'injury',
             'injured', 'blesse', 'blessure', 'pvp', 'fight', 'combat', 'degats', 'tir']
  },

  /* « Transactions et coffres » porte AUSSI l'argent en jeu : virements,
     retraits, salaires, achats en magasin. La caisse de la BOUTIQUE (des
     euros, Tebex) est une autre rubrique — voir plus bas. */
  inventaire: {
    forts: ['inventory', 'inventaire', 'stash', 'stashes', 'coffre', 'coffres', 'trunk', 'glovebox',
            'storage', 'stockage', 'item', 'items', 'trade', 'traded', 'trading', 'echange', 'echanger',
            'bank', 'banque', 'banking', 'atm', 'withdraw', 'withdrawal', 'withdrew', 'deposit', 'deposited',
            'retrait', 'retirer', 'depot', 'deposer', 'virement', 'virer', 'transfer', 'transferred',
            'money', 'cash', 'argent', 'liquide', 'wallet', 'portefeuille', 'paycheck', 'payday', 'salary',
            'salaire', 'billing', 'invoice', 'invoices', 'fine', 'fines', 'amende', 'amendes', 'payment',
            'paiement', 'payer', 'paid', 'payout', 'buy', 'bought', 'purchase', 'purchased', 'achat',
            'acheter', 'achete', 'sell', 'sold', 'selling', 'vente', 'vendre', 'vendu', 'shop', 'shops',
            'magasin', 'market', 'marche', 'superette', 'craft', 'crafting', 'crafted',
            'giveitem', 'additem', 'removeitem', 'useitem', 'addmoney', 'removemoney', 'givemoney',
            'blackmoney', 'dirtymoney', 'argentsale', 'laundering', 'launder', 'blanchiment', 'pawnshop',
            'dealer', 'dealership', 'concession', 'concessionnaire'],
    moyens: ['give', 'given', 'gave', 'receive', 'received', 'donner', 'donne', 'recevoir', 'swap', 'move',
             'moved', 'pay', 'price', 'prix', 'cost', 'facture', 'bill', 'bills', 'weapon', 'weapons', 'arme',
             'armes', 'ammo', 'munition', 'munitions', 'account', 'compte', 'balance', 'solde', 'loan', 'pret'],
    // « store » : un magasin, mais aussi « ranger » (`store-vehicle`) et la
    // moitié de « datastore ». Seul, il ne suffit pas à ranger un log.
    faibles: ['add', 'remove', 'take', 'taken', 'use', 'used', 'store', 'stores']
  },
  items_sol: {
    forts: ['pickup', 'pickedup', 'ramasser', 'ramasse', 'ground', 'sol', 'loot', 'looted', 'looting',
            'dumpster', 'poubelle', 'trash', 'throw', 'thrown', 'jeter', 'jete', 'dropitem', 'dropped',
            'itemdrop', 'grounditem', 'worlditem'],
    moyens: ['drop', 'drops', 'search', 'fouille', 'fouiller']
  },
  proprietes: {
    forts: ['house', 'houses', 'housing', 'maison', 'maisons', 'apartment', 'apartments', 'appartement',
            'appart', 'motel', 'motels', 'property', 'properties', 'propriete', 'proprietes', 'realestate',
            'immobilier', 'loyer', 'rent', 'rental', 'tenant', 'locataire', 'landlord', 'mortgage',
            'doorlock', 'doorlocks', 'garage', 'garages', 'parking', 'impound', 'impounded', 'fourriere',
            'furniture', 'meuble', 'meubles', 'wardrobe', 'interior', 'interieur', 'villa', 'entrepot',
            'warehouse'],
    moyens: ['door', 'doors', 'porte', 'portes', 'key', 'keys', 'cle', 'cles', 'owner', 'proprietaire',
             'lockpick', 'cambriolage', 'burglary']
  },

  /* LA BOUTIQUE DU SERVEUR — de l'argent RÉEL. Ne pas confondre avec les
     magasins en jeu, qui sont des transactions. */
  boutique_caisse: {
    forts: ['tebex', 'paypal', 'stripe', 'checkout', 'chargeback', 'refund', 'refunded', 'remboursement',
            'rembourser', 'webstore', 'donation', 'donations', 'donate', 'donated'],
    moyens: ['transaction', 'transactions', 'euro', 'euros', 'encaissement']
  },
  boutique_monnaie: {
    forts: ['vip', 'premium', 'donator', 'donateur', 'coin', 'coins', 'jeton', 'jetons', 'gem', 'gems',
            'boutiquepoints', 'shopcoins', 'vipcoins', 'subscriber', 'abonne', 'abonnement', 'subscription',
            'booster', 'priority'],
    moyens: ['token', 'tokens', 'credit', 'credits', 'points']
  },
  boutique_produits: {
    forts: ['redeem', 'redeemed', 'claim', 'claimed', 'reclamer', 'reclame', 'package', 'packages',
            'starterpack', 'lootbox', 'giftcard', 'voucher', 'coupon', 'promo', 'promocode'],
    moyens: ['boutique', 'reward', 'rewards', 'recompense', 'delivery', 'livraison', 'product', 'products',
             'produit', 'produits', 'stock', 'kit', 'pack', 'bundle']
  },

  jobs: {
    forts: ['job', 'jobs', 'metier', 'metiers', 'duty', 'onduty', 'offduty', 'society', 'societe', 'societes',
            'boss', 'bossmenu', 'entreprise', 'entreprises', 'company', 'business', 'crew', 'crews', 'gang',
            'gangs', 'organisation', 'organization', 'faction', 'factions', 'hire', 'hired', 'hiring',
            'fired', 'recruit', 'recruited', 'recruter', 'embauche', 'embaucher', 'licencier', 'licencie',
            'promote', 'promoted', 'demote', 'demoted', 'promotion', 'setjob', 'setgrade', 'employee',
            'employees', 'employe', 'employes', 'management', 'police', 'lspd', 'bcso', 'sheriff',
            'gendarmerie', 'mechanic', 'mecano', 'mecanicien', 'taxi', 'heist', 'heists', 'braquage',
            'braquages', 'robbery', 'robberies', 'holdup', 'territory', 'territoire', 'territories'],
    moyens: ['grade', 'grades', 'rank', 'ranks', 'rob', 'robbed', 'robbing', 'drug', 'drugs', 'drogue',
             'drogues', 'weed', 'cocaine', 'meth', 'harvest', 'recolte', 'handcuff', 'cuff', 'menotter',
             'menottes', 'arrest', 'arrested', 'arrestation', 'mission', 'missions', 'delivery', 'livraison',
             'garbage', 'trucker', 'miner', 'fishing', 'hunting', 'lumberjack']
  },
  casino: {
    forts: ['casino', 'casinos', 'poker', 'blackjack', 'roulette', 'slotmachine', 'slotmachines',
            'machineasous', 'gamble', 'gambling', 'gambled', 'jackpot', 'lottery', 'loterie', 'luckywheel',
            'wheelspin', 'insidetrack', 'parier', 'pari', 'paris', 'betting', 'baccarat', 'tombola',
            'scratchcard', 'grattage'],
    moyens: ['bet', 'bets', 'miser', 'chips', 'dice', 'croupier']
  },
  facture_ems: {
    forts: ['emsbill', 'medicalbill', 'facturems', 'factureems', 'hospitalbill'],
    moyens: ['ems', 'ambulance', 'ambulancier', 'medic', 'medics', 'medical', 'hospital', 'hopital',
             'doctor', 'medecin', 'pillbox', 'paramedic', 'samu']
  },

  admin: {
    forts: ['noclip', 'godmode', 'invisible', 'invisibility', 'spectate', 'spectating', 'txadmin',
            'easyadmin', 'vmenu', 'adminmenu', 'setgroup', 'setperm', 'setpermission', 'wipe', 'wiped',
            'teleport', 'teleported', 'tp', 'tpm', 'goto', 'bring', 'summon', 'freeze', 'frozen', 'unfreeze',
            'clearinventory', 'clearinv', 'giveweapon', 'spawncar', 'spawnvehicle', 'setmoney', 'adminrevive'],
    moyens: ['admin', 'admins', 'administrator', 'staff', 'staffs', 'moderator', 'moderateur', 'modo',
             'spawn', 'spawned', 'command', 'commande', 'commands', 'permission', 'permissions', 'console',
             'rcon', 'restart', 'debug']
  }
};

/* ---------- les accords ----------
   Deux familles de mots présentes ENSEMBLE désignent une rubrique que
   chacune, seule, ne désigne pas. C'est ce qui sépare le don du staff du
   don entre joueurs, et la facture d'ambulance de la réanimation. */
const STAFF  = ['admin', 'admins', 'administrator', 'staff', 'staffs', 'moderator', 'moderateur', 'modo',
                'txadmin', 'easyadmin', 'vmenu', 'adminmenu'];
const EMS    = ['ems', 'ambulance', 'ambulancier', 'medic', 'medics', 'medical', 'hospital', 'hopital',
                'doctor', 'medecin', 'pillbox', 'paramedic', 'samu'];
const SOCIETE = ['society', 'societe', 'societes', 'boss', 'bossmenu', 'entreprise', 'company', 'business',
                 'gang', 'gangs', 'crew', 'crews', 'organisation', 'organization', 'faction', 'management'];
const ARGENT = ['money', 'cash', 'argent', 'bank', 'banque', 'withdraw', 'withdrawal', 'deposit', 'retrait',
                'depot', 'account', 'compte', 'salary', 'salaire', 'paycheck', 'addmoney', 'removemoney'];
const POLICE = ['police', 'lspd', 'bcso', 'sheriff', 'gendarmerie', 'cop', 'cops'];
const BOUTIQUE = ['tebex', 'boutique', 'webstore', 'donation', 'donator', 'donateur', 'vip', 'premium'];
const JOUEUR = ['player', 'players', 'joueur', 'joueurs', 'user', 'client'];

const ACCORDS = [
  { cat:'admin', poids:25, note:'geste du staff',
    a: STAFF,
    b: ['give', 'given', 'add', 'set', 'remove', 'take', 'spawn', 'spawned', 'revive', 'revived', 'heal',
        'healed', 'tp', 'teleport', 'goto', 'bring', 'freeze', 'unfreeze', 'clear', 'wipe', 'money', 'cash',
        'item', 'items', 'weapon', 'weapons', 'job', 'vehicle', 'car', 'giveitem', 'givemoney', 'addmoney',
        'additem', 'setjob', 'armor', 'armure', 'skin', 'announce', 'annonce'] },
  { cat:'facture_ems', poids:22, note:'facture médicale',
    a: EMS,
    b: ['bill', 'bills', 'billing', 'invoice', 'facture', 'facturer', 'fine', 'pay', 'payment', 'paiement',
        'price', 'prix', 'tarif', 'charge', 'cost'] },
  { cat:'facture_ems', poids:12, note:'soin médical',
    a: EMS,
    b: ['heal', 'healed', 'healing', 'treat', 'treated', 'treatment', 'soin', 'soins', 'soigner', 'soigne',
        'bandage', 'checkin', 'bed', 'lit'] },
  { cat:'jobs', poids:25, note:'compte de société',
    a: SOCIETE, b: ARGENT },
  { cat:'jobs', poids:25, note:'braquage',
    a: ['robbery', 'robberies', 'heist', 'heists', 'braquage', 'braquages', 'holdup', 'rob', 'robbing', 'robbed'],
    b: ['bank', 'banque', 'store', 'shop', 'jewelry', 'jewellery', 'bijouterie', 'fleeca', 'pacific', 'vangelico',
        'atm', 'house', 'humane', 'train', 'casino', 'yacht', 'paleto', 'union', 'depository', 'superette'] },
  { cat:'jobs', poids:14, note:'intervention de police',
    a: POLICE,
    b: ['jail', 'jailed', 'prison', 'handcuff', 'cuff', 'arrest', 'arrested', 'search', 'fouille', 'seize',
        'saisie', 'impound', 'fourriere', 'escort', 'gsr', 'alert', 'dispatch'] },
  { cat:'inventaire', poids:30, note:'amende',
    a: POLICE, b: ['fine', 'fines', 'amende', 'amendes', 'bill', 'billing', 'ticket', 'invoice', 'facture'] },
  { cat:'items_sol', poids:16, note:'objet au sol',
    a: ['drop', 'drops', 'dropped', 'throw', 'thrown', 'jeter', 'jete', 'pickup', 'ground', 'sol'],
    b: ['item', 'items', 'weapon', 'weapons', 'arme', 'objet', 'objets', 'loot', 'inventory', 'money', 'cash'] },
  { cat:'deconnexion', poids:20, note:'départ d’un joueur',
    a: JOUEUR, b: ['dropped', 'drop', 'left', 'leave', 'quit', 'disconnect', 'disconnected', 'logout', 'unloaded'] },
  { cat:'connexions', poids:16, note:'arrivée d’un joueur',
    a: JOUEUR, b: ['loaded', 'joined', 'join', 'connected', 'connecting', 'spawned', 'ready', 'login', 'activated'] },
  { cat:'boutique_monnaie', poids:16, note:'monnaie de boutique',
    a: BOUTIQUE.concat(['shop', 'store']), b: ['coin', 'coins', 'credit', 'credits', 'token', 'tokens', 'points', 'jeton', 'jetons', 'gems'] },
  { cat:'boutique_caisse', poids:16, note:'paiement en boutique',
    a: BOUTIQUE, b: ['payment', 'paiement', 'purchase', 'purchased', 'buy', 'bought', 'achat', 'paid', 'order', 'commande'] },
  { cat:'boutique_produits', poids:14, note:'produit de boutique',
    a: BOUTIQUE, b: ['claim', 'claimed', 'redeem', 'deliver', 'delivered', 'livraison', 'product', 'produit', 'item', 'vehicle', 'car'] },
  { cat:'casino', poids:16, note:'jeu d’argent',
    a: ['casino', 'poker', 'blackjack', 'roulette', 'slotmachine'],
    b: ['bet', 'chips', 'jeton', 'jetons', 'win', 'won', 'lose', 'lost', 'gain', 'perte', 'payout', 'money', 'cash'] },
  { cat:'proprietes', poids:14, note:'coffre de logement',
    a: ['house', 'houses', 'housing', 'maison', 'apartment', 'appartement', 'motel', 'property', 'propriete'],
    b: ['stash', 'storage', 'coffre', 'buy', 'bought', 'sell', 'sold', 'achat', 'vente', 'key', 'keys', 'cle',
        'cles', 'enter', 'entered', 'leave', 'raid'] },
  { cat:'anticheat', poids:20, note:'détection',
    a: ['detect', 'detected', 'detection', 'anticheat', 'suspicious', 'flagged', 'violation'],
    b: ['godmode', 'noclip', 'speed', 'speedhack', 'teleport', 'weapon', 'explosion', 'spawn', 'spawned',
        'invisible', 'damage', 'money', 'resource', 'trigger', 'event', 'entity', 'vehicle'] },
  { cat:'sanctions', poids:14, note:'sanction du staff',
    a: STAFF, b: ['jail', 'jailed', 'unjail', 'prison', 'mute', 'muted', 'comserv'] }
];

/* ---------- ce qui ne doit JAMAIS être rangé ----------
   ⚠️ Un nom qui se déclenche à chaque image n'a rien à faire dans un
   journal : à 40 joueurs, un `hud:update` produit des millions de lignes
   par jour et rend le panneau illisible. On l'écarte AVANT de proposer. */
const BRUIT = ['hud', 'sync', 'tick', 'loop', 'draw', 'nui', 'ping', 'heartbeat', 'refresh',
               'position', 'stress', 'hunger', 'thirst', 'stamina', 'minimap', 'blip', 'marker',
               'anim', 'progress', 'weather', 'voice', 'talking', 'fuel',
               'seatbelt', 'speedometer', 'statebag', 'keepalive', 'callback', 'particle', 'sound',
               // Une LECTURE n'est pas un fait : `bank:getBalance` est appelé à
               // chaque ouverture de menu et ne dit rien de ce qui s'est passé.
               'get', 'fetch', 'getdata'];
/* ⚠️ CES MOTS-LÀ NE SONT DU BRUIT QUE SEULS. « update » écartait
   `OnJobUpdate` (un changement de métier, exactement ce qu'on veut lire)
   et « coords » écartait `TeleportPlayerToCoords` (une téléportation du
   staff). Ils n'écartent plus un nom qui porte par ailleurs un mot FORT :
   `hud:update` reste du bruit, `job:update` n'en est plus. Le garde-fou
   de débit de la ressource (120 par minute) couvre le reste. */
const BRUIT_FAIBLE = ['update', 'updated', 'coords', 'notify', 'notification', 'status', 'state',
                      'config', 'init', 'setup', 'ready', 'check', 'validate', 'list', 'data', 'toggle',
                      'show', 'hide'];

/* ⚠️ LES FAUX AMIS. Un mot-clé de quatre lettres reconnaît aussi ce qui
   COMMENCE par lui (« bank » → « banking ») : c'est ce qui rend le
   dictionnaire tenable, et c'est aussi un piège. « heal » reconnaîtrait
   « health » (la jauge de vie, mise à jour sans arrêt), « store »
   reconnaîtrait « datastore », « report » le métier de « reporter ».
   Ces mots-là ne comptent pour rien. */
const FAUX_AMIS = new Set(['health', 'healthbar', 'healthy', 'restore', 'restored', 'datastore', 'reporter',
  'reporters', 'warning', 'warnings', 'callback', 'callbacks', 'banner', 'banners', 'shopping', 'itemname',
  'storename', 'jobname', 'moneytype', 'firework', 'fireworks', 'firefighter', 'safezone', 'leaderboard',
  'chatbox', 'payload', 'ticketmaster', 'killswitch', 'carwash', 'messagebox', 'screenwidth', 'screenheight']);

/* Mots de liaison : ils ne désignent aucune rubrique, mais servent à
   découper un nom collé (`addmoney` → add + money, `playerdropped` →
   player + dropped). */
const LIANTS = ['add', 'set', 'get', 'remove', 'give', 'take', 'player', 'players', 'server', 'client',
                'event', 'on', 'new', 'open', 'close', 'do', 'use', 'log', 'logs', 'send', 'request',
                'check', 'start', 'stop', 'toggle', 'show', 'hide', 'create', 'delete', 'save', 'load',
                'loaded', 'joined', 'spawned', 'user', 'joueur', 'handler', 'action', 'trigger'];

/* ---------- préparation (une fois) ---------- */
const POIDS = { forts: 5, moyens: 3, faibles: 1 };
const EXACT = new Map();          // mot -> [{cat, poids}]
const PREFIXES = [];              // [{mot, cat, poids}] pour les mots de 4 lettres et plus
const DEDANS = [];                // [{mot, cat, poids}] pour les mots de 6 lettres et plus
for (const [cat, niveaux] of Object.entries(DICO)) {
  for (const [niveau, liste] of Object.entries(niveaux)) {
    for (const mot of liste) {
      const p = POIDS[niveau];
      if (!EXACT.has(mot)) EXACT.set(mot, []);
      EXACT.get(mot).push({ cat, poids: p });
      if (mot.length >= 4) PREFIXES.push({ mot, cat, poids: p });
      if (mot.length >= 6) DEDANS.push({ mot, cat, poids: p });
    }
  }
}
const VOCAB = new Set([...EXACT.keys(), ...LIANTS, ...BRUIT, ...BRUIT_FAIBLE]);
const FORTS = new Set(Object.values(DICO).flatMap(n => n.forts || []));
for (const acc of ACCORDS) for (const m of acc.a.concat(acc.b)) VOCAB.add(m);
const ACC = ACCORDS.map(x => ({ cat: x.cat, poids: x.poids, note: x.note, a: new Set(x.a), b: new Set(x.b) }));

/* À égalité de points, la modération passe d'abord : ranger un
   bannissement en « Action staff » le ferait rater à qui le cherche. */
const PRIORITE = ['bans', 'anticheat', 'sanctions', 'reports', 'facture_ems', 'casino', 'boutique_caisse',
                  'boutique_monnaie', 'boutique_produits', 'items_sol', 'proprietes', 'jobs', 'combat',
                  'inventaire', 'deconnexion', 'connexions', 'admin', 'ecran_joueur'];

const sansAccents = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ⚠️ ON COMPARE DES MOTS, PAS DES MORCEAUX DE MOTS. Chercher le mot-clé
   n'importe où faisait reconnaître « withdraw » par « draw » (du bruit
   d'affichage), « oracle » par « cle », et à peu près tout par « tp ». On
   découpe donc sur les séparateurs ET sur la casse mélangée
   (`playerHudTick` → player, hud, tick). */
function mots(texte) {
  return sansAccents(texte).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/* Un nom collé sans casse (`givemoney`, `playerdropped`) ne se découpe
   pas sur des séparateurs : on essaie de le recouvrir ENTIÈREMENT par des
   mots du vocabulaire. Un seul morceau inconnu, et le mot reste entier —
   « carpet » ne devient pas « car » + « pet ». */
const _decoupe = new Map();
function segmenter(tk) {
  if (_decoupe.has(tk)) return _decoupe.get(tk);
  let res = null;
  if (tk.length >= 6 && tk.length <= 40) {
    const n = tk.length, meilleur = new Array(n + 1).fill(null);
    meilleur[0] = [];
    for (let i = 0; i < n; i++) {
      if (!meilleur[i]) continue;
      for (let j = i + 2; j <= n; j++) {
        const morceau = tk.slice(i, j);
        if (morceau.length < 3 && morceau !== 'on' && morceau !== 'tp') continue;
        if (!VOCAB.has(morceau)) continue;
        // Le découpage en MOINS de morceaux l'emporte : « bankrobbery »
        // est bank + robbery, pas ban + k…
        if (!meilleur[j] || meilleur[j].length > meilleur[i].length + 1) meilleur[j] = meilleur[i].concat(morceau);
      }
    }
    if (meilleur[n] && meilleur[n].length >= 2) res = meilleur[n];
  }
  if (_decoupe.size > 20000) _decoupe.clear();
  _decoupe.set(tk, res);
  return res;
}

/* Ce qu'un mot rapporte : la correspondance EXACTE d'abord (et elle
   seule si elle existe — « mortgage » est un prêt immobilier, pas une
   « mort »), sinon un découpage, sinon un préfixe (4 lettres et plus),
   sinon une inclusion (6 lettres et plus : « advancedgarages »). */
function rapporte(tk) {
  if (FAUX_AMIS.has(tk)) return [];
  const exact = EXACT.get(tk);
  if (exact) return exact.map(x => ({ cat: x.cat, poids: x.poids, mot: tk }));
  const seg = segmenter(tk);
  if (seg) return seg.flatMap(m => (EXACT.get(m) || []).map(x => ({ cat: x.cat, poids: x.poids, mot: m })));
  const out = [], vus = new Set();
  for (const p of PREFIXES) {
    if (tk.startsWith(p.mot) && !vus.has(p.cat + p.mot)) { vus.add(p.cat + p.mot); out.push({ cat: p.cat, poids: p.poids, mot: p.mot }); }
  }
  if (out.length) return gardeLePlusLong(out);
  for (const p of DEDANS) {
    if (tk.includes(p.mot) && !vus.has(p.cat + p.mot)) { vus.add(p.cat + p.mot); out.push({ cat: p.cat, poids: p.poids, mot: p.mot }); }
  }
  return gardeLePlusLong(out);
}
// Par rubrique, un seul mot compte pour un même morceau de texte : le plus
// long. Sinon « banking » rapporterait deux fois (bank + banking).
function gardeLePlusLong(liste) {
  const par = new Map();
  for (const x of liste) { const d = par.get(x.cat); if (!d || x.mot.length > d.mot.length) par.set(x.cat, x); }
  return [...par.values()];
}
// Les mots d'un texte, découpages compris : c'est sur eux que portent les accords.
function developper(tks) {
  const out = new Set();
  for (const tk of tks) { out.add(tk); const s = segmenter(tk); if (s) s.forEach(m => out.add(m)); }
  return out;
}

const colle = (tk, mot) => tk === mot || (mot.length >= 4 && tk.startsWith(mot));
function estBruit(evenement) {
  const t = mots(evenement);
  if (BRUIT.some(m => t.some(tk => !EXACT.has(tk) && colle(tk, m)))) return true;
  if (!BRUIT_FAIBLE.some(m => t.some(tk => colle(tk, m)))) return false;
  // Bruit « faible » : seulement si rien, dans le nom, ne dit de quoi il s'agit.
  return !t.some(tk => rapporte(tk).some(r => FORTS.has(r.mot)));
}

/* ---------- classer ----------
   { ressource, evenement, texte } → { cat, score, mot, mots[], accord } ou null.
   « Je ne sais pas » est une réponse, et elle vaut mieux qu'un rangement
   au hasard que personne ne viendra corriger : sous le seuil, on rend null. */
const SEUIL = 6;
const _cache = new Map();
function classer(o) {
  const ressource = String((o && o.ressource) || ''), evenement = String((o && o.evenement) || '');
  const texte = String((o && o.texte) || '').slice(0, 600);
  const cle = ressource + '\u0001' + evenement + '\u0001' + texte;
  if (_cache.has(cle)) return _cache.get(cle);

  // Le texte libre compte double, comme la ressource : c'est souvent tout ce
  // qu'on a d'un log envoyé sans rubrique (« Mia a été expulsée »).
  const sources = [[mots(evenement), 3], [mots(ressource), 2], [mots(texte), 2]];
  // Le préfixe de l'évènement répète le plus souvent le nom de la ressource
  // (`okokBanking:server:withdraw`) : compté deux fois, il écraserait tout.
  const tkRes = sources[1][0];
  const deRes = { has: tk => tkRes.some(r => r === tk
    || (tk.length >= 4 && r.startsWith(tk)) || (r.length >= 4 && tk.startsWith(r))) };
  const scores = {}, pourquoi = {};
  const tous = new Set();
  sources.forEach(([tks, mult], rang) => {
    const vusIci = new Set();
    for (const tk of tks) {
      if (rang === 0 && deRes.has(tk)) continue;
      if (vusIci.has(tk)) continue; vusIci.add(tk);
      for (const r of rapporte(tk)) {
        scores[r.cat] = (scores[r.cat] || 0) + r.poids * mult;
        const d = pourquoi[r.cat];
        if (!d || r.poids * mult > d.pts) pourquoi[r.cat] = { mot: r.mot, pts: r.poids * mult };
      }
    }
    developper(tks).forEach(m => tous.add(m));
  });
  const accords = [];
  for (const acc of ACC) {
    // Il faut un mot de CHAQUE famille, et pas le même : « money » seul ne
    // fait pas un accord entre deux listes qui le contiennent toutes deux.
    const la = [], lb = [];
    for (const m of tous) { if (acc.a.has(m)) la.push(m); if (acc.b.has(m)) lb.push(m); }
    if (!la.length || !lb.length) continue;
    if (la.length === 1 && lb.length === 1 && la[0] === lb[0]) continue;
    scores[acc.cat] = (scores[acc.cat] || 0) + acc.poids;
    accords.push({ cat: acc.cat, note: acc.note });
    if (!pourquoi[acc.cat]) pourquoi[acc.cat] = { mot: lb[0], pts: acc.poids };
  }
  let best = null;
  for (const cat of PRIORITE) {
    const s = scores[cat]; if (!s) continue;
    if (!best || s > best.score) best = { cat, score: s };
  }
  const res = best && best.score >= SEUIL
    ? { cat: best.cat, score: best.score, mot: pourquoi[best.cat] ? pourquoi[best.cat].mot : null,
        force: pourquoi[best.cat] && pourquoi[best.cat].mot ? pourquoi[best.cat].mot.length : 0,
        accord: (accords.find(a => a.cat === best.cat) || {}).note || null,
        autres: Object.entries(scores).filter(([c]) => c !== best.cat).sort((x, y) => y[1] - x[1]).slice(0, 2)
                  .map(([c, s]) => ({ cat: c, score: s })) }
    : null;
  if (_cache.size > 8000) _cache.clear();
  _cache.set(cle, res);
  return res;
}

module.exports = { DICO_VERSION, DICO, ACCORDS, BRUIT, BRUIT_FAIBLE, FAUX_AMIS, classer, estBruit, mots, segmenter };

/* ---------- à la main, sans serveur ----------
       node api/classeur.js <ressource> <évènement> [texte…]
       node api/classeur.js okokBanking okokBanking:server:withdrawMoney
   Dit la rubrique retenue, le mot qui l'a désignée et les suivantes. */
if (require.main === module) {
  const [ressource, evenement, ...reste] = process.argv.slice(2);
  if (!ressource && !evenement) {
    console.log('Usage : node api/classeur.js <ressource> <évènement> [texte…]');
    process.exit(1);
  }
  const libelle = id => { try { return (require('./catalogue.js').CATS.find(c => c.id === id) || {}).label || id; } catch (e) { return id; } };
  const ev = evenement || ressource;
  if (estBruit(ev)) console.log('⚠ bruit : cet évènement se déclenche trop souvent pour être journalisé.');
  const r = classer({ ressource, evenement: ev, texte: reste.join(' ') });
  if (!r) { console.log('→ aucune rubrique (aucun mot connu) : ajoutez un mot dans DICO.'); process.exit(0); }
  console.log(`→ ${libelle(r.cat)}  [${r.cat}]  ${r.score} points — mot : « ${r.mot} »${r.accord ? ' · accord : ' + r.accord : ''}`);
  for (const a of r.autres) console.log(`   puis ${libelle(a.cat)} (${a.score})`);
}
