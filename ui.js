/* =========================================================
   LabExtract — interface complémentaire de script.js
   (script.js câble déjà #btnExtraire → extraireLabos() :
    processRapport() → affichage dans #resultats + copie auto.
   ui.js ajoute : stats, vider, exemple, copier à nouveau,
   télécharger .txt, Ctrl+Entrée, toast.)
   ========================================================= */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var input = $("inputRapport");
  var btnClear = $("btnClear");
  var btnSample = $("btnSample");
  var btnCopy = $("btnCopy");
  var btnDownload = $("btnDownload");
  var stats = $("stats");
  var resultats = $("resultats");
  var toast = $("toast");

  var toastTimer = null;

  /* Exemple de rapport pour le bouton ✨ Exemple */
  var EXEMPLE = [
    "LABORATOIRE — Compte rendu d'analyses",
    "Patient : DÉMO",
    "Prélevé le 2026/09/18 à 07h30m",
    "",
    "Hémoglobine 138 g/L    120 - 160",
    "Plaq 10*9/L AUTOV 245",
    "Créatinine 78 umol/L   60 - 110",
    "DFG Estimé/1,73m2 (prédite) mL/min AUTOV 92",
    "Sodium 139 mmol/L      136 - 145",
    "Potassium 4.2 mmol/L   3.5 - 5.0",
    "FERRITINE 45 ng/mL     30 - 300",
    "TSH 2.4 mUI/L          0.4 - 4.0",
    "GLUCOSE 5.8 mmol/L     3.9 - 6.1",
  ].join("\n");

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  function texteResultat() {
    return (resultats && resultats.hidden) ? "" : (resultats ? resultats.textContent : "");
  }

  function majBoutons() {
    var ok = !!texteResultat().trim();
    if (btnCopy) btnCopy.disabled = !ok;
    if (btnDownload) btnDownload.disabled = !ok;
  }

  function updateStats() {
    if (!stats) return;
    var n = input.value.length;
    stats.textContent = n ? n.toLocaleString("fr-FR") + " caractères" : "";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* Observation légère : après une extraction, activer les boutons + toast.
     script.js met à jour #resultats et copie lui-même. */
  var derniereValeur = "";
  setInterval(function () {
    var t = texteResultat().trim();
    if (t && t !== derniereValeur) {
      derniereValeur = t;
      majBoutons();
      if (t.indexOf("Veuillez coller") === -1) {
        showToast("✓ Extraction terminée et copiée");
      }
    } else if (!t && derniereValeur) {
      derniereValeur = "";
      majBoutons();
    }
  }, 300);

  if (btnClear) {
    btnClear.addEventListener("click", function () {
      input.value = "";
      if (resultats) { resultats.textContent = ""; resultats.hidden = true; }
      var vide = document.getElementById("resultEmpty");
      if (vide) vide.hidden = false;
      updateStats();
      majBoutons();
      input.focus();
    });
  }

  if (btnSample) {
    btnSample.addEventListener("click", function () {
      input.value = EXEMPLE;
      updateStats();
      input.focus();
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", function () {
      var t = texteResultat();
      if (!t) return;
      copyText(t).then(function () { showToast("✓ Résultat copié"); });
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener("click", function () {
      var t = texteResultat();
      if (!t) return;
      var blob = new Blob([t], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "labextract-resultats.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("✓ Fichier téléchargé");
    });
  }

  if (input) {
    input.addEventListener("input", updateStats);

    // Ctrl+Entrée → déclenche l'extraction de script.js
    input.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (typeof window.extraireLabos === "function") {
          window.extraireLabos();
        } else {
          var btn = document.getElementById("btnExtraire");
          if (btn) btn.click();
        }
      }
    });

    updateStats();
  }

  majBoutons();
})();
