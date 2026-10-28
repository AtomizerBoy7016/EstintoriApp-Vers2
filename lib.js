/* Logica dell'app v2: sigle configurabili, scadenze, presa in carico / consegna, gruppi, importazione.
   Nessuna dipendenza dal browser: si può provare anche con Node.
   (Le periodicità di legge – UNI 9994-1 – vanno verificate dal manutentore.) */
(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));

  // ======================= SIGLE ESTINTORI (configurabili) =======================
  // P6 = polvere 6 kg · K2/K5 = CO2 2/5 kg · Lt6 = schiumogeno 6 L · aut. = automatico · carr. = carrellato
  const TIPI_DEFAULT = [
    { codice: 'P', nome: 'Polvere', unita: 'kg', capacita: [1, 2, 3, 4, 6, 9, 12, 25, 30, 50, 100] },
    { codice: 'K', nome: 'CO2', unita: 'kg', capacita: [2, 5, 10] },
    { codice: 'Lt', nome: 'Schiumogeno', unita: 'L', capacita: [2, 3, 6, 9] },
  ];
  let tipi = clone(TIPI_DEFAULT);
  const chiave = codice => String(codice).toUpperCase();
  const FLAG = '(?:aut\\w*\\.?|carr\\w*\\.?)';
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function impostaTipi(t) { tipi = (t && t.length) ? clone(t) : clone(TIPI_DEFAULT); }
  const getTipi = () => clone(tipi);
  const trovaTipo = k => tipi.find(t => chiave(t.codice) === chiave(k));
  const nomeTipo = k => (trovaTipo(k) || { nome: k }).nome;
  const codiceVis = k => (trovaTipo(k) || { codice: k }).codice;

  // [quantità] [aut./carr.] tipo+capacità [aut./carr.]   — i codici e le capacità vengono dalle impostazioni
  function tokenRe() {
    const alt = [...tipi].sort((a, b) => b.codice.length - a.codice.length).map(t => {
      const caps = t.capacita.map(String).sort((a, b) => b.length - a.length || b - a);
      return escapeRe(t.codice) + '\\s*(?:' + caps.join('|') + ')';
    });
    return new RegExp('(?:(\\d+)\\s*)?(?:(' + FLAG + ')\\s*)?(' + alt.join('|') + ')(?:\\s*(' + FLAG + '))?', 'gi');
  }
  function descrizione(tipo, cap, unita, aut, carr) {
    return nomeTipo(tipo) + ' ' + cap + ' ' + unita + (carr ? ' carrellato' : '') + (aut ? ' automatico' : '');
  }

  function parseTipo(testo) {
    if (testo == null) return { lista: [], errori: ['tipo estintori vuoto'] };
    const lista = [], errori = [];
    const segmenti = String(testo).replace(/[×✕✖]/g, ' ').split(/[\n/;,+]/).filter(s => s.trim());
    for (const seg of segmenti) {
      const trovati = [...seg.matchAll(tokenRe())];
      let residuo = seg;
      for (const m of [...trovati].reverse()) residuo = residuo.slice(0, m.index) + ' ' + residuo.slice(m.index + m[0].length);
      if (!trovati.length || /[A-Za-z0-9]/.test(residuo))
        errori.push("sigla non riconosciuta: '" + seg.trim() + "' (puoi aggiungerla in Impostazioni → Sigle)");
      for (const m of trovati) {
        const flag = ((m[2] || '') + ' ' + (m[4] || '')).toLowerCase();
        const aut = flag.includes('aut'), carr = flag.includes('carr');
        const mm = /^([A-Za-z]+)\s*(\d+)$/.exec(m[3]);
        const t = trovaTipo(mm[1]);
        const tipo = chiave(t.codice), capacita = parseInt(mm[2], 10);
        lista.push({ tipo, capacita, unita: t.unita, quantita: m[1] ? parseInt(m[1], 10) : 1,
          automatico: aut, carrellato: carr, descrizione: descrizione(tipo, capacita, t.unita, aut, carr) });
      }
    }
    return { lista, errori };
  }
  const totale = lista => lista.reduce((s, e) => s + e.quantita, 0);
  function sigla(e) {
    return e.quantita + '×' + codiceVis(e.tipo) + e.capacita + (e.carrellato ? ' carr.' : '') + (e.automatico ? ' aut.' : '');
  }
  const testoSigle = ests => ests.map(e => e.quantita + (e.carrellato ? ' carr.' : '') + (e.automatico ? ' aut.' : '') +
    ' ' + codiceVis(e.tipo) + e.capacita).join(', ');

  /* Controlli per le impostazioni delle sigle */
  function validaNuovoTipo(t, esistenti) {
    const codice = String(t.codice || '').trim();
    if (!/^[A-Za-z]{1,4}$/.test(codice)) return 'Il codice deve avere da 1 a 4 lettere (es. P, K, Lt).';
    if (/^(aut|carr)/i.test(codice)) return 'Il codice non può iniziare con «aut» o «carr» (sono riservati).';
    if ((esistenti || tipi).some(x => chiave(x.codice) === chiave(codice))) return 'Esiste già un tipo con questo codice.';
    if (!String(t.nome || '').trim()) return 'Scrivi il nome del tipo (es. Idrico).';
    if (!t.capacita || !t.capacita.length) return 'Indica almeno una capacità (es. 6, 9).';
    return null;
  }
  function parseCapacita(testo) {
    const v = String(testo || '').split(/[\s,;]+/).filter(Boolean).map(Number);
    if (v.some(n => !Number.isInteger(n) || n < 1 || n > 999)) return null;
    return [...new Set(v)].sort((a, b) => a - b);
  }
  function unisciTipi(base, extra) {            // aggiunge tipi/capacità mancanti (per il ripristino "unisci")
    const out = clone(base);
    for (const t of extra || []) {
      const o = out.find(x => chiave(x.codice) === chiave(t.codice));
      if (!o) out.push(clone(t));
      else o.capacita = [...new Set([...o.capacita, ...t.capacita])].sort((a, b) => a - b);
    }
    return out;
  }

  // ======================= DATE E SCADENZE =======================
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto',
    'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  function oggiIso() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function addDays(isoDate, n) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function giorniTra(a, b) {                    // giorni da a a b (b - a)
    const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 864e5);
  }
  function fineMese(y, m) { return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); }
  function primaScadenzaDal(mesi, y, m) {
    const ms = [...mesi].sort((a, b) => a - b);
    for (const anno of [y, y + 1]) for (const mm of ms) if (anno * 100 + mm >= y * 100 + m) return fineMese(anno, mm);
  }
  function scadenzaIniziale(mesi, oggi) {
    const [y, m] = (oggi || oggiIso()).split('-').map(Number);
    return primaScadenzaDal(mesi, y, m);
  }
  /* Dopo la presa in carico il cliente torna in scadenza al successivo mese del ciclo
     (si parte da 3 mesi dopo: gennaio -> luglio; fatto in anticipo a dicembre -> già gennaio coperto). */
  function scadenzaDopoIntervento(mesi, dataIso) {
    let [y, m] = dataIso.split('-').map(Number);
    m += 3; y += Math.floor((m - 1) / 12); m = (m - 1) % 12 + 1;
    return primaScadenzaDal(mesi, y, m);
  }
  function statoScadenza(scad, oggi, giorni) {
    oggi = oggi || oggiIso();
    if (scad < oggi) return 'scaduto';
    const inizio = scad.slice(0, 8) + '01';
    if (inizio <= oggi) return 'corso';
    if (inizio <= addDays(oggi, giorni == null ? 30 : giorni)) return 'scadenza';
    return 'futuro';
  }
  const etichettaScadenza = scad => MESI[parseInt(scad.slice(5, 7), 10) - 1] + ' ' + scad.slice(0, 4);
  const etichettaCiclo = mesi => [...mesi].sort((a, b) => a - b).map(m => MESI_BREVI[m - 1]).join(' / ');
  const cicloKey = c => [...c.ciclo].sort((a, b) => a - b).join(',');

  // ======================= CLIENTI, GRUPPI, STATI =======================
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  function nuovoId() {
    return (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
      : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function nuovoCliente(d) {
    const mesi = d.ciclo;
    return {
      id: nuovoId(), nome: d.nome, indirizzo: d.indirizzo || null, indirizzoNote: d.indirizzoNote || null,
      comune: d.comune || null, provincia: d.provincia || null, referente: d.referente || null,
      telefono: d.telefono || null, email: d.email || null, note: d.note || null, ciclo: mesi,
      ultima: d.ultima || null, scadenza: d.scadenza || scadenzaIniziale(mesi), attivo: true,
      estintori: d.estintori || [], interventi: [], creato: new Date().toISOString(),
      stato: 'normale', presaInCarico: null, gruppoId: d.gruppoId || null,
    };
  }
  function nuovoGruppo(d) {
    return { id: nuovoId(), nome: d.nome, referente: d.referente || null, telefono: d.telefono || null,
      email: d.email || null, indirizzo: d.indirizzo || null, note: d.note || null, creato: new Date().toISOString() };
  }
  /* Porta un cliente salvato dalla v1 (o più vecchio) al formato della v2. */
  function migraCliente(c) {
    c = clone(c);
    if (!c.stato) c.stato = 'normale';
    if (c.presaInCarico === undefined) c.presaInCarico = null;
    if (c.gruppoId === undefined) c.gruppoId = null;
    if (!c.interventi) c.interventi = [];
    c.interventi = c.interventi.map(i => (i.presa === undefined && i.data !== undefined)
      ? { presa: i.data, consegna: i.data, note: i.note || null, estintori: null } : i);
    return c;
  }
  const chiaveCliente = c => norm(c.nome) + '|' + norm(c.indirizzo);
  const telefonoCliente = (c, gruppi) => c.telefono || ((gruppi || []).find(g => g.id === c.gruppoId) || {}).telefono || null;

  const ultimoAperto = c => { for (let i = (c.interventi || []).length - 1; i >= 0; i--) if (!c.interventi[i].consegna) return c.interventi[i]; return null; };
  const giorniInCarico = (c, oggi) => c.stato === 'in_carico' && c.presaInCarico ? giorniTra(c.presaInCarico, oggi || oggiIso()) : 0;
  const inRitardoConsegna = (c, soglia, oggi) => c.stato === 'in_carico' && giorniInCarico(c, oggi) >= soglia;

  /* Presa in carico: la scadenza ricomincia da qui (data di presa in carico). */
  function presaInCarico(c, data) {
    if (c.stato === 'in_carico') return { ok: false, errore: 'Il cliente è già in carico.' };
    c.scadenzaPrima = c.scadenza; c.ultimaPrima = c.ultima || null;
    c.stato = 'in_carico'; c.presaInCarico = data; c.ultima = data;
    c.scadenza = scadenzaDopoIntervento(c.ciclo, data);
    (c.interventi = c.interventi || []).push({ presa: data, consegna: null, note: null, estintori: clone(c.estintori || []) });
    return { ok: true };
  }
  function consegna(c, data) {
    const i = ultimoAperto(c);
    if (c.stato !== 'in_carico' || !i) return { ok: false, errore: 'Il cliente non è in carico.' };
    if (data < i.presa) return { ok: false, errore: 'La consegna non può essere prima della presa in carico.' };
    i.consegna = data; c.stato = 'normale'; c.presaInCarico = null;
    delete c.scadenzaPrima; delete c.ultimaPrima;
    return { ok: true };
  }
  function fattoSubito(c, data) {
    const r = presaInCarico(c, data);
    return r.ok ? consegna(c, data) : r;
  }
  function annullaPresa(c) {
    const i = ultimoAperto(c);
    if (c.stato !== 'in_carico' || !i) return { ok: false, errore: 'Il cliente non è in carico.' };
    c.interventi.splice(c.interventi.lastIndexOf(i), 1);
    if (c.scadenzaPrima) c.scadenza = c.scadenzaPrima;
    c.ultima = c.ultimaPrima === undefined ? c.ultima : c.ultimaPrima;
    delete c.scadenzaPrima; delete c.ultimaPrima;
    c.stato = 'normale'; c.presaInCarico = null;
    return { ok: true };
  }
  /* Stato di un cliente dentro un giro (derivato, così non si può disallineare). */
  function statoInGiro(c, giro) {
    if (c.stato === 'in_carico') return 'in_carico';
    const ult = (c.interventi || []).filter(i => i.consegna).slice(-1)[0];
    return ult && ult.presa >= giro.creato.slice(0, 10) ? 'fatto' : 'da_fare';
  }
  function riepilogoGruppo(g, clienti, oggi, giorni) {
    const s = clienti.filter(c => c.gruppoId === g.id && c.attivo !== false);
    return { strutture: s.length, daFare: s.filter(c => c.stato !== 'in_carico' && statoScadenza(c.scadenza, oggi, giorni) !== 'futuro').length,
      inCarico: s.filter(c => c.stato === 'in_carico').length, estintori: s.reduce((t, c) => t + totale(c.estintori || []), 0) };
  }

  // ======================= IMPORTAZIONE FOGLI =======================
  const righeCella = v => String(v == null ? '' : v).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  function pulisciLuogo(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
      .map(p => ['di', 'del', 'della'].includes(p.toLowerCase()) ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  function mesiDalTitolo(rows) {
    for (const r of rows.slice(0, 3)) {
      const t = r.join(' ').toLowerCase();
      const trovati = [];
      MESI.forEach((nome, i) => { if (new RegExp('\\b' + nome.toLowerCase()).test(t)) trovati.push(i + 1); });
      if (trovati.length) return trovati;
    }
    return [];
  }
  const mese3 = s => MESI_BREVI.findIndex(m => m.toLowerCase() === s.slice(0, 3).toLowerCase()) + 1;
  function cicloDaTesto(s) {
    const t = String(s || '');
    const nomi = [...t.matchAll(/[A-Za-zÀ-ÿ]{3,}/g)].map(m => mese3(m[0])).filter(Boolean);
    const numeri = nomi.length ? [] : [...t.matchAll(/\d{1,2}/g)].map(m => +m[0]).filter(n => n >= 1 && n <= 12);
    const v = [...new Set(nomi.concat(numeri))].sort((a, b) => a - b);
    return v.length >= 1 && v.length <= 2 ? v : null;
  }
  function scadenzaDaTesto(s) {
    const t = String(s || '').trim(); let m;
    if ((m = /^(\d{4})-(\d{2})/.exec(t))) return fineMese(+m[1], +m[2]);
    if ((m = /^(\d{1,2})[\/.-](\d{4})$/.exec(t))) return fineMese(+m[2], +m[1]);
    if ((m = /^([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{4})$/.exec(t)) && mese3(m[1])) return fineMese(+m[2], mese3(m[1]));
    return null;
  }
  function dataDaTesto(s) {
    const t = String(s || '').trim(); let m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return t.slice(0, 10);
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t))) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    return null;
  }

  function trovaIntestazione(rows) {
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const h = rows[i].map(c => norm(righeCella(c)[0] || ''));
      if (h.includes('nome cliente')) return { tipo: 'legacy', riga: i, h };
      if (h.includes('cliente') && h.some(x => x.startsWith('estintori'))) return { tipo: 'export', riga: i, h };
    }
    return null;
  }

  function analizzaLegacy(rows, inizio, mesiForzati) {
    const mesi = (mesiForzati && mesiForzati.length) ? mesiForzati : mesiDalTitolo(rows);
    const clienti = [], avvisi = [];
    rows.slice(inizio + 1).forEach((r, k) => {
      const n = inizio + 2 + k, lines = righeCella(r[0]);
      if (!lines.length) return;
      const nome = lines[0]; let indirizzo = null; const note = [];
      for (const extra of lines.slice(1)) {
        if (extra.startsWith('(') && extra.endsWith(')')) note.push(extra.slice(1, -1));
        else if (indirizzo === null) indirizzo = extra; else note.push(extra);
      }
      const qd = parseInt(String(r[1] == null ? '' : r[1]).trim(), 10), qtaDichiarata = isNaN(qd) ? null : qd;
      const { lista, errori } = parseTipo(righeCella(r[2]).join('\n'));
      const comune = pulisciLuogo(r[3]) || null;
      errori.forEach(e => avvisi.push('Riga ' + n + ' – ' + nome + ': ' + e));
      if (qtaDichiarata !== null && !errori.length && totale(lista) !== qtaDichiarata)
        avvisi.push('Riga ' + n + ' – ' + nome + ': quantità ' + qtaDichiarata + ' ma le sigle sommano ' + totale(lista));
      if (!indirizzo) avvisi.push('Riga ' + n + ' – ' + nome + ': indirizzo mancante');
      if (!comune) avvisi.push('Riga ' + n + ' – ' + nome + ': luogo mancante');
      clienti.push({ nome, indirizzo, indirizzoNote: note.join('; ') || null, comune, estintori: lista, qtaDichiarata, problemi: errori.length > 0 });
    });
    return { formato: 'foglio', mesi, clienti, avvisi };
  }

  /* Excel esportato dall'app (v1: Cliente|Indirizzo|Comune|Telefono|Estintori|N. estintori|Ciclo|Ultima manutenzione|
     Prossima scadenza|Note — v2: con anche Gruppo, Referente, Email, Stato, Presa in carico…). */
  function analizzaExport(rows, inizio) {
    const h = rows[inizio].map(c => norm(righeCella(c)[0] || ''));
    const col = nome => h.findIndex(x => x === nome);
    const ix = { gruppo: col('gruppo'), nome: col('cliente'), ind: col('indirizzo'), indnote: col('note indirizzo'), comune: col('comune'),
      ref: col('referente'), tel: col('telefono'), mail: col('email'), est: h.findIndex(x => x === 'estintori'), qta: col('n. estintori'),
      ciclo: col('ciclo'), stato: col('stato'), presa: col('presa in carico'), ultima: col('ultima manutenzione'),
      scad: col('prossima scadenza'), note: col('note') };
    const val = (r, i) => i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim();
    const clienti = [], avvisi = [];
    rows.slice(inizio + 1).forEach((r, k) => {
      const n = inizio + 2 + k, nome = val(r, ix.nome);
      if (!nome) return;
      const { lista, errori } = parseTipo(val(r, ix.est));
      errori.forEach(e => avvisi.push('Riga ' + n + ' – ' + nome + ': ' + e));
      const ciclo = cicloDaTesto(val(r, ix.ciclo));
      if (!ciclo) avvisi.push('Riga ' + n + ' – ' + nome + ': ciclo non riconosciuto («' + val(r, ix.ciclo) + '»)');
      const qd = parseInt(val(r, ix.qta), 10);
      if (!isNaN(qd) && !errori.length && totale(lista) !== qd) avvisi.push('Riga ' + n + ' – ' + nome + ': quantità ' + qd + ' ma le sigle sommano ' + totale(lista));
      let scadenza = scadenzaDaTesto(val(r, ix.scad));
      if (val(r, ix.scad) && !scadenza) avvisi.push('Riga ' + n + ' – ' + nome + ': scadenza non riconosciuta («' + val(r, ix.scad) + '»), ricalcolata dal ciclo');
      const presa = dataDaTesto(val(r, ix.presa));
      const inCarico = norm(val(r, ix.stato)) === 'in carico' && presa;
      clienti.push({ nome, gruppoNome: val(r, ix.gruppo) || null, indirizzo: val(r, ix.ind) || null, indirizzoNote: val(r, ix.indnote) || null,
        comune: pulisciLuogo(val(r, ix.comune)) || null, referente: val(r, ix.ref) || null, telefono: val(r, ix.tel) || null,
        email: val(r, ix.mail) || null, note: val(r, ix.note) || null, ciclo, scadenza, ultima: dataDaTesto(val(r, ix.ultima)),
        estintori: lista, stato: inCarico ? 'in_carico' : 'normale', presaInCarico: inCarico ? presa : null,
        problemi: errori.length > 0 || !ciclo });
    });
    return { formato: 'export', mesi: [], clienti, avvisi };
  }

  /* rows = array di array di testo (da SheetJS). Riconosce da solo il formato. */
  function analizza(rows, mesiForzati) {
    const int = trovaIntestazione(rows);
    if (!int) throw new Error("Intestazione non riconosciuta: servono le colonne «Nome Cliente» (foglio originale) oppure «Cliente» ed «Estintori» (Excel esportato dall'app).");
    return int.tipo === 'legacy' ? analizzaLegacy(rows, int.riga, mesiForzati) : analizzaExport(rows, int.riga);
  }

  /* Trasforma un'analisi in clienti e gruppi nuovi. Salta chi esiste già e chi ha dati illeggibili. */
  function clientiDaImportare(esistenti, gruppiEsistenti, analisi, mesi) {
    const presenti = new Set(esistenti.map(chiaveCliente));
    const gruppi = [...gruppiEsistenti], nuoviGruppi = [];
    const res = { nuovi: [], nuoviGruppi, saltatiEsistenti: [], saltatiErrori: [] };
    for (const c of analisi.clienti) {
      if (c.problemi) { res.saltatiErrori.push(c.nome); continue; }
      let gruppoId = null;
      if (c.gruppoNome) {
        let g = gruppi.find(x => norm(x.nome) === norm(c.gruppoNome));
        if (!g) { g = nuovoGruppo({ nome: c.gruppoNome }); gruppi.push(g); nuoviGruppi.push(g); }
        gruppoId = g.id;
      }
      const ciclo = c.ciclo || mesi;
      const nuovo = nuovoCliente({ nome: c.nome, indirizzo: c.indirizzo, indirizzoNote: c.indirizzoNote, comune: c.comune,
        referente: c.referente, telefono: c.telefono, email: c.email, note: c.note, ciclo, estintori: c.estintori,
        scadenza: c.scadenza || undefined, ultima: c.ultima || null, gruppoId });
      if (presenti.has(chiaveCliente(nuovo))) { res.saltatiEsistenti.push(c.nome); continue; }
      presenti.add(chiaveCliente(nuovo));
      if (c.stato === 'in_carico') {
        nuovo.stato = 'in_carico'; nuovo.presaInCarico = c.presaInCarico;
        nuovo.interventi.push({ presa: c.presaInCarico, consegna: null, note: null, estintori: clone(nuovo.estintori) });
      }
      res.nuovi.push(nuovo);
    }
    return res;
  }

  const API = { TIPI_DEFAULT, impostaTipi, getTipi, nomeTipo, codiceVis, parseTipo, totale, sigla, testoSigle, descrizione,
    validaNuovoTipo, parseCapacita, unisciTipi,
    MESI, MESI_BREVI, oggiIso, addDays, giorniTra, fineMese, scadenzaIniziale, scadenzaDopoIntervento, statoScadenza,
    etichettaScadenza, etichettaCiclo, cicloKey, norm, nuovoCliente, nuovoGruppo, migraCliente, chiaveCliente, telefonoCliente,
    giorniInCarico, inRitardoConsegna, presaInCarico, consegna, fattoSubito, annullaPresa, statoInGiro, riepilogoGruppo,
    mesiDalTitolo, cicloDaTesto, scadenzaDaTesto, dataDaTesto, analizza, clientiDaImportare };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Lib = API;
})(typeof self !== 'undefined' ? self : this);
