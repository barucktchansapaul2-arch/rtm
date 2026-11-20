/* Choix de l'adresse du direct à partir des annonces signées (canal ntfy).
   Partagé par la page du lien officiel et par les tests automatiques. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.RTMAnnonce = fabrique();
})(this, function () {
  'use strict';
  var FRAICHEUR_S = 3 * 3600;      // le PC republie toutes les 2 h : au-delà de 3 h, l'annonce est périmée
  var AVANCE_MAX_MS = 10 * 60000;  // horodatage du PC au plus 10 min après la réception par le canal

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
        if (m.t > e.time * 1000 + AVANCE_MAX_MS) return;               // horodatage du PC incohérent
        if (ignorer && hoteDe(m.a) === String(ignorer).toLowerCase()) return; // adresse qui vient d'échouer
        if (!verifier(m)) return;
        trouvees.push({ a: m.a.replace(/\/$/, ''), recu: e.time });
      } catch (x) { /* ligne ignorée */ }
    });
    trouvees.sort(function (x, y) { return y.recu - x.recu; });
    var vues = {};
    return trouvees.filter(function (x) { if (vues[x.a]) return false; vues[x.a] = 1; return true; }).map(function (x) { return x.a; });
  }

  return { choisir: choisir, autorisee: autorisee, hoteDe: hoteDe, FRAICHEUR_S: FRAICHEUR_S };
});
