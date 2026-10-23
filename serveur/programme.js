// Programmes de la page admin : thème du site par périodes (serveur/theme.js) et événements à heure fixe
// (serveur/evenement.js). Les dates sont celles de Paris, écrites comme les champs date et datetime-local des
// formulaires (« AAAA-MM-JJ », « AAAA-MM-JJTHH:MM ») : comparer deux de ces textes, c'est comparer les dates.

const PARIS = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// « AAAA-MM-JJTHH:MM » à Paris (l'heure d'été est comprise).
export const minuteParis = (d = new Date()) => PARIS.format(d).replace(' ', 'T');
export const jourParis = (d = new Date()) => minuteParis(d).slice(0, 10);

// Une vraie date (pas de 31 février) au format du champ.
export function dateValide(texte, avecHeure) {
  const forme = avecHeure ? /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d$/ : /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = forme.exec(texte || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export const PERIODES_MAX = 20;

export function lireListe(texte) {
  try {
    const l = JSON.parse(texte || '[]');
    return Array.isArray(l) ? l : [];
  } catch (e) {
    return [];
  }
}
