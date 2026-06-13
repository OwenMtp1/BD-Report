import React, { createContext, useContext } from 'react'
import { useStore } from './store.jsx'

// ---------------------------------------------------------------- i18n FR / EN / ES
export const LANGS = [
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
]

// Dictionnaire : clé → { fr, en, es }. Les clés absentes retombent sur le français.
const DICT = {
  // --- Navigation & catégories
  'nav.pilotage': { fr: 'Pilotage', en: 'Steering', es: 'Dirección' },
  'nav.activite': { fr: 'Activité commerciale', en: 'Sales activity', es: 'Actividad comercial' },
  'nav.donnees': { fr: 'Données', en: 'Data', es: 'Datos' },
  'nav.remuneration': { fr: 'Rémunération', en: 'Compensation', es: 'Remuneración' },
  'nav.administration': { fr: 'Administration', en: 'Administration', es: 'Administración' },
  'page.dashboard': { fr: 'Dashboard', en: 'Dashboard', es: 'Panel' },
  'page.ai': { fr: 'Dashboard personnalisé', en: 'Custom dashboard', es: 'Panel personalizado' },
  'page.kpi': { fr: 'KPI Entreprise', en: 'Company KPIs', es: 'KPIs de empresa' },
  'page.teamlead': { fr: 'Pilotage équipe', en: 'Team steering', es: 'Dirección de equipo' },
  'page.rdv': { fr: 'Mes Rendez-vous', en: 'My Meetings', es: 'Mis Citas' },
  'page.leads': { fr: 'Leads', en: 'Leads', es: 'Leads' },
  'page.tasks': { fr: 'Recommandations prioritaires', en: 'Priority recommendations', es: 'Recomendaciones prioritarias' },
  'page.mytasks': { fr: 'Mes tâches', en: 'My tasks', es: 'Mis tareas' },
  'page.contacts': { fr: 'Mes contacts', en: 'My contacts', es: 'Mis contactos' },
  'page.notes': { fr: 'Mes notes', en: 'My notes', es: 'Mis notas' },
  'page.logs': { fr: 'Logs', en: 'Logs', es: 'Registros' },
  'page.corbeille': { fr: 'Corbeille', en: 'Trash', es: 'Papelera' },
  'page.primes': { fr: 'Primes & Commissions', en: 'Bonuses & Commissions', es: 'Primas y Comisiones' },
  'page.admin': { fr: 'Gestion Administration', en: 'Administration', es: 'Administración' },
  'page.teams': { fr: 'Gérez mes équipes', en: 'Manage my teams', es: 'Gestionar mis equipos' },
  'page.settings': { fr: 'Paramètres', en: 'Settings', es: 'Ajustes' },
  'page.org': { fr: 'Organigramme', en: 'Org chart', es: 'Organigrama' },
  // --- Commun
  'common.search': { fr: 'Rechercher', en: 'Search', es: 'Buscar' },
  'common.changeSpace': { fr: "Changer d'espace", en: 'Switch workspace', es: 'Cambiar espacio' },
  'common.logout': { fr: 'Déconnexion', en: 'Log out', es: 'Cerrar sesión' },
  'common.save': { fr: 'Enregistrer', en: 'Save', es: 'Guardar' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel', es: 'Cancelar' },
  'common.delete': { fr: 'Supprimer', en: 'Delete', es: 'Eliminar' },
  'common.create': { fr: 'Créer', en: 'Create', es: 'Crear' },
  'common.confirm': { fr: 'Confirmer', en: 'Confirm', es: 'Confirmar' },
  'common.all': { fr: 'Tous', en: 'All', es: 'Todos' },
  'common.details': { fr: 'Détails', en: 'Details', es: 'Detalles' },
  'common.language': { fr: 'Langue', en: 'Language', es: 'Idioma' },
  // --- Login
  'login.tagline': { fr: 'Votre espace sales tout-en-un', en: 'Your all-in-one sales workspace', es: 'Tu espacio de ventas todo en uno' },
  'login.idph': { fr: 'Mail ou pseudo', en: 'Email or username', es: 'Correo o usuario' },
  'login.emailph': { fr: 'Email', en: 'Email', es: 'Correo' },
  'login.userph': { fr: 'Pseudo', en: 'Username', es: 'Usuario' },
  'login.pwph': { fr: 'Mot de passe', en: 'Password', es: 'Contraseña' },
  'login.google': { fr: 'Continuer avec Google', en: 'Continue with Google', es: 'Continuar con Google' },
  'login.or': { fr: 'ou', en: 'or', es: 'o' },
  'login.signin': { fr: 'Se connecter', en: 'Log in', es: 'Iniciar sesión' },
  'login.signup': { fr: 'Créer mon compte', en: 'Create my account', es: 'Crear mi cuenta' },
  'login.toSignup': { fr: 'Pas de compte ? Créer un compte', en: "No account? Sign up", es: '¿Sin cuenta? Regístrate' },
  'login.toSignin': { fr: 'Déjà un compte ? Se connecter', en: 'Already have an account? Log in', es: '¿Ya tienes cuenta? Inicia sesión' },
  'login.errBad': { fr: 'Identifiants incorrects (mail ou pseudo + mot de passe).', en: 'Wrong credentials (email or username + password).', es: 'Credenciales incorrectas (correo o usuario + contraseña).' },
  'login.errEmail': { fr: 'Entrez un email valide pour créer un compte.', en: 'Enter a valid email to create an account.', es: 'Introduce un correo válido para crear una cuenta.' },
  'login.errPw': { fr: 'Choisissez un mot de passe.', en: 'Choose a password.', es: 'Elige una contraseña.' },
  'login.googleSoon': { fr: "La connexion Google nécessite un déploiement avec OAuth configuré — utilisez l'email + mot de passe en attendant.", en: 'Google login needs an OAuth-configured deployment — use email + password meanwhile.', es: 'El acceso con Google requiere un despliegue con OAuth — usa correo + contraseña mientras tanto.' },
  // --- Bienvenue
  'welcome.hello': { fr: 'Bienvenue', en: 'Welcome', es: 'Bienvenido' },
  'welcome.inSpace': { fr: 'dans votre Espace BDR', en: 'to your BDR Workspace', es: 'a tu Espacio BDR' },
  'welcome.loading': { fr: 'Chargement de vos environnements...', en: 'Loading your environments...', es: 'Cargando tus entornos...' },
  // --- Environnements
  'env.choose': { fr: 'Choisissez un environnement', en: 'Choose an environment', es: 'Elige un entorno' },
  'env.devPortal': { fr: 'Portail Développeur — accès à tous les environnements', en: 'Developer Portal — access to all environments', es: 'Portal de Desarrollador — acceso a todos los entornos' },
  'env.create': { fr: 'Créer un environnement', en: 'Create an environment', es: 'Crear un entorno' },
  'env.connectedAs': { fr: 'Connecté', en: 'Logged in', es: 'Conectado' },
  'env.pinTitle': { fr: "Entrez le code d'accès à 4 chiffres", en: 'Enter the 4-digit access code', es: 'Introduce el código de acceso de 4 dígitos' },
  'env.pinWrong': { fr: 'Code incorrect.', en: 'Wrong code.', es: 'Código incorrecto.' },
  'env.back': { fr: 'Retour', en: 'Back', es: 'Atrás' },
  'env.chooseSpace': { fr: 'Choisissez votre espace', en: 'Choose your workspace', es: 'Elige tu espacio' },
  'env.newSpace': { fr: 'Nouvel espace', en: 'New workspace', es: 'Nuevo espacio' },
  'env.changeEnv': { fr: "Changer d'environnement", en: 'Switch environment', es: 'Cambiar entorno' },
  // --- Settings divers
  'set.currency': { fr: 'Devise', en: 'Currency', es: 'Moneda' },
}

const I18nContext = createContext({ lang: 'fr', t: (k) => k })

export function I18nProvider({ children }) {
  const store = useStore()
  const lang = store?.account?.lang || store?.uiLang || localStorage.getItem('bdr_lang') || 'fr'
  const t = (key, fallback) => {
    const entry = DICT[key]
    if (!entry) return fallback ?? key
    return entry[lang] || entry.fr || fallback || key
  }
  return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>
}

export const useT = () => useContext(I18nContext)

// Helper hors-composant : traduit avec la langue stockée
export function tLang(lang, key, fallback) {
  const entry = DICT[key]
  if (!entry) return fallback ?? key
  return entry[lang] || entry.fr || fallback || key
}
