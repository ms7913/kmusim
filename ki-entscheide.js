/* ===================================================================
   KMU-SIMULATOR – FREITEXT-ENTSCHEIDE MIT KI-AUSWERTUNG (Variante B)
   -------------------------------------------------------------------
   Einbau: als weiteren <script>-Block vor </body>, NACH dem
   Hauptskript und nach der Inhaltserweiterung.

   Prinzip: Die teilnehmende Person schreibt ihr Vorgehen in eigenen
   Worten. Der Cloudflare Worker ordnet den Text einem der hinterlegten
   Handlungswege zu. Die Auswirkungen auf das KMU rechnet weiterhin
   das deterministische Modell – die KI entscheidet nur, WELCHER Weg
   beschrieben wurde.

   Fällt der Worker aus, erscheinen automatisch die Auswahlknöpfe.
   =================================================================== */
(function(){
"use strict";

const WORKER_URL = "https://kmusim-ki.DEIN-SUBDOMAIN.workers.dev";
const KI_FAELLE  = ["rekrutierung", "sperrfrist"];
const MINDESTZEICHEN = 180;

/* ---- Stil ------------------------------------------------------- */
const stil = document.createElement("style");
stil.textContent = `
.kiBlock{border:1px solid var(--linie);background:#FBFBF9;padding:14px 16px;margin-bottom:14px}
.kiBlock .kopf{display:flex;align-items:baseline;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.kiBlock .marke{background:#1F5C8B;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9px;letter-spacing:.02em}
.kiBlock .hinw{font-size:13px;color:var(--stahl);max-width:66ch;margin:0 0 10px}
.kiBlock textarea{width:100%;min-height:150px;padding:10px 12px;border:1px solid var(--linie);
  font:inherit;font-size:14px;line-height:1.55;resize:vertical;background:#fff;color:var(--tinte)}
.kiBlock textarea:focus{outline:2px solid var(--blau);outline-offset:-1px;border-color:var(--blau)}
.kiBlock .leiste{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
.kiRueck{border-left:3px solid var(--blau);background:#fff;padding:13px 16px;margin-top:14px}
.kiRueck.solide{border-left-color:var(--gruen)}
.kiRueck.lueckenhaft{border-left-color:var(--signal)}
.kiRueck .stufe{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--stahl)}
.kiRueck p{margin:6px 0 0;font-size:14px;max-width:68ch}
.kiRueck ul{margin:9px 0 0;padding-left:20px;font-size:13.5px}
.kiRueck li{margin-bottom:3px}
.kiRueck .weg{margin-top:11px;padding-top:10px;border-top:1px solid var(--linie);font-size:13.5px}
.kiRueck .weg b{display:block;margin-bottom:2px}
.kiWartet{font-size:13px;color:var(--stahl)}
.kiFehler{border-left:3px solid var(--rot);background:#fff;padding:11px 15px;margin-top:12px;font-size:13.5px}
#dsGate{position:fixed;inset:0;background:rgba(20,26,32,.75);display:flex;align-items:center;
  justify-content:center;padding:22px;z-index:200}
#dsGate .blatt{background:#fff;max-width:620px;width:100%;padding:26px 30px 28px;border-radius:5px;
  box-shadow:0 12px 44px rgba(0,0,0,.35)}
#dsGate h2{margin:0 0 12px;font-size:19px}
#dsGate p{font-size:14px;max-width:64ch;margin:0 0 12px}
#dsGate ul{font-size:14px;padding-left:20px;margin:0 0 14px}
#dsGate li{margin-bottom:6px}
#dsGate label{display:flex;gap:9px;align-items:flex-start;font-size:14px;margin:16px 0 4px}`;
document.head.appendChild(stil);

/* ---- Datenschutzhinweis ----------------------------------------- */
function schonBestaetigt(){
  try{ return localStorage.getItem("kmusim_ds") === "1"; }catch(e){ return false; }
}
function bestaetigen(){
  try{ localStorage.setItem("kmusim_ds","1"); }catch(e){}
}
function datenschutzGate(){
  if(schonBestaetigt()) return;
  const g = document.createElement("div");
  g.id = "dsGate";
  g.innerHTML = `<div class="blatt">
    <h2>Bevor Sie beginnen</h2>
    <p>Diese Übungsumgebung verarbeitet Daten. Damit Sie wissen, welche:</p>
    <ul>
      <li><strong>Spielstand und Begründungen</strong> werden unter dem von Ihnen gewählten Klassen- und Teamnamen in einer Datenbank in der Schweiz gespeichert. Die Kursleitung kann sie einsehen.</li>
      <li><strong>Ihre Entscheidtexte</strong> werden zur Auswertung an einen Sprachmodell-Dienst in den USA übermittelt. Die Texte werden dort nicht zum Training verwendet und von dieser Anwendung nicht protokolliert.</li>
      <li><strong>Schreiben Sie keine echten Personendaten</strong> in die Textfelder – keine Namen von Mitarbeitenden, Kundinnen oder Dritten aus Ihrem Betrieb, keine Gesundheitsangaben, keine Lohndaten realer Personen. Die Namen im Fall sind erfunden und dürfen verwendet werden.</li>
      <li>Die Auswertung dient der Simulation und Ihrer Selbsteinschätzung. Sie ist <strong>keine Prüfungsbewertung</strong> und fliesst in keine Note ein.</li>
    </ul>
    <label><input type="checkbox" id="dsHaken"> <span>Ich habe das gelesen und verstanden.</span></label>
    <div class="knopfleiste" style="margin-top:14px">
      <button class="knopf" id="dsWeiter" disabled>Verstanden, weiter</button>
    </div></div>`;
  document.body.appendChild(g);
  const haken = document.getElementById("dsHaken");
  const weiter = document.getElementById("dsWeiter");
  haken.onchange = ()=> weiter.disabled = !haken.checked;
  weiter.onclick = ()=>{ bestaetigen(); g.remove(); };
}

/* ---- Auswertung anfragen ---------------------------------------- */
async function auswerten(fall, text){
  const antwort = await fetch(WORKER_URL, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify({fall, text})
  });
  const daten = await antwort.json();
  if(!antwort.ok) throw new Error(daten.fehler || "Auswertung fehlgeschlagen");
  return daten;
}

/* ---- Umbau der Entscheidkarte ------------------------------------ */
function karteUmbauen(ev){
  const feld = document.querySelector('textarea[data-b="'+ev.id+'"]');
  if(!feld) return;
  const karte = feld.closest(".karte");
  if(!karte || karte.dataset.ki) return;
  karte.dataset.ki = "1";

  const optionen = karte.querySelector(".optionen");
  const begruendung = karte.querySelector(".begruendung");
  const gespeichert = S.wahl[ev.id] || {};

  optionen.style.display = "none";
  begruendung.style.display = "none";

  const block = document.createElement("div");
  block.className = "kiBlock";
  block.innerHTML = `
    <div class="kopf"><span class="marke">Freitext</span>
      <span style="font-size:13px;color:var(--stahl)">Kein Auswahlmenü – beschreiben Sie Ihr Vorgehen selbst.</span></div>
    <p class="hinw">Wie gehen Sie vor, und warum? Nennen Sie die Ausgangslage, auf die Sie sich stützen, Ihre Massnahme und die Folgen, die Sie dabei in Kauf nehmen. Mindestens ${MINDESTZEICHEN} Zeichen. Keine echten Personendaten.</p>
    <textarea id="kiText_${ev.id}" placeholder="Ich würde…">${gespeichert.begruendung||""}</textarea>
    <div class="leiste">
      <button class="knopf" id="kiSenden_${ev.id}">Vorgehen auswerten lassen</button>
      <button class="knopf neben" id="kiOptionen_${ev.id}">Stattdessen aus Vorgaben wählen</button>
      <span class="kiWartet" id="kiZaehler_${ev.id}"></span>
    </div>
    <div id="kiErgebnis_${ev.id}"></div>`;
  optionen.parentNode.insertBefore(block, optionen);

  const text = document.getElementById("kiText_"+ev.id);
  const senden = document.getElementById("kiSenden_"+ev.id);
  const zaehler = document.getElementById("kiZaehler_"+ev.id);
  const ergebnis = document.getElementById("kiErgebnis_"+ev.id);

  const pruefen = ()=>{
    const n = text.value.trim().length;
    zaehler.textContent = n >= MINDESTZEICHEN ? n+" Zeichen"
      : "Noch "+(MINDESTZEICHEN-n)+" Zeichen";
    senden.disabled = n < MINDESTZEICHEN;
  };
  text.oninput = pruefen; pruefen();

  document.getElementById("kiOptionen_"+ev.id).onclick = ()=>{
    optionen.style.display = "";
    begruendung.style.display = "";
    block.remove();
    delete karte.dataset.ki;
  };

  senden.onclick = async ()=>{
    senden.disabled = true;
    const alt = senden.textContent;
    senden.textContent = "Wird ausgewertet…";
    ergebnis.innerHTML = `<div class="kiWartet" style="margin-top:10px">Der Text wird geprüft. Das dauert einige Sekunden.</div>`;
    try{
      const r = await auswerten(ev.id, text.value.trim());
      anwenden(ev, text.value.trim(), r, ergebnis);
    }catch(fehler){
      ergebnis.innerHTML = `<div class="kiFehler"><strong>Auswertung nicht möglich.</strong><br>
        ${fehler.message}<br><br>
        Sie können es nochmals versuchen oder auf die Vorgaben ausweichen – die Simulation läuft in beiden Fällen weiter.</div>`;
      senden.disabled = false;
    }
    senden.textContent = alt;
    pruefen();
  };
}

/* ---- Ergebnis übernehmen ----------------------------------------- */
function anwenden(ev, text, r, ziel){
  const haupt = r.zuordnung[0];
  const zweit = r.zuordnung[1];
  const mischung = zweit && zweit.gewicht >= 0.3;

  // Das Modell rechnet mit dem dominanten Handlungsweg.
  S.wahl[ev.id] = {
    option: haupt.option,
    begruendung: text,
    ki: {
      stufe: r.stufe, ausserhalb: r.ausserhalb,
      rueckmeldung: r.rueckmeldung,
      zuordnung: r.zuordnung.map(z=>({option:z.option, gewicht:z.gewicht}))
    }
  };

  const stufentext = {solide:"Fachlich solide", teilweise:"Teilweise tragfähig", lueckenhaft:"Wesentliches fehlt"};
  ziel.innerHTML = `
    <div class="kiRueck ${r.stufe}">
      <span class="stufe">${stufentext[r.stufe]||"Rückmeldung"}</span>
      <p>${r.rueckmeldung}</p>
      ${r.erkannt.length ? `<ul>${r.erkannt.map(e=>`<li>${e}</li>`).join("")}</ul>` : ""}
      ${r.fehlend.length ? `<p style="margin-top:9px"><strong>Nicht angesprochen:</strong></p>
        <ul>${r.fehlend.map(e=>`<li>${e}</li>`).join("")}</ul>` : ""}
      <div class="weg">
        <b>Das Modell rechnet mit diesem Weg:</b>
        ${ev.optionen[haupt.option].label}
        ${mischung ? `<br><span style="color:var(--stahl)">Ihr Text enthält auch Anteile von: ${ev.optionen[zweit.option].label}. Für die Berechnung zählt der überwiegende Weg; die Mischung ist im Journal vermerkt.</span>` : ""}
        ${r.ausserhalb ? `<br><span style="color:var(--stahl)">Ihr Vorgehen geht über die hinterlegten Wege hinaus. Das Modell rechnet mit dem nächstliegenden – für das Debriefing ist Ihr eigener Ansatz vermerkt.</span>` : ""}
      </div>
    </div>`;

  // Abschlussknopf aktualisieren
  const btn = document.getElementById("abschluss");
  if(btn) btn.disabled = !alleEntschieden();
  const st = document.getElementById("abschlussStatus");
  if(st) st.textContent = alleEntschieden() ? "" : "Erst wenn jeder Entscheid gewählt und begründet ist.";
  if(typeof warnbalkenRendern === "function") warnbalkenRendern();
}

/* ---- Journal um die KI-Rückmeldung ergänzen ---------------------- */
const abschlussOriginal = periodeAbschliessen;
periodeAbschliessen = function(){
  const merker = {};
  KI_FAELLE.forEach(id=>{ if(S.wahl[id] && S.wahl[id].ki) merker[id] = S.wahl[id].ki; });
  const ergebnis = abschlussOriginal.apply(this, arguments);
  Object.keys(merker).forEach(id=>{
    const ev = EREIGNISSE.find(e=>e.id===id);
    const eintrag = S.journal.find(j=>j.titel===(ev&&ev.titel));
    if(eintrag){
      eintrag.gewaehlt += " (Freitext, Zuordnung durch Auswertung)";
      eintrag.kiRueckmeldung = merker[id].rueckmeldung;
      eintrag.kiStufe = merker[id].stufe;
    }
  });
  return ergebnis;
};

/* ---- An zeichnen() anhängen -------------------------------------- */
const zeichnenOriginal = zeichnen;
zeichnen = function(){
  const ergebnis = zeichnenOriginal.apply(this, arguments);
  if(aktiverReiter === "entscheide" && !S.beendet){
    EREIGNISSE.filter(e => e.periode===S.periode && KI_FAELLE.includes(e.id) && !S.erledigt.includes(e.id))
              .forEach(karteUmbauen);
  }
  return ergebnis;
};

datenschutzGate();
zeichnen();
})();
