/* Choix de l'adresse du direct à partir des annonces signées (canal ntfy).
   Partagé par la page du lien officiel et par les tests automatiques. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.RTMAnnonce = fabrique();
})(this, function () {
  'use strict';
  var FRAICHEUR_S = 3 * 3600;      // le PC republie toutes les 2 h : au-delà de 3 h, l'annonce est périmée
  var AVANCE_MAX_MS = 15 * 60000;  // écart toléré entre les horloges de deux annonces d'un même PC

  function hoteDe(a) {
    var m = /^https:\/\/([a-z0-9.-]+)(:\d+)?\/?$/i.exec(a || '');
    return m ? m[1].toLowerCase() : '';
  }

  function autorisee(a, domaines) {
    var h = hoteDe(a);
    if (!h) return false;
    return /^[a-z0-9-]+\.trycloudflare\.com$/.test(h) || (domaines || []).indexOf(h) >= 0;
  }

  // txt : réponse « json?poll=1 » de ntfy (une ligne JSON par message).
  // verifier(m) : vérifie la signature de l'annonce m avec la clé épinglée.
  // Renvoie les adresses valides, la plus récente (heure du CANAL, pas du téléphone) d'abord.
  function choisir(txt, cle, verifier, maintenantS, ignorer, domaines) {
    var trouvees = [];
    String(txt || '').split('\n').forEach(function (ligne) {
      if (!ligne || ligne.length > 1024) return; // canal inondé : lignes démesurées ignorées
      try {
        var e = JSON.parse(ligne);
        if (e.event !== 'message' || typeof e.time !== 'number' || typeof e.message !== 'string') return;
        if (maintenantS - e.time > FRAICHEUR_S) return;                 // vieille annonce (PC éteint, rejeu)
        var m = JSON.parse(e.message);
        if (!m || m.k !== cle || typeof m.a !== 'string' || typeof m.t !== 'number' || typeof m.s !== 'string') return;
        if (!autorisee(m.a, domaines)) return;
        if (ignorer && hoteDe(m.a) === String(ignorer).toLowerCase()) return; // adresse qui vient d'échouer
        if (!verifier(m)) return;
        // d = avance de l'horloge du PC sur celle du canal. Elle peut être fausse de plusieurs heures
        // (fuseau mal réglé) mais reste la même d'une annonce à l'autre ; une vieille annonce rejouée
        // par quelqu'un d'autre a, elle, un d beaucoup plus petit.
        trouvees.push({ a: m.a.replace(/\/$/, ''), recu: e.time, d: m.t - e.time * 1000 });
      } catch (x) { /* ligne ignorée */ }
    });
    var dMax = trouvees.reduce(function (r, x) { return Math.max(r, x.d); }, -Infinity);
    trouvees.forEach(function (x) { x.coherente = x.d >= dMax - AVANCE_MAX_MS; });
    // annonces cohérentes d'abord (la plus récente en tête), puis les autres en dernier recours :
    // la page vérifie de toute façon que l'adresse répond avant de s'en servir.
    trouvees.sort(function (x, y) { return (y.coherente - x.coherente) || (y.recu - x.recu); });
    var vues = {};
    return trouvees.filter(function (x) { if (vues[x.a]) return false; vues[x.a] = 1; return true; }).map(function (x) { return x.a; });
  }

  return { choisir: choisir, autorisee: autorisee, hoteDe: hoteDe, FRAICHEUR_S: FRAICHEUR_S };
});
