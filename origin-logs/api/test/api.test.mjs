// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE, KEY = process.env.KEY;
const j=async(r)=>({status:r.status, body:await r.json().catch(()=>null)});
let cookie='';
const call=(p,o={})=>fetch(B+p,{...o,headers:{'content-type':'application/json',cookie,...(o.headers||{})}});
const T=[]; const t=(n,ok,x='')=>{T.push([ok,n,x]); console.log((ok?'  ok  ':'  ÉCHEC ')+n+(x?'  → '+x:''));};

// 1. ingestion refusée sans clé
t('ingestion refusée sans clé serveur', (await call('/api/ingest',{method:'POST',body:'{}'})).status===401);

// 2. ingestion d'un lot
const now=Date.now();
const evs=[
 {ts:now-3600e3,cat:'connexions',sev:'info',actor:{key:'license:aaa',name:'Luca Moreau',sid:42,discord:'discord:123',steam:'steam:11000010abc'},msg:'Luca Moreau a rejoint le serveur',data:{kind:'join',ping:'48 ms'},res:'origin_core'},
 {ts:now-1800e3,cat:'anticheat',sev:'critique',actor:{key:'license:bbb',name:'Rayan Reyes',sid:88},msg:'Injection de ressource détectée — Rayan Reyes',data:{detection:'resource_injection',ressource:'eulen'},res:'origin_guard'},
 {ts:now-900e3,cat:'admin',sev:'notice',actor:{key:'license:staff1',name:'Nyx',staff:true},msg:'Nyx a activé le noclip',data:{kind:'noclip'},res:'txAdmin'},
 {ts:now-600e3,cat:'inventaire',sev:'info',actor:{key:'license:aaa',name:'Luca Moreau',sid:42},target:{key:'license:bbb',name:'Rayan Reyes'},msg:'Luca Moreau a viré 12 400 $ à Rayan Reyes',data:{montant:12400},res:'origin_banking'},
 {cat:'nimporte',sev:'nimporte',actor:{name:'X'},msg:'catégorie inconnue repliée sur la rubrique de repli'}
];
const ing=await j(await fetch(B+'/api/ingest',{method:'POST',headers:{'content-type':'application/json','x-origin-key':KEY},body:JSON.stringify({server:'origin-1',events:evs})}));
t('ingestion du lot', ing.body?.recus===5, JSON.stringify(ing.body));

// 3. lecture refusée sans session
t('lecture refusée sans session', (await call('/api/events')).status===401);

// 4. mauvais mot de passe
t('mot de passe refusé', (await call('/api/auth/login',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'faux'})})).status===401);

// 5. connexion fondateur
let r=await call('/api/auth/login',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
cookie=(r.headers.get('set-cookie')||'').split(';')[0];
const meF=await r.json();
t('connexion fondateur', r.status===200 && meF.staff.role==='fondateur' && meF.cats.length===17, meF.cats?.length+' catégories');

// 6. requêtes
let ev=(await(await call('/api/events?limit=50')).json());
t('le fondateur voit les 5 évènements', ev.total===5, 'total='+ev.total);
let ac=(await(await call('/api/events?cat=anticheat')).json());
t('filtre par catégorie', ac.total===1 && ac.events[0].cat==='anticheat');
let se=(await(await call('/api/events?q=eulen')).json());
t('recherche plein texte dans le payload', se.total===1, 'total='+se.total);
let se2=(await(await call('/api/events?q=detectee')).json());
t('recherche insensible aux accents', se2.total===1, 'total='+se2.total);

// 7. stats
const st=await(await call(`/api/stats?from=${now-2*3600e3}&to=${Date.now()}&buckets=24`)).json();
t('statistiques', st.total===5 && st.anticheat===1 && st.alerts===1 && st.series.length===24, `total=${st.total} alertes=${st.alerts}`);

// 8. dossier joueur
const pf=await(await call('/api/players/'+encodeURIComponent('license:aaa'))).json();
t('dossier joueur', pf.player.name==='Luca Moreau' && pf.stats.sessions===1 && pf.player.discord==='discord:123', JSON.stringify(pf.stats));

// 9. action de bannissement
const ban=await(await call('/api/actions',{method:'POST',body:JSON.stringify({type:'ban',key:'license:bbb',name:'Rayan Reyes',reason:'Cheat détecté — menu illégal',days:0})})).json();
t('bannissement enregistré', ban.ok===true, JSON.stringify(ban));
const chk=await(await fetch(B+'/api/ban-check?key=license:bbb',{headers:{'x-origin-key':KEY}})).json();
t('le bannissement bloque la reconnexion', chk.ban && chk.ban.active===1 && chk.ban.expires_at===null);
const pend=await(await fetch(B+'/api/actions/pending',{headers:{'x-origin-key':KEY}})).json();
t('action déposée pour le serveur de jeu', pend.actions.length===1 && pend.actions[0].type==='ban');
// Un bannissement se range dans « bans », sa propre rubrique depuis la
// refonte : « sanctions » ne garde que les expulsions et avertissements.
const evAfter=await(await call('/api/events?cat=bans')).json();
t('la sanction est aussi un évènement du journal', evAfter.total===1 && /a banni Rayan Reyes définitivement/.test(evAfter.events[0].msg), evAfter.events[0]?.msg);

// 10. marques partagées
await call('/api/marks',{method:'POST',body:JSON.stringify({id:ac.events[0].id,kind:'done',on:true})});
const marked=await(await call('/api/events?cat=anticheat')).json();
t('marquage « traité » partagé', marked.events[0].done===true && marked.events[0].doneBy==='Nyx');
const st2=await(await call(`/api/stats?from=${now-2*3600e3}&to=${Date.now()}`)).json();
t('un évènement traité sort des alertes (reste le ban critique)', st2.alerts===1, 'alertes='+st2.alerts);

// 11. cloisonnement par rôle — modérateur
const cookieF=cookie;
r=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456'})});
cookie=(r.headers.get('set-cookie')||'').split(';')[0];
const meM=await r.json();
t('connexion modérateur', meM.staff.role==='moderateur' && meM.cats.length===13);
const evM=await(await call('/api/events?limit=50')).json();
t('le modérateur ne voit pas les logs admin', !evM.events.some(e=>e.cat==='admin'), evM.total+' évènements sur 6');
const forced=await(await call('/api/events?cat=admin')).json();
t('demander « admin » explicitement ne le donne pas', !forced.events.some(e=>e.cat==='admin'));
const pfM=await(await call('/api/players/'+encodeURIComponent('license:aaa'))).json();
// Sans le droit « players.identifiers », la licence ne sort pas : le
// panneau reçoit un alias opaque, suffisant pour ouvrir le dossier et
// inutilisable ailleurs.
t('identifiants masqués sans le droit', pfM.player.discord===null && /^k:[0-9a-f]{8,}$/.test(pfM.player.key||''), pfM.player.key);
const banM=await call('/api/actions',{method:'POST',body:JSON.stringify({type:'ban',key:'license:aaa',name:'Luca',reason:'test'})});
t('le modérateur ne peut pas bannir', banM.status===403);
const kickM=await(await call('/api/actions',{method:'POST',body:JSON.stringify({type:'kick',key:'license:aaa',name:'Luca Moreau',reason:'AFK prolongé'})})).json();
t('le modérateur peut expulser', kickM.ok===true);
const stM=await call('/api/staff');
t('le modérateur ne gère pas les comptes', stM.status===403);
const noReason=await call('/api/actions',{method:'POST',body:JSON.stringify({type:'kick',key:'license:aaa',name:'Luca'})});
t('un motif est obligatoire', noReason.status===400);

// 12. audit
cookie=cookieF;
const au=await(await call('/api/audit')).json();
t('le panneau se journalise lui-même', au.audit.some(a=>a.action==='action.ban') && au.audit.some(a=>a.action==='auth.connexion'), au.audit.length+' entrées');

// 13. déconnexion
await call('/api/auth/logout',{method:'POST'});
t('session fermée', (await call('/api/events')).status===401);

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
process.exit(bad.length?1:0);
