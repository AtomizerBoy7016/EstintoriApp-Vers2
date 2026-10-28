/* Estintori v2 — interfaccia. Tutti i dati restano sul telefono (IndexedDB). */
(function () {
  'use strict';
  const L = self.Lib, A = self.Archivio;
  const IMP_DEFAULT = () => ({ giorniDefault: 90, raggruppa: 'comune', backupGiorni: 14, avvisoCarico: 2, tipi: L.getTipi() });

  // ---------- stato ----------
  const S = {
    clienti: [], gruppi: [], giri: [], imp: IMP_DEFAULT(),
    tab: 'fare', giorni: 90, ciclo: '', comuni: new Set(), cerca: '', raggruppa: 'comune', cercaClienti: '',
    giroAperto: null, riordina: false, selGruppo: new Set(), tornaAGruppo: null,
    importFile: null, importBackup: null, daV1: null, ultimoBackup: null, installEvent: null, persist: null,
  };
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    nav: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
    tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    cerca: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    su: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    giu: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    mani: '<svg viewBox="0 0 24 24"><path d="M5 8h14M5 12h14M5 16h14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    gruppo: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"/></svg>',
  };
  const pref = {
    leggi() { try { const p = JSON.parse(localStorage.getItem('estintori-v2-prefs') || '{}'); if (p.tab) S.tab = p.tab; if (p.ciclo != null) S.ciclo = p.ciclo; } catch (e) { /* ok */ } },
    scrivi() { try { localStorage.setItem('estintori-v2-prefs', JSON.stringify({ tab: S.tab, ciclo: S.ciclo })); } catch (e) { /* ok */ } },
  };

  // ---------- utilità ----------
  const oggi = () => L.oggiIso();
  const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'it', { sensitivity: 'base' });
  const attivi = () => S.clienti.filter(c => c.attivo !== false);
  const gruppoDi = c => S.gruppi.find(g => g.id === c.gruppoId) || null;
  const nEst = c => L.totale(c.estintori || []);
  const statoScad = c => L.statoScadenza(c.scadenza, oggi(), S.giorni);
  const luogo = c => [c.indirizzo, c.comune].filter(Boolean).join(', ');
  const telDi = c => L.telefonoCliente(c, S.gruppi);
  const mapsUrl = c => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.indirizzo ? luogo(c) : [c.nome, c.comune].filter(Boolean).join(', '));
  const dataIt = d => d ? d.split('-').reverse().join('/') : '';
  const testoRicerca = c => L.norm(c.nome + ' ' + (c.indirizzo || '') + ' ' + (c.comune || '') + ' ' + ((gruppoDi(c) || {}).nome || ''));
  const clone = x => JSON.parse(JSON.stringify(x));
  const tipoInUso = k => S.clienti.some(c => (c.estintori || []).some(e => e.tipo === k));
  const capInUso = (k, cap) => S.clienti.some(c => (c.estintori || []).some(e => e.tipo === k && e.capacita === cap));
  const cicliPresenti = () => [...new Map(attivi().map(c => [L.cicloKey(c), c.ciclo])).entries()]
    .sort((a, b) => cmp(a[0], b[0]) ).map(([k, v]) => ({ key: k, label: L.etichettaCiclo(v) }));
  const perCiclo = lista => S.ciclo ? lista.filter(c => L.cicloKey(c) === S.ciclo) : lista;

  function toast(msg, azione, fn) {
    const t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (azione ? '<button>' + esc(azione) + '</button>' : '');
    t.hidden = false; clearTimeout(toast._t);
    if (azione) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
    toast._t = setTimeout(() => { t.hidden = true; }, azione ? 7000 : 3500);
  }

  // ---------- salvataggio ----------
  async function upsert(store, lista, doc) {
    await A.salva(store, doc);
    const i = lista.findIndex(x => x.id === doc.id);
    if (i >= 0) lista[i] = doc; else lista.push(doc);
  }
  const salvaC = c => upsert('clienti', S.clienti, c);
  const salvaG = g => upsert('gruppi', S.gruppi, g);
  const salvaGiro = g => upsert('giri', S.giri, g);
  async function salvaImp() { await A.scriviMeta('impostazioni', S.imp); L.impostaTipi(S.imp.tipi); }
  function unisciImp(imp) {
    const base = IMP_DEFAULT();
    return Object.assign(base, imp || {}, { tipi: (imp && imp.tipi && imp.tipi.length) ? imp.tipi : base.tipi });
  }

  // ---------- operazioni sui clienti (con Annulla) ----------
  const MSG = {
    presaInCarico: c => c.nome + ': in carico · prossima scadenza ' + L.etichettaScadenza(c.scadenza),
    consegna: c => c.nome + ': consegnato',
    fattoSubito: c => c.nome + ': fatto · prossima scadenza ' + L.etichettaScadenza(c.scadenza),
    annullaPresa: c => c.nome + ': presa in carico annullata',
  };
  async function operazione(id, fn, data) {
    const c = S.clienti.find(x => x.id === id); if (!c) return false;
    const prima = clone(c), r = L[fn](c, data);
    if (!r.ok) { toast(r.errore); return false; }
    await salvaC(c); chiudiScheda(); render();
    toast(MSG[fn](c), 'Annulla', async () => { await salvaC(prima); render(); });
    return true;
}
  async function operazioneMulti(ids, fn, data) {
    const prime = [];
    let ok = 0;
    for (const id of ids) {
      const c = S.clienti.find(x => x.id === id); if (!c) continue;
      const prima = clone(c), r = L[fn](c, data);
      if (r.ok) { prime.push(prima); await salvaC(c); ok++; }
    }
    render();
    toast(ok ? ok + (ok === 1 ? ' cliente aggiornato' : ' clienti aggiornati') : 'Nessun cliente da aggiornare', ok ? 'Annulla' : null,
      async () => { for (const p of prime) await salvaC(p); render(); });
    return ok;
  }

  // ---------- schede a scorrimento ----------
  let schedaAperta = false;
  function apriScheda(html, mantieniScroll) {
    const sc = $('#scheda'), y = sc.scrollTop;
    sc.innerHTML = '<div class="maniglia"></div>' + html;
    if (!mantieniScroll) $('#toast').hidden = true; sc.scrollTop = mantieniScroll ? y : 0; sc.hidden = false; $('#velo').hidden = false;
    document.body.style.overflow = 'hidden';
    if (!schedaAperta) { history.pushState({ scheda: 1 }, ''); schedaAperta = true; }
  }
  function chiudiScheda(daPop) {
    if (!schedaAperta) return;
    $('#scheda').hidden = true; $('#velo').hidden = true; document.body.style.overflow = ''; schedaAperta = false;
    if (!daPop && history.state && history.state.scheda) history.back();
  }
  window.addEventListener('popstate', () => chiudiScheda(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiScheda(); });
  $('#velo').addEventListener('click', () => chiudiScheda());

  // ---------- pezzi di interfaccia ----------
  function badge(c) {
    if (c.stato === 'in_carico') {
      const g = L.giorniInCarico(c, oggi()), rit = L.inRitardoConsegna(c, S.imp.avvisoCarico, oggi());
      return { cls: rit ? 'ritardo' : 'carico', txt: g <= 0 ? 'In carico oggi' : 'In carico da ' + g + (g === 1 ? ' giorno' : ' giorni') };
    }
    const st = statoScad(c);
    return { cls: st, txt: st === 'scaduto' ? 'Scaduto' : st === 'corso' ? 'Questo mese' : L.MESI_BREVI[+c.scadenza.slice(5, 7) - 1] + ' ' + c.scadenza.slice(0, 4) };
  }
  function azioniCard(c) {
    const tel = telDi(c);
    return '<div class="azioni">' +
      '<a class="btn ico" href="' + esc(mapsUrl(c)) + '" target="_blank" rel="noopener" data-stop="1" aria-label="Naviga">' + ic.nav + '</a>' +
      (tel ? '<a class="btn ico" href="tel:' + esc(tel.replace(/\s+/g, '')) + '" data-stop="1" aria-label="Chiama">' + ic.tel + '</a>' : '') +
      (c.stato === 'in_carico'
        ? '<button class="btn ok" data-act="consegna" data-id="' + esc(c.id) + '">' + ic.ok + 'Fatto · consegna</button>'
        : '<button class="btn primario" data-act="presa" data-id="' + esc(c.id) + '">' + ic.box + 'Presa in carico</button>') + '</div>';
  }
  function card(c, o) {
    o = o || {};
    const b = badge(c), g = gruppoDi(c);
    return '<article class="card ' + b.cls + '" data-act="apri" data-id="' + esc(c.id) + '">' +
      (g && !o.senzaGruppo ? '<div class="et-gruppo">' + ic.gruppo + esc(g.nome) + '</div>' : '') +
      '<div class="testa"><div><h3>' + esc(c.nome) + '</h3>' +
      (c.indirizzo || c.comune ? '<p class="ind">' + ic.pin + '<span>' + esc(luogo(c)) + (c.indirizzoNote ? ' <em>(' + esc(c.indirizzoNote) + ')</em>' : '') + '</span></p>' : '') +
      '</div><span class="badge ' + b.cls + '">' + esc(b.txt) + '</span></div>' +
      '<div class="sigle">' + (c.estintori || []).map(e => '<span>' + esc(L.sigla(e)) + '</span>').join('') + '</div>' +
      (o.azioni === false ? '' : azioniCard(c)) + '</article>';
  }
  const campo = (id, et, val, tipo, extra) => '<label class="campo"><span>' + et + '</span><input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';
  const opzioniCiclo = sel => L.MESI_BREVI.slice(0, 6).map((m, i) => '<option value="' + (i + 1) + '"' + (sel === i + 1 ? ' selected' : '') + '>' + m + ' / ' + L.MESI_BREVI[i + 6] + '</option>').join('');
  const barraCicli = () => {
    const c = cicliPresenti();
    return c.length > 1 ? '<div class="chips" id="chips-cicli"><button class="chip ' + (!S.ciclo ? 'on' : '') + '" data-ciclo="">Tutti i cicli</button>' +
      c.map(x => '<button class="chip ' + (S.ciclo === x.key ? 'on' : '') + '" data-ciclo="' + esc(x.key) + '">' + esc(x.label) + '</button>').join('') + '</div>' : '';
  };
  const vuoto = (t, s) => '<div class="vuoto"><b>' + t + '</b>' + s + '</div>';

  // ======================= DA FARE =======================
  function sorgenteFare() {
    const q = L.norm(S.cerca);
    return perCiclo(attivi()).filter(c => c.stato === 'in_carico' || statoScad(c) !== 'futuro').filter(c => !q || testoRicerca(c).includes(q));
  }
  function listaFare() {
    const src = sorgenteFare().filter(c => !S.comuni.size || S.comuni.has(c.comune || ''));
    return {
      carico: src.filter(c => c.stato === 'in_carico').sort((a, b) => cmp(a.presaInCarico, b.presaInCarico) || cmp(a.nome, b.nome)),
      fare: src.filter(c => c.stato !== 'in_carico').sort((a, b) => cmp(a.scadenza, b.scadenza) || cmp(a.comune, b.comune) || cmp(a.nome, b.nome)),
    };
  }
  function raggruppa(lista, modo) {
    if (modo === 'nessuno') return [[null, lista]];
    const m = new Map();
    lista.forEach(c => {
      const k = modo === 'gruppo' ? (gruppoDi(c) ? gruppoDi(c).nome : 'Senza gruppo') : (c.comune || 'Senza luogo');
      if (!m.has(k)) m.set(k, []); m.get(k).push(c);
    });
    return [...m.entries()].sort((a, b) => (/^Senza /.test(a[0]) - /^Senza /.test(b[0])) || cmp(a[0], b[0]));
  }
  function renderListaFare() {
    const lista = $('#lista'); if (!lista) return;
    const { carico, fare } = listaFare();
    $('#st-scaduti').textContent = fare.filter(c => statoScad(c) === 'scaduto').length;
    $('#st-fare').textContent = fare.length;
    $('#st-carico').textContent = carico.length;
    $('#st-estintori').textContent = fare.reduce((s, c) => s + nEst(c), 0);
    $('#consegne').innerHTML = carico.length
      ? '<div class="gruppo consegne"><h2>Da consegnare</h2><span>' + carico.length + ' ' + (carico.length === 1 ? 'cliente' : 'clienti') + ' · ' + carico.reduce((s, c) => s + nEst(c), 0) + ' estintori</span></div>' + carico.map(c => card(c)).join('') : '';
    if (!fare.length) {
      lista.innerHTML = attivi().length ? (carico.length ? '' : vuoto('Niente da fare', 'Nessuna scadenza entro ' + S.giorni + ' giorni con questi filtri.'))
        : vuoto('Nessun cliente', 'Vai su «Impostazioni» per importare i tuoi fogli oppure aggiungi un cliente con il pulsante +.');
      return;
    }
    lista.innerHTML = (carico.length ? '<div class="gruppo"><h2>Da fare</h2><span>' + fare.length + '</span></div>' : '') +
      raggruppa(fare, S.raggruppa).map(([k, g]) => (k ? '<div class="gruppo sub"><h2>' + esc(k) + '</h2><span>' + g.length + ' · ' + g.reduce((s, c) => s + nEst(c), 0) + ' estintori</span></div>' : '') +
        g.map(c => card(c, { senzaGruppo: S.raggruppa === 'gruppo' })).join('')).join('');
  }
  function renderFare() {
    const comuni = [...new Set(sorgenteFare().map(c => c.comune || ''))].sort(cmp);
    const vecchio = S.imp.backupGiorni > 0 && attivi().length && (!S.ultimoBackup || (Date.now() - new Date(S.ultimoBackup)) > S.imp.backupGiorni * 864e5);
    app.innerHTML =
      (vecchio ? '<div class="avviso">' + (S.ultimoBackup ? 'L\'ultima copia di sicurezza è vecchia di più di ' + S.imp.backupGiorni + ' giorni.' : 'Non hai ancora fatto una copia di sicurezza dei dati.') +
        '<br><button class="btn" data-act="backup">Salva copia nei Download</button></div>' : '') +
      '<div id="consegne"></div>' +
      '<div class="seg" id="seg">' + [30, 60, 90, 180].map(g => '<button data-giorni="' + g + '" class="' + (g === S.giorni ? 'on' : '') + '">' + g + ' giorni</button>').join('') + '</div>' +
      '<div class="stat"><div class="rosso"><b id="st-scaduti">0</b><span>Scaduti</span></div><div><b id="st-fare">0</b><span>Da fare</span></div><div class="amb"><b id="st-carico">0</b><span>In carico</span></div><div><b id="st-estintori">0</b><span>Estintori</span></div></div>' +
      '<div class="cerca">' + ic.cerca + '<input id="cerca" type="search" placeholder="Cerca cliente, via o gruppo" value="' + esc(S.cerca) + '"></div>' +
      barraCicli() +
      (comuni.length > 1 ? '<div class="chips" id="chips"><button class="chip ' + (!S.comuni.size ? 'on' : '') + '" data-comune="">Tutti i comuni</button>' +
        comuni.map(k => '<button class="chip ' + (S.comuni.has(k) ? 'on' : '') + '" data-comune="' + esc(k) + '">' + esc(k || 'Senza luogo') + '</button>').join('') + '</div>' : '') +
      '<div class="riga"><span class="et">Raggruppa per</span><div class="seg piccolo">' + [['comune', 'Comune'], ['gruppo', 'Gruppo'], ['nessuno', 'Nessuno']].map(([v, t]) =>
        '<button data-raggruppa="' + v + '" class="' + (S.raggruppa === v ? 'on' : '') + '">' + t + '</button>').join('') + '</div></div>' +
      '<div id="lista"></div>';
    renderListaFare();
  }

  // ======================= GIRI (playlist) =======================
  function datiGiro(g) {
    const cl = g.clienti.map(id => S.clienti.find(c => c.id === id)).filter(c => c && c.attivo !== false);
    const st = cl.map(c => L.statoInGiro(c, g));
    return { cl, st, fatti: st.filter(s => s === 'fatto').length, carico: st.filter(s => s === 'in_carico').length };
  }
  function renderGiri() {
    if (S.giroAperto) return renderGiro();
    $('#sottotitolo').textContent = S.giri.length ? S.giri.length + (S.giri.length === 1 ? ' giro' : ' giri') : 'Liste di clienti da visitare';
    app.innerHTML = '<button class="btn primario largo" data-act="nuovo-giro">+ Nuovo giro</button>' +
      (S.giri.length ? [...S.giri].sort((a, b) => cmp(b.creato, a.creato)).map(g => {
        const d = datiGiro(g), pc = d.cl.length ? Math.round(d.fatti / d.cl.length * 100) : 0;
        return '<article class="card giro" data-act="apri-giro" data-id="' + esc(g.id) + '"><div class="testa"><div><h3>' + esc(g.nome) + '</h3>' +
          '<p class="ind">' + d.cl.length + ' clienti · ' + d.fatti + ' completati' + (d.carico ? ' · ' + d.carico + ' in carico' : '') + '</p></div>' +
          (d.cl.length && d.fatti === d.cl.length ? '<span class="badge futuro">Concluso</span>' : '') + '</div>' +
          '<div class="barra"><i style="width:' + pc + '%"></i></div></article>';
      }).join('') : vuoto('Nessun giro', 'Un giro è una lista di clienti da visitare, in un ordine deciso da te. Creane uno scegliendo le scadenze del mese.'));
  }
  function rigaGiro(c, i, g, stato, tot) {
    const gr = gruppoDi(c), nome = '<b>' + esc(c.nome) + '</b><small>' + (gr ? esc(gr.nome) + ' · ' : '') + esc(luogo(c) || '—') + '</small>';
    if (S.riordina) {
      return '<div class="riga-giro" data-id="' + esc(c.id) + '"><span class="maniglia-r" data-drag="1" aria-label="Trascina">' + ic.mani + '</span><div class="corpo">' + nome + '</div>' +
        '<button class="btn ico pic" data-act="su" data-id="' + esc(c.id) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Su">' + ic.su + '</button>' +
        '<button class="btn ico pic" data-act="giu" data-id="' + esc(c.id) + '"' + (i === tot - 1 ? ' disabled' : '') + ' aria-label="Giù">' + ic.giu + '</button>' +
        '<button class="btn ico pic pericolo" data-act="togli" data-id="' + esc(c.id) + '" aria-label="Togli dal giro">' + ic.x + '</button></div>';
    }
    const b = stato === 'fatto' ? { cls: 'futuro', t: 'Fatto' } : stato === 'in_carico' ? { cls: badge(c).cls, t: badge(c).txt } : { cls: 'scadenza', t: 'Da fare' };
    const tel = telDi(c);
    return '<div class="riga-giro cardlike ' + (stato === 'fatto' ? 'fatto' : '') + '" data-id="' + esc(c.id) + '"><span class="num">' + (i + 1) + '</span>' +
      '<div class="corpo" data-act="apri" data-id="' + esc(c.id) + '">' + nome + '<span class="badge ' + b.cls + '">' + esc(b.t) + '</span></div>' +
      '<div class="azioni">' + '<a class="btn ico" href="' + esc(mapsUrl(c)) + '" target="_blank" rel="noopener" data-stop="1" aria-label="Naviga">' + ic.nav + '</a>' +
      (tel ? '<a class="btn ico" href="tel:' + esc(tel.replace(/\s+/g, '')) + '" data-stop="1" aria-label="Chiama">' + ic.tel + '</a>' : '') +
      (stato === 'da_fare' ? '<button class="btn primario" data-act="presa" data-id="' + esc(c.id) + '">Presa in carico</button>'
        : stato === 'in_carico' ? '<button class="btn ok" data-act="consegna" data-id="' + esc(c.id) + '">Fatto · consegna</button>'
          : '<span class="fatto-ok">' + ic.ok + '</span>') + '</div></div>';
  }
  function renderGiro() {
    const g = S.giri.find(x => x.id === S.giroAperto);
    if (!g) { S.giroAperto = null; return renderGiri(); }
    const d = datiGiro(g);
    $('#sottotitolo').textContent = g.nome;
    app.innerHTML = '<div class="riga testa-giro"><button class="btn ico" data-act="indietro-giri" aria-label="Indietro">' + ic.back + '</button>' +
      '<div class="grow"><b>' + d.fatti + ' di ' + d.cl.length + ' completati</b><div class="barra"><i style="width:' + (d.cl.length ? Math.round(d.fatti / d.cl.length * 100) : 0) + '%"></i></div></div></div>' +
      '<div class="riga azioni-giro"><button class="btn ' + (S.riordina ? 'primario' : '') + '" data-act="riordina">' + (S.riordina ? 'Fine riordino' : 'Riordina') + '</button>' +
      '<button class="btn" data-act="aggiungi-giro" data-id="' + esc(g.id) + '">+ Clienti</button><button class="btn" data-act="rinomina-giro" data-id="' + esc(g.id) + '">Rinomina</button></div>' +
      (S.riordina ? '<p class="anteprima">Trascina ≡ oppure usa le frecce. Con ✕ togli il cliente dal giro.</p>' : '') +
      '<div id="righe-giro">' + (d.cl.length ? d.cl.map((c, i) => rigaGiro(c, i, g, d.st[i], d.cl.length)).join('') : vuoto('Giro vuoto', 'Aggiungi clienti con «+ Clienti».')) + '</div>' +
      '<div style="height:16px"></div><button class="btn pericolo largo" data-act="elimina-giro" data-id="' + esc(g.id) + '">Elimina giro</button>';
  }
  async function muovi(id, delta) {
    const g = S.giri.find(x => x.id === S.giroAperto), i = g.clienti.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= g.clienti.length) return;
    [g.clienti[i], g.clienti[j]] = [g.clienti[j], g.clienti[i]];
    await salvaGiro(g); renderGiro();
  }
  function avviaDrag(e, handle) {
    /* La riga viene solo spostata visivamente mentre trascini; l'ordine si calcola e si salva al rilascio. */
    const row = handle.closest('.riga-giro'), cont = row.parentElement, startY = e.clientY;
    e.preventDefault(); row.classList.add('trascina');
    try { handle.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    const mov = ev => { row.style.transform = 'translateY(' + (ev.clientY - startY) + 'px)'; };
    const fine = async () => {
      handle.removeEventListener('pointermove', mov);
      const r0 = row.getBoundingClientRect(), centro = r0.top + r0.height / 2;
      const altri = [...cont.querySelectorAll('.riga-giro')].filter(r => r !== row);
      let pos = 0; altri.forEach(r => { const b = r.getBoundingClientRect(); if (b.top + b.height / 2 < centro) pos++; });
      const ids = altri.map(r => r.dataset.id); ids.splice(pos, 0, row.dataset.id);
      row.style.transform = ''; row.classList.remove('trascina');
      const g = S.giri.find(x => x.id === S.giroAperto); g.clienti = ids;
      await salvaGiro(g); renderGiro();
    };
    handle.addEventListener('pointermove', mov);
    handle.addEventListener('pointerup', fine, { once: true }); handle.addEventListener('pointercancel', fine, { once: true });
  }

  // --- scelta clienti per un giro ---
  let P = null;
  function mesiOpzioni() {
    const [y, m] = oggi().split('-').map(Number), out = [];
    for (let i = 0; i < 12; i++) { const mm = (m - 1 + i) % 12 + 1, yy = y + Math.floor((m - 1 + i) / 12); out.push({ v: yy + '-' + String(mm).padStart(2, '0'), l: L.MESI[mm - 1] + ' ' + yy }); }
    return out;
  }
  function candidatiGiro() {
    const q = L.norm(P.cerca), g = P.giroId ? S.giri.find(x => x.id === P.giroId) : null, gia = new Set(g ? g.clienti : []);
    return attivi().filter(c => c.stato !== 'in_carico' && !gia.has(c.id))
      .filter(c => c.scadenza.slice(0, 7) === P.mese || (P.scaduti && c.scadenza < oggi()))
      .filter(c => !P.ciclo || L.cicloKey(c) === P.ciclo).filter(c => !q || testoRicerca(c).includes(q))
      .sort((a, b) => cmp(a.comune, b.comune) || cmp(a.nome, b.nome));
  }
  function renderPickerLista() {
    const cand = candidatiGiro(), el = $('#p-lista'); if (!el) return;
    const gr = raggruppa(cand, 'gruppo');
    el.innerHTML = cand.length ? gr.map(([k, g]) => '<div class="gruppo sub"><h2>' + esc(k === 'Senza gruppo' ? 'Clienti singoli' : k) + '</h2><button class="chip" data-pick-gruppo="' + esc(g.map(c => c.id).join(',')) + '">Seleziona tutti (' + g.length + ')</button></div>' +
      g.map(c => '<label class="pick"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (P.sel.has(c.id) ? ' checked' : '') + '><span><b>' + esc(c.nome) + '</b><small>' + esc(c.comune || '—') + ' · ' + esc(L.etichettaScadenza(c.scadenza)) + ' · ' + nEst(c) + ' estintori</small></span></label>').join('')).join('')
      : vuoto('Nessun cliente', 'Nessuna scadenza in questo mese con questi filtri.');
    const n = [...P.sel].filter(id => cand.some(c => c.id === id)).length;
    const b = $('#p-crea'); b.textContent = (P.giroId ? 'Aggiungi al giro' : 'Crea giro') + (n ? ' (' + n + ')' : ''); b.disabled = !n;
  }
  function apriPicker(giroId) {
    const g = giroId ? S.giri.find(x => x.id === giroId) : null;
    P = { giroId, mese: oggi().slice(0, 7), scaduti: true, ciclo: '', sel: new Set(), cerca: '' };
    apriScheda('<h2>' + (g ? 'Aggiungi al giro' : 'Nuovo giro') + '</h2>' + (g ? '' : campo('p-nome', 'Nome del giro', '', 'text', 'placeholder="es. Girifalco – gennaio"')) +
      '<label class="campo"><span>Mese di competenza</span><select id="p-mese">' + mesiOpzioni().map(o => '<option value="' + o.v + '">' + esc(o.l) + '</option>').join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" id="p-scaduti" checked> Includi anche i clienti già scaduti</label>' +
      (cicliPresenti().length > 1 ? '<label class="campo"><span>Ciclo</span><select id="p-ciclo"><option value="">Tutti</option>' + cicliPresenti().map(c => '<option value="' + esc(c.key) + '">' + esc(c.label) + '</option>').join('') + '</select></label>' : '') +
      '<div class="cerca">' + ic.cerca + '<input id="p-cerca" type="search" placeholder="Filtra per nome, via, comune o gruppo"></div>' +
      '<div id="p-lista"></div><div class="barra-fissa"><button class="btn primario largo" id="p-crea" data-act="crea-giro" disabled>Crea giro</button></div>');
    renderPickerLista();
  }
  async function creaGiro() {
    const cand = candidatiGiro().filter(c => P.sel.has(c.id)).map(c => c.id);
    if (!cand.length) return;
    if (P.giroId) { const g = S.giri.find(x => x.id === P.giroId); g.clienti.push(...cand); await salvaGiro(g); toast(cand.length + ' clienti aggiunti'); }
    else {
      const mese = mesiOpzioni().find(o => o.v === P.mese);
      const g = { id: L.nuovoGruppo({ nome: 'x' }).id, nome: ($('#p-nome').value || '').trim() || 'Giro ' + (mese ? mese.l : ''), creato: new Date().toISOString(), clienti: cand };
      await salvaGiro(g); S.giroAperto = g.id; S.riordina = false; toast('Giro creato: ' + cand.length + ' clienti');
    }
    P = null; chiudiScheda(); render();
  }

  // ======================= CLIENTI e GRUPPI =======================
  function renderListaClienti() {
    const el = $('#lista'); if (!el) return;
    const q = L.norm(S.cercaClienti), tutti = perCiclo(attivi());
    $('#sottotitolo').textContent = attivi().length + ' clienti · ' + attivi().reduce((s, c) => s + nEst(c), 0) + ' estintori' + (S.gruppi.length ? ' · ' + S.gruppi.length + ' gruppi' : '');
    if (q) {
      const r = tutti.filter(c => testoRicerca(c).includes(q)).sort((a, b) => cmp(a.nome, b.nome));
      el.innerHTML = r.length ? r.map(c => card(c, { azioni: false })).join('') : vuoto('Nessun risultato', 'Prova con un altro nome o aggiungi un nuovo cliente.');
      return;
    }
    const singoli = tutti.filter(c => !gruppoDi(c)).sort((a, b) => cmp(a.nome, b.nome));
    const gruppi = [...S.gruppi].filter(g => !S.ciclo || tutti.some(c => c.gruppoId === g.id)).sort((a, b) => cmp(a.nome, b.nome));
    el.innerHTML = (gruppi.length ? '<div class="gruppo"><h2>Gruppi</h2><span>' + gruppi.length + '</span></div>' + gruppi.map(g => {
      const r = L.riepilogoGruppo(g, S.clienti, oggi(), S.giorni);
      return '<article class="card gr" data-act="apri-gruppo" data-id="' + esc(g.id) + '"><div class="testa"><div><h3>' + ic.gruppo + ' ' + esc(g.nome) + '</h3>' +
        '<p class="ind">' + r.strutture + (r.strutture === 1 ? ' struttura' : ' strutture') + ' · ' + r.estintori + ' estintori</p></div><div class="mini">' +
        (r.inCarico ? '<span class="badge carico">' + r.inCarico + ' in carico</span>' : '') + (r.daFare ? '<span class="badge scadenza">' + r.daFare + ' da fare</span>' : '') + '</div></div></article>';
    }).join('') : '') + (singoli.length ? '<div class="gruppo"><h2>' + (gruppi.length ? 'Clienti singoli' : 'Clienti') + '</h2><span>' + singoli.length + '</span></div>' + singoli.map(c => card(c, { azioni: false })).join('') : '') +
      (!gruppi.length && !singoli.length ? vuoto('Nessun cliente', 'Aggiungi un cliente con «+ Cliente» oppure importa i tuoi fogli da Impostazioni.') : '');
  }
  function renderClienti() {
    app.innerHTML = '<div class="riga"><button class="btn primario grow" data-act="nuovo">+ Cliente</button><button class="btn grow" data-act="nuovo-gruppo">' + ic.gruppo + ' + Gruppo</button></div>' +
      '<div class="cerca">' + ic.cerca + '<input id="cerca-c" type="search" placeholder="Cerca per nome, via, comune o gruppo" value="' + esc(S.cercaClienti) + '"></div>' + barraCicli() + '<div id="lista"></div>';
    renderListaClienti();
  }

  function apriGruppo(id, mantieni) {
    const g = id ? S.gruppi.find(x => x.id === id) : null;
    let h = '<h2>' + (g ? esc(g.nome) : 'Nuovo gruppo') + '</h2><p class="anteprima" style="margin-top:-6px">Un gruppo raccoglie più strutture dello stesso cliente (per esempio una fondazione). Ogni struttura ha i suoi estintori e la sua scadenza.</p>' +
      campo('g-nome', 'Nome del gruppo *', g && g.nome) + '<div class="due">' + campo('g-ref', 'Referente', g && g.referente) + campo('g-tel', 'Telefono', g && g.telefono, 'tel') + '</div>' +
      campo('g-mail', 'Email', g && g.email, 'email') + campo('g-ind', 'Sede legale / indirizzo', g && g.indirizzo) +
      '<label class="campo"><span>Note</span><textarea id="g-note">' + esc(g && g.note) + '</textarea></label>' +
      '<button class="btn primario largo" data-act="salva-gruppo" data-id="' + esc(g ? g.id : '') + '">Salva gruppo</button>';
    if (g) {
      const str = attivi().filter(c => c.gruppoId === g.id).sort((a, b) => cmp(a.nome, b.nome));
      for (const id2 of [...S.selGruppo]) if (!str.some(c => c.id === id2)) S.selGruppo.delete(id2);
      h += '<div class="sez">Strutture (' + str.length + ')</div>' + (str.length ? str.map(c => {
        const b = badge(c);
        return '<label class="pick"><input type="checkbox" data-selg="' + esc(c.id) + '"' + (S.selGruppo.has(c.id) ? ' checked' : '') + '><span><b>' + esc(c.nome) + '</b><small>' + esc(luogo(c) || '—') + ' · ' + nEst(c) + ' estintori</small></span>' +
          '<span class="badge ' + b.cls + '">' + esc(b.txt) + '</span><button class="btn pic" data-act="apri" data-id="' + esc(c.id) + '">Apri</button></label>';
      }).join('') : '<p class="anteprima">Nessuna struttura. Aggiungine una qui sotto.</p>') +
        '<div class="riga" style="margin-top:10px"><button class="btn" data-act="g-tutte" data-id="' + esc(g.id) + '">Seleziona tutte</button><button class="btn" data-act="g-nessuna" data-id="' + esc(g.id) + '">Nessuna</button></div>' +
        '<div class="riga" style="margin-top:8px"><button class="btn primario grow" data-act="g-presa" data-id="' + esc(g.id) + '">Presa in carico (' + S.selGruppo.size + ')</button><button class="btn ok grow" data-act="g-consegna" data-id="' + esc(g.id) + '">Fatto · consegna (' + S.selGruppo.size + ')</button></div>' +
        '<div style="height:8px"></div><button class="btn largo" data-act="nuova-struttura" data-id="' + esc(g.id) + '">+ Aggiungi struttura</button>' +
        '<div style="height:18px"></div><button class="btn pericolo largo" data-act="elimina-gruppo" data-id="' + esc(g.id) + '">Elimina gruppo</button>';
    }
    apriScheda(h, mantieni);
  }
  async function salvaGruppoForm(id) {
    const v = i => ($('#' + i).value || '').trim(), nome = v('g-nome');
    if (!nome) return toast('Il nome del gruppo è obbligatorio');
    if (S.gruppi.some(x => x.id !== id && L.norm(x.nome) === L.norm(nome))) return toast('Esiste già un gruppo con questo nome');
    const g = id ? S.gruppi.find(x => x.id === id) : L.nuovoGruppo({ nome });
    Object.assign(g, { nome, referente: v('g-ref') || null, telefono: v('g-tel') || null, email: v('g-mail') || null, indirizzo: v('g-ind') || null, note: v('g-note') || null });
    await salvaG(g); toast('Gruppo salvato'); render();
    if (id) apriGruppo(g.id, true); else apriGruppo(g.id);
  }

  // --- scheda cliente ---
  function apriModulo(id, gruppoPreset) {
    const c = id ? S.clienti.find(x => x.id === id) : null;
    const primo = c ? Math.min(...c.ciclo) : 1, scad = c ? c.scadenza : L.scadenzaIniziale([1, 7]);
    const gsel = c ? c.gruppoId : (gruppoPreset || null);
    let h = '<h2>' + (c ? esc(c.nome) : 'Nuovo cliente') + '</h2>';
    if (c) {
      const b = badge(c);
      h += '<p><span class="badge ' + b.cls + '">' + esc(b.txt) + '</span> &nbsp;Ciclo ' + esc(L.etichettaCiclo(c.ciclo)) + ' · scadenza ' + esc(L.etichettaScadenza(c.scadenza)) + (c.ultima ? ' · ultima ' + dataIt(c.ultima) : '') + '</p>' +
        '<div class="azioni"><a class="btn ico" href="' + esc(mapsUrl(c)) + '" target="_blank" rel="noopener" aria-label="Naviga">' + ic.nav + '</a>' +
        (telDi(c) ? '<a class="btn ico" href="tel:' + esc(telDi(c).replace(/\s+/g, '')) + '" aria-label="Chiama">' + ic.tel + '</a>' : '') + '</div>' +
        '<div class="riga" style="margin-top:8px">' + (c.stato === 'in_carico'
          ? '<button class="btn ok grow" data-act="azione" data-tipo="consegna" data-id="' + esc(c.id) + '">' + ic.ok + 'Fatto · consegna</button><button class="btn grow" data-act="annulla-presa" data-id="' + esc(c.id) + '">Annulla presa in carico</button>'
          : '<button class="btn primario grow" data-act="azione" data-tipo="presaInCarico" data-id="' + esc(c.id) + '">' + ic.box + 'Presa in carico</button><button class="btn grow" data-act="azione" data-tipo="fattoSubito" data-id="' + esc(c.id) + '">Fatto subito</button>') + '</div>';
    }
    const tipi = L.getTipi();
    h += '<div class="sez">Dati</div>' + campo('f-nome', 'Nome cliente / struttura *', c && c.nome) +
      '<label class="campo"><span>Gruppo (es. fondazione)</span><select id="f-gruppo"><option value="">— nessun gruppo —</option>' +
      [...S.gruppi].sort((a, b) => cmp(a.nome, b.nome)).map(g => '<option value="' + esc(g.id) + '"' + (g.id === gsel ? ' selected' : '') + '>' + esc(g.nome) + '</option>').join('') +
      '<option value="__nuovo">+ Nuovo gruppo…</option></select></label><div id="f-nuovo-gruppo" hidden>' + campo('f-gruppo-nome', 'Nome del nuovo gruppo') + '</div>' +
      campo('f-ind', 'Indirizzo', c && c.indirizzo, 'text', 'autocomplete="off"') +
      '<div class="due">' + campo('f-comune', 'Comune / luogo *', c && c.comune) + campo('f-indnote', 'Note indirizzo', c && c.indirizzoNote, 'text', 'placeholder="es. ingresso sul retro"') + '</div>' +
      '<div class="due">' + campo('f-ref', 'Referente', c && c.referente) + campo('f-tel', 'Telefono', c && c.telefono, 'tel') + '</div>' + campo('f-mail', 'Email', c && c.email, 'email') +
      '<div class="sez">Estintori e scadenza</div><label class="campo"><span>Estintori (sigle) *</span><input id="f-sigle" type="text" autocapitalize="none" autocomplete="off" value="' + esc(c ? L.testoSigle(c.estintori) : '') + '" placeholder="es. 2 P6, 1 K2, 1 aut. P6">' +
      '<div id="f-anteprima" class="anteprima">' + tipi.map(t => esc(t.codice) + ' ' + esc(t.nome)).join(' · ') + ' · aut. · carr.<br>Sigla mancante? Aggiungila in Impostazioni → Sigle.</div></label>' +
      '<div class="due"><label class="campo"><span>Ciclo semestrale</span><select id="f-ciclo">' + opzioniCiclo(primo) + '</select></label>' + campo('f-scad', 'Prossima scadenza', scad.slice(0, 7), 'month') + '</div>' +
      '<label class="campo"><span>Note</span><textarea id="f-note">' + esc(c && c.note) + '</textarea></label>' +
      '<button class="btn primario largo" data-act="salva-cliente" data-id="' + esc(c ? c.id : '') + '">Salva</button>';
    if (c) {
      h += '<div class="sez">Storico interventi</div>' + ((c.interventi || []).length
        ? '<ul class="storico">' + [...c.interventi].sort((a, b) => cmp(b.presa, a.presa)).map(i => '<li><span>Presa in carico ' + dataIt(i.presa) + '</span><span>' + (i.consegna ? (i.consegna === i.presa ? 'stesso giorno' : 'consegna ' + dataIt(i.consegna)) : '<b>in carico</b>') + '</span></li>').join('') + '</ul>'
        : '<p class="anteprima">Nessun intervento registrato.</p>') +
        '<div style="height:18px"></div><button class="btn pericolo largo" data-act="elimina" data-id="' + esc(c.id) + '">Elimina cliente</button>';
    }
    apriScheda(h);
    S.tornaAGruppo = (!c && gruppoPreset) ? gruppoPreset : null;
    const sigle = $('#f-sigle'), an = $('#f-anteprima'), sel = $('#f-gruppo');
    const base = an.innerHTML;
    const aggiorna = () => {
      if (!sigle.value.trim()) { an.className = 'anteprima'; an.innerHTML = base; return; }
      const r = L.parseTipo(sigle.value);
      an.className = 'anteprima ' + (r.errori.length ? 'ko' : 'ok');
      an.textContent = r.errori.length ? r.errori[0] : L.totale(r.lista) + ' estintori: ' + r.lista.map(e => e.quantita + ' × ' + e.descrizione).join(', ');
    };
    sigle.addEventListener('input', aggiorna); if (c) aggiorna();
    sel.addEventListener('change', () => { $('#f-nuovo-gruppo').hidden = sel.value !== '__nuovo'; });
    if (!c) $('#f-ciclo').addEventListener('change', e => { $('#f-scad').value = L.scadenzaIniziale([+e.target.value, +e.target.value + 6]).slice(0, 7); });
  }
  async function salvaModulo(id) {
    const v = i => ($('#' + i).value || '').trim();
    const nome = v('f-nome'), comune = v('f-comune');
    if (!nome || !comune) return toast('Nome e comune sono obbligatori');
    const r = L.parseTipo(v('f-sigle'));
    if (!v('f-sigle') || r.errori.length) return toast(r.errori[0] || 'Inserisci almeno un estintore');
    let gruppoId = $('#f-gruppo').value || null;
    if (gruppoId === '__nuovo') {
      const gn = v('f-gruppo-nome'); if (!gn) return toast('Scrivi il nome del nuovo gruppo');
      let g = S.gruppi.find(x => L.norm(x.nome) === L.norm(gn));
      if (!g) { g = L.nuovoGruppo({ nome: gn }); await salvaG(g); }
      gruppoId = g.id;
    }
    const primo = +$('#f-ciclo').value, ciclo = [primo, primo + 6], mese = v('f-scad');
    const dati = { nome, indirizzo: v('f-ind') || null, indirizzoNote: v('f-indnote') || null, comune, referente: v('f-ref') || null,
      telefono: v('f-tel') || null, email: v('f-mail') || null, note: v('f-note') || null, gruppoId };
    if (id) {
      const c = S.clienti.find(x => x.id === id), vecchio = L.testoSigle(c.estintori);
      Object.assign(c, dati);
      if (v('f-sigle') !== vecchio) c.estintori = r.lista;
      const cambio = primo !== Math.min(...c.ciclo);
      if (cambio) c.ciclo = ciclo;
      if (mese && mese !== c.scadenza.slice(0, 7)) c.scadenza = L.fineMese(+mese.slice(0, 4), +mese.slice(5, 7));
      else if (cambio) c.scadenza = L.scadenzaIniziale(ciclo);
      await salvaC(c);
    } else {
      if (S.clienti.some(x => L.chiaveCliente(x) === L.chiaveCliente(dati))) return toast('Esiste già un cliente con questo nome e indirizzo');
      await salvaC(L.nuovoCliente(Object.assign(dati, { ciclo, estintori: r.lista, scadenza: mese ? L.fineMese(+mese.slice(0, 4), +mese.slice(5, 7)) : undefined })));
    }
    const torna = S.tornaAGruppo; S.tornaAGruppo = null;
    toast('Cliente salvato'); render();
    if (torna) apriGruppo(torna); else chiudiScheda();
  }

  // --- scelta della data per presa in carico / consegna ---
  function apriAzione(id, fn) {
    const c = S.clienti.find(x => x.id === id);
    const tit = { presaInCarico: 'Presa in carico', consegna: 'Consegna', fattoSubito: 'Fatto subito' }[fn];
    const hint = fn === 'consegna' ? '' : '<p class="anteprima" id="az-hint"></p>';
    apriScheda('<h2>' + tit + '</h2><p style="margin-top:-6px">' + esc(c.nome) + '</p><label class="campo"><span>Data</span><input id="az-data" type="date" value="' + oggi() + '"></label>' + hint +
      '<button class="btn ' + (fn === 'consegna' ? 'ok' : 'primario') + ' largo" data-act="conferma-azione" data-tipo="' + fn + '" data-id="' + esc(id) + '">Conferma</button>');
    const agg = () => { const h = $('#az-hint'), d = $('#az-data').value; if (h && d) h.innerHTML = 'Prossima scadenza: <b>' + esc(L.etichettaScadenza(L.scadenzaDopoIntervento(c.ciclo, d))) + '</b>'; };
    $('#az-data').addEventListener('input', agg); agg();
  }

  // ======================= IMPOSTAZIONI e DATI =======================
  const fa = iso => { if (!iso) return 'mai'; const g = Math.floor((Date.now() - new Date(iso)) / 864e5); return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : g + ' giorni fa'; };
  const sceltaPref = (chiave, opzioni) => '<select data-pref="' + chiave + '">' + opzioni.map(([v, t]) => '<option value="' + v + '"' + (String(S.imp[chiave]) === String(v) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
  function renderImpostazioni() {
    $('#sottotitolo').textContent = 'Sigle, preferenze, copie e dati';
    const imp = S.importFile, bk = S.importBackup, tipi = L.getTipi();
    let h = '';
    if (imp) {
      const a = imp.analisi, n = a.clienti.filter(c => !c.problemi).length;
      const sel = '<option value="">—</option>' + L.MESI.map((x, i) => '<option value="' + (i + 1) + '">' + x + '</option>').join('');
      h += '<div class="blocco"><h2>Anteprima: ' + esc(imp.nome) + '</h2><p>' + a.clienti.length + ' clienti, ' + a.clienti.reduce((s, c) => s + L.totale(c.estintori), 0) + ' estintori' +
        (a.formato === 'export' ? ' · Excel esportato dall\'app riconosciuto.' : '.') + '</p>' +
        (a.formato === 'export' ? '' : a.mesi.length ? '<div class="avviso ok">Ciclo rilevato: <b>' + esc(L.etichettaCiclo(a.mesi)) + '</b></div>' :
          '<div class="avviso">Mesi del ciclo non trovati nel titolo. Scegli i due mesi:</div><div class="due"><label class="campo"><span>Primo mese</span><select id="imp-m1">' + sel + '</select></label><label class="campo"><span>Secondo mese</span><select id="imp-m2">' + sel + '</select></label></div>') +
        (a.avvisi.length ? '<details class="avvisi"><summary>' + a.avvisi.length + ' avvisi</summary><ul>' + a.avvisi.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '') +
        '<button class="btn primario largo" data-act="conferma-import">Importa ' + n + ' clienti</button><button class="btn largo" data-act="annulla-import">Annulla</button></div>';
    }
    if (bk) {
      h += '<div class="blocco"><h2>Copia di sicurezza trovata</h2><p>' + (bk.clienti || []).length + ' clienti' + ((bk.gruppi || []).length ? ', ' + bk.gruppi.length + ' gruppi' : '') + ((bk.giri || []).length ? ', ' + bk.giri.length + ' giri' : '') +
        ', salvata il ' + esc(dataIt((bk.esportato || '').slice(0, 10))) + '.</p><button class="btn primario largo" data-act="bk-sostituisci">Sostituisci i dati attuali</button>' +
        '<button class="btn largo" data-act="bk-unisci">Aggiungi solo ciò che manca</button><button class="btn largo" data-act="annulla-import">Annulla</button></div>';
    }
    h += '<div class="blocco"><h2>Sigle estintori</h2><p>Codice + capacità: «P6» è polvere 6 kg. Qui aggiungi tipi e capacità nuove, poi le scrivi nelle schede cliente e nei fogli importati. «aut.» e «carr.» valgono per tutti.</p>' +
      tipi.map(t => {
        const k = t.codice.toUpperCase(), uso = tipoInUso(k);
        return '<div class="tipo"><div class="testa"><b>' + esc(t.codice) + ' · ' + esc(t.nome) + ' (' + esc(t.unita) + ')</b>' +
          (uso ? '<span class="et">in uso</span>' : '<button class="btn pic pericolo" data-act="tipo-del" data-codice="' + esc(t.codice) + '">Elimina</button>') + '</div><div class="caps">' +
          t.capacita.map(cap => '<span class="cap">' + esc(t.codice) + cap + (capInUso(k, cap) || t.capacita.length < 2 ? '' : '<button data-act="cap-del" data-codice="' + esc(t.codice) + '" data-cap="' + cap + '" aria-label="Togli ' + cap + '">×</button>') + '</span>').join('') +
          '</div><div class="riga"><input id="cap-' + k + '" class="grow" inputmode="numeric" placeholder="Nuova capacità (es. 6)"><button class="btn" data-act="cap-add" data-codice="' + esc(t.codice) + '">Aggiungi</button></div></div>';
      }).join('') +
      '<div class="sez">Nuovo tipo</div><div class="due">' + campo('t-codice', 'Codice (1-4 lettere)', '', 'text', 'maxlength="4" autocapitalize="none"') + campo('t-nome', 'Nome', '', 'text', 'placeholder="es. Idrico"') + '</div>' +
      '<div class="due"><label class="campo"><span>Unità</span><select id="t-unita"><option>kg</option><option>L</option></select></label>' + campo('t-cap', 'Capacità (separate da spazio)', '', 'text', 'placeholder="es. 6 9" inputmode="numeric"') + '</div>' +
      '<button class="btn largo" data-act="tipo-nuovo">Aggiungi tipo</button></div>';
    h += '<div class="blocco"><h2>Preferenze</h2><label class="campo"><span>Scadenze mostrate all\'apertura</span>' + sceltaPref('giorniDefault', [[30, '30 giorni'], [60, '60 giorni'], [90, '90 giorni'], [180, '180 giorni']]) + '</label>' +
      '<label class="campo"><span>Raggruppa «Da fare» per</span>' + sceltaPref('raggruppa', [['comune', 'Comune'], ['gruppo', 'Gruppo'], ['nessuno', 'Nessuno']]) + '</label>' +
      '<label class="campo"><span>Evidenzia i clienti in carico da almeno</span>' + sceltaPref('avvisoCarico', [1, 2, 3, 4, 5, 7].map(n => [n, n + (n === 1 ? ' giorno' : ' giorni')])) + '</label>' +
      '<label class="campo"><span>Ricordami la copia di sicurezza dopo</span>' + sceltaPref('backupGiorni', [[7, '7 giorni'], [14, '14 giorni'], [30, '30 giorni'], [0, 'Mai']]) + '</label></div>';
    h += '<div class="blocco"><h2>Copia di sicurezza</h2><p>Ultima copia: <b>' + fa(S.ultimoBackup) + '</b>. Il file viene salvato nella cartella <b>Download</b> del telefono: caricalo tu su Drive quando vuoi.</p>' +
      '<button class="btn primario largo" data-act="backup">Salva copia nei Download</button><label class="btn largo" for="file-bk">Ripristina da una copia</label><input id="file-bk" type="file" accept=".json,application/json" hidden></div>';
    h += '<div class="blocco"><h2>Importa da Excel / ODS</h2><p>Vanno bene: i tuoi fogli originali (Nome Cliente · Quantità · Tipo Estintori · Luogo) e l\'Excel scaricato dall\'app. I clienti già presenti vengono saltati.</p>' +
      '<label class="btn largo" for="file-xl">Scegli il file</label><input id="file-xl" type="file" accept=".ods,.xlsx,.xls,.csv" hidden>' +
      (S.daV1 && S.daV1.length ? '<div class="avviso" style="margin-top:12px">Sul telefono ci sono i dati della <b>versione 1</b> (' + S.daV1.length + ' clienti).<br><button class="btn primario" data-act="importa-v1">Importa dalla versione 1</button></div>' : '') + '</div>';
    h += '<div class="blocco"><h2>Esporta</h2><p>Elenco completo dei clienti in Excel (nei Download).</p><button class="btn largo" data-act="esporta-excel">Scarica Excel</button></div>';
    h += '<div class="blocco"><h2>Stato</h2><p>' + attivi().length + ' clienti sul telefono. Archivio ' + (S.persist ? '<b>protetto</b> dalla pulizia automatica.' : 'non ancora protetto: fai ogni tanto la copia di sicurezza.') + '</p>' +
      (S.installEvent ? '<button class="btn primario largo" data-act="installa">Installa l\'app sul telefono</button>' : '') +
      '<button class="btn pericolo largo" data-act="svuota">Cancella tutti i dati</button><p class="anteprima" style="margin-top:12px">Estintori v2</p></div>';
    app.innerHTML = h;
  }

  function scarica(nome, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Salvato nei Download: ' + nome);
  }
  async function leggiFileExcel(file) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      S.importFile = { nome: file.name, analisi: L.analizza(rows) }; S.importBackup = null;
    } catch (e) { S.importFile = null; toast('File non leggibile: ' + e.message); }
    renderImpostazioni(); window.scrollTo(0, 0);
  }
  async function confermaImport() {
    const imp = S.importFile; let mesi = imp.analisi.mesi;
    if (imp.analisi.formato === 'foglio' && !mesi.length) {
      const m1 = +$('#imp-m1').value, m2 = +$('#imp-m2').value;
      if (!m1 || !m2 || m1 === m2) return toast('Scegli due mesi diversi');
      mesi = [m1, m2].sort((a, b) => a - b);
    }
    const r = L.clientiDaImportare(S.clienti, S.gruppi, imp.analisi, mesi);
    await A.salvaMolti('gruppi', r.nuoviGruppi); S.gruppi.push(...r.nuoviGruppi);
    await A.salvaMolti('clienti', r.nuovi); S.clienti.push(...r.nuovi); S.importFile = null;
    let msg = 'Importati ' + r.nuovi.length + ' clienti';
    if (r.saltatiEsistenti.length) msg += ' · ' + r.saltatiEsistenti.length + ' già presenti';
    if (r.saltatiErrori.length) msg += ' · ' + r.saltatiErrori.length + ' da correggere';
    toast(msg); setTab('fare');
  }
  async function importaDaV1() {
    const ids = new Set(S.clienti.map(c => c.id)), chiavi = new Set(S.clienti.map(L.chiaveCliente)), nuovi = [];
    for (const raw of S.daV1 || []) { const c = L.migraCliente(raw); if (!ids.has(c.id) && !chiavi.has(L.chiaveCliente(c))) nuovi.push(c); }
    await A.salvaMolti('clienti', nuovi); S.clienti.push(...nuovi);
    toast(nuovi.length ? 'Importati ' + nuovi.length + ' clienti dalla versione 1' : 'Tutti i clienti della versione 1 sono già presenti'); setTab('fare');
  }
  async function backup() {
    const dati = { app: 'estintori', versione: 2, esportato: new Date().toISOString(), clienti: S.clienti, gruppi: S.gruppi, giri: S.giri, impostazioni: S.imp };
    scarica('copia-estintori-' + oggi() + '.json', new Blob([JSON.stringify(dati)], { type: 'application/json' }));
    S.ultimoBackup = new Date().toISOString(); await A.scriviMeta('ultimoBackup', S.ultimoBackup); render();
  }
  async function leggiBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.clienti)) throw new Error('formato non valido');
      S.importBackup = d; S.importFile = null;
    } catch (e) { toast('Copia non valida: ' + e.message); }
    renderImpostazioni(); window.scrollTo(0, 0);
  }
  async function ripristina(unisci) {
    const d = S.importBackup, cl = (d.clienti || []).map(L.migraCliente), gr = d.gruppi || [], gi = d.giri || [];
    if (!unisci) {
      await A.sostituisci('clienti', cl); await A.sostituisci('gruppi', gr); await A.sostituisci('giri', gi);
      S.clienti = cl; S.gruppi = gr; S.giri = gi;
      if (d.impostazioni) { S.imp = unisciImp(d.impostazioni); await salvaImp(); }
    } else {
      const aggiungi = async (store, lista, extra) => { const ids = new Set(lista.map(x => x.id)); const n = extra.filter(x => !ids.has(x.id)); await A.salvaMolti(store, n); lista.push(...n); return n.length; };
      if (d.impostazioni && d.impostazioni.tipi) { S.imp.tipi = L.unisciTipi(S.imp.tipi, d.impostazioni.tipi); await salvaImp(); }
      await aggiungi('gruppi', S.gruppi, gr); await aggiungi('giri', S.giri, gi); await aggiungi('clienti', S.clienti, cl);
    }
    S.importBackup = null; toast(unisci ? 'Copia aggiunta ai dati attuali' : 'Dati ripristinati'); setTab('fare');
  }
  function esportaExcel() {
    const righe = [...attivi()].sort((a, b) => cmp((gruppoDi(a) || {}).nome, (gruppoDi(b) || {}).nome) || cmp(a.nome, b.nome)).map(c => ({
      Gruppo: (gruppoDi(c) || {}).nome || '', Cliente: c.nome, Indirizzo: c.indirizzo || '', 'Note indirizzo': c.indirizzoNote || '', Comune: c.comune || '',
      Referente: c.referente || '', Telefono: c.telefono || '', Email: c.email || '', Estintori: (c.estintori || []).map(L.sigla).join(' '),
      'N. estintori': nEst(c), Ciclo: L.etichettaCiclo(c.ciclo), Stato: c.stato === 'in_carico' ? 'In carico' : 'Normale', 'Presa in carico': dataIt(c.presaInCarico),
      'Ultima manutenzione': dataIt(c.ultima), 'Prossima scadenza': L.etichettaScadenza(c.scadenza), Note: c.note || '' }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), 'Clienti');
    scarica('clienti-' + oggi() + '.xlsx', new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // ======================= NAVIGAZIONE =======================
  const TITOLI = { fare: 'Da fare', giri: 'Giri', clienti: 'Clienti', imp: 'Impostazioni' };
  function aggiornaBadge() {
    const n = attivi().filter(c => c.stato === 'in_carico').length, b = document.querySelector('[data-tab=fare] .nb');
    if (b) { b.textContent = n; b.hidden = !n; }
    try { if (n && navigator.setAppBadge) navigator.setAppBadge(n); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { /* non supportato */ }
  }
  function render() {
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    $('#titolo').textContent = TITOLI[S.tab];
    const top = $('#btn-nuovo-top'); top.hidden = S.tab === 'imp'; top.dataset.act = S.tab === 'giri' ? 'nuovo-giro' : 'nuovo';
    if (S.tab === 'fare') { $('#sottotitolo').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); renderFare(); }
    else if (S.tab === 'giri') renderGiri();
    else if (S.tab === 'clienti') renderClienti();
    else renderImpostazioni();
    aggiornaBadge();
  }
  function setTab(t) {
    if (t === 'giri' && S.tab === 'giri') S.giroAperto = null;
    S.tab = t; S.riordina = false; pref.scrivi(); render(); window.scrollTo(0, 0);
  }
  function vaiA(hash) {
    const h = (hash || '').replace('#', '');
    if (h === 'consegne' || h === 'fare') { setTab('fare'); if (h === 'consegne') setTimeout(() => { const e = $('#consegne'); if (e && e.firstChild) e.scrollIntoView(); }, 50); }
    else if (h === 'giri') setTab('giri');
    else if (h === 'nuovo') { setTab('clienti'); apriModulo(null); }
  }

  // ======================= EVENTI =======================
  async function confermaElimina(testo) { return confirm(testo); }
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-stop]')) return;
    const tab = e.target.closest('[data-tab]'); if (tab) return setTab(tab.dataset.tab);
    const g = e.target.closest('[data-giorni]'); if (g) { S.giorni = +g.dataset.giorni; return renderFare(); }
    const rg = e.target.closest('[data-raggruppa]'); if (rg) { S.raggruppa = rg.dataset.raggruppa; return renderFare(); }
    const ci = e.target.closest('[data-ciclo]'); if (ci) { S.ciclo = ci.dataset.ciclo; S.comuni.clear(); pref.scrivi(); return render(); }
    const k = e.target.closest('[data-comune]');
    if (k) { const v = k.dataset.comune; if (!v && k.textContent === 'Tutti i comuni') S.comuni.clear(); else if (S.comuni.has(v)) S.comuni.delete(v); else S.comuni.add(v); return renderFare(); }
    const pg = e.target.closest('[data-pick-gruppo]');
    if (pg) { const ids = pg.dataset.pickGruppo.split(','), tutti = ids.every(i => P.sel.has(i)); ids.forEach(i => tutti ? P.sel.delete(i) : P.sel.add(i)); return renderPickerLista(); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, a = b.dataset.act;
    switch (a) {
      case 'apri': return apriModulo(id);
      case 'apri-gruppo': return apriGruppo(id);
      case 'nuovo': return apriModulo(null);
      case 'nuovo-gruppo': return apriGruppo(null);
      case 'nuova-struttura': return apriModulo(null, id);
      case 'salva-cliente': return salvaModulo(id);
      case 'salva-gruppo': return salvaGruppoForm(id);
      case 'presa': return operazione(id, 'presaInCarico', oggi());
      case 'consegna': return operazione(id, 'consegna', oggi());
      case 'azione': return apriAzione(id, b.dataset.tipo);
      case 'conferma-azione': { const d = $('#az-data').value; if (!d) return toast('Scegli la data'); return operazione(id, b.dataset.tipo, d); }
      case 'annulla-presa': return operazione(id, 'annullaPresa');
      case 'elimina':
        if (await confermaElimina('Eliminare definitivamente questo cliente e il suo storico?')) {
          await A.elimina('clienti', id); S.clienti = S.clienti.filter(c => c.id !== id);
          for (const gi of S.giri) if (gi.clienti.includes(id)) { gi.clienti = gi.clienti.filter(x => x !== id); await salvaGiro(gi); }
          chiudiScheda(); render(); toast('Cliente eliminato');
        } return;
      case 'elimina-gruppo':
        if (await confermaElimina('Eliminare il gruppo? Le strutture restano come clienti singoli.')) {
          for (const c of S.clienti.filter(c => c.gruppoId === id)) { c.gruppoId = null; await salvaC(c); }
          await A.elimina('gruppi', id); S.gruppi = S.gruppi.filter(x => x.id !== id); chiudiScheda(); render(); toast('Gruppo eliminato');
        } return;
      case 'g-tutte': attivi().filter(c => c.gruppoId === id).forEach(c => S.selGruppo.add(c.id)); return apriGruppo(id, true);
      case 'g-nessuna': S.selGruppo.clear(); return apriGruppo(id, true);
      case 'g-presa': await operazioneMulti([...S.selGruppo], 'presaInCarico', oggi()); return apriGruppo(id, true);
      case 'g-consegna': await operazioneMulti([...S.selGruppo], 'consegna', oggi()); return apriGruppo(id, true);
      case 'nuovo-giro': return apriPicker(null);
      case 'aggiungi-giro': return apriPicker(id);
      case 'crea-giro': return creaGiro();
      case 'apri-giro': S.giroAperto = id; S.riordina = false; return render();
      case 'indietro-giri': S.giroAperto = null; S.riordina = false; return render();
      case 'riordina': S.riordina = !S.riordina; return renderGiro();
      case 'su': return muovi(id, -1);
      case 'giu': return muovi(id, 1);
      case 'togli': { const gi = S.giri.find(x => x.id === S.giroAperto); gi.clienti = gi.clienti.filter(x => x !== id); await salvaGiro(gi); return renderGiro(); }
      case 'rinomina-giro': { const gi = S.giri.find(x => x.id === id), n = prompt('Nome del giro', gi.nome); if (n && n.trim()) { gi.nome = n.trim(); await salvaGiro(gi); render(); } return; }
      case 'elimina-giro':
        if (await confermaElimina('Eliminare il giro? I clienti non vengono toccati.')) { await A.elimina('giri', id); S.giri = S.giri.filter(x => x.id !== id); S.giroAperto = null; render(); toast('Giro eliminato'); } return;
      case 'backup': return backup();
      case 'esporta-excel': return esportaExcel();
      case 'conferma-import': return confermaImport();
      case 'annulla-import': S.importFile = null; S.importBackup = null; return renderImpostazioni();
      case 'bk-sostituisci': if (confirm('Sostituire tutti i dati attuali con quelli della copia?')) return ripristina(false); return;
      case 'bk-unisci': return ripristina(true);
      case 'importa-v1': return importaDaV1();
      case 'svuota':
        if (confirm('Cancellare TUTTI i clienti, i gruppi e i giri dal telefono? Fai prima una copia di sicurezza.') && confirm('Sei sicuro? L\'operazione non si può annullare.')) {
          await A.svuotaTutto(); S.clienti = []; S.gruppi = []; S.giri = []; S.giroAperto = null; toast('Dati cancellati'); render();
        } return;
      case 'installa': S.installEvent.prompt(); S.installEvent = null; return renderImpostazioni();
      // --- sigle ---
      case 'cap-add': {
        const inp = $('#cap-' + b.dataset.codice.toUpperCase()), v = L.parseCapacita(inp.value);
        if (!v || !v.length) return toast('Scrivi una o più capacità, numeri interi (es. 6 9)');
        const t = S.imp.tipi.find(x => x.codice === b.dataset.codice); t.capacita = [...new Set([...t.capacita, ...v])].sort((x, y) => x - y);
        await salvaImp(); toast('Capacità aggiunte'); return renderImpostazioni();
      }
      case 'cap-del': { const t = S.imp.tipi.find(x => x.codice === b.dataset.codice); t.capacita = t.capacita.filter(x => x !== +b.dataset.cap); await salvaImp(); return renderImpostazioni(); }
      case 'tipo-del':
        if (S.imp.tipi.length < 2) return toast('Deve restare almeno un tipo');
        if (confirm('Eliminare il tipo ' + b.dataset.codice + '?')) { S.imp.tipi = S.imp.tipi.filter(x => x.codice !== b.dataset.codice); await salvaImp(); renderImpostazioni(); } return;
      case 'tipo-nuovo': {
        const t = { codice: $('#t-codice').value.trim(), nome: $('#t-nome').value.trim(), unita: $('#t-unita').value, capacita: L.parseCapacita($('#t-cap').value) };
        const err = L.validaNuovoTipo(t, S.imp.tipi) || (t.capacita ? null : 'Le capacità devono essere numeri interi (es. 6 9).');
        if (err) return toast(err);
        S.imp.tipi.push(t); await salvaImp(); toast('Tipo ' + t.codice + ' aggiunto'); return renderImpostazioni();
      }
    }
  });
  document.addEventListener('pointerdown', e => { const h = e.target.closest('[data-drag]'); if (h) avviaDrag(e, h); });
  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'cerca') { S.cerca = e.target.value; renderListaFare(); }
    else if (id === 'cerca-c') { S.cercaClienti = e.target.value; renderListaClienti(); }
    else if (id === 'p-cerca') { P.cerca = e.target.value; renderPickerLista(); }
  });
  document.addEventListener('change', async e => {
    const t = e.target, f = t.files && t.files[0];
    if (f) { if (t.id === 'file-xl') leggiFileExcel(f); else if (t.id === 'file-bk') leggiBackup(f); t.value = ''; return; }
    if (t.dataset.pref) {
      S.imp[t.dataset.pref] = t.dataset.pref === 'raggruppa' ? t.value : +t.value;
      if (t.dataset.pref === 'giorniDefault') S.giorni = S.imp.giorniDefault;
      if (t.dataset.pref === 'raggruppa') S.raggruppa = S.imp.raggruppa;
      await salvaImp(); toast('Preferenza salvata'); return;
    }
    if (t.dataset.pick !== undefined) { t.checked ? P.sel.add(t.dataset.pick) : P.sel.delete(t.dataset.pick); return renderPickerLista(); }
    if (t.dataset.selg !== undefined) {
      t.checked ? S.selGruppo.add(t.dataset.selg) : S.selGruppo.delete(t.dataset.selg);
      document.querySelectorAll('[data-act=g-presa]').forEach(x => { x.textContent = 'Presa in carico (' + S.selGruppo.size + ')'; });
      document.querySelectorAll('[data-act=g-consegna]').forEach(x => { x.textContent = 'Fatto · consegna (' + S.selGruppo.size + ')'; });
      return;
    }
    if (t.id === 'p-mese') { P.mese = t.value; renderPickerLista(); }
    else if (t.id === 'p-scaduti') { P.scaduti = t.checked; renderPickerLista(); }
    else if (t.id === 'p-ciclo') { P.ciclo = t.value; renderPickerLista(); }
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvent = e; if (S.tab === 'imp') renderImpostazioni(); });
  window.addEventListener('hashchange', () => vaiA(location.hash));

  // ======================= AVVIO =======================
  (async function avvio() {
    pref.leggi();
    if (S.tab === 'imp' || !TITOLI[S.tab]) S.tab = 'fare';
    try {
      const [cl, gr, gi, imp] = await Promise.all([A.tutti('clienti'), A.tutti('gruppi'), A.tutti('giri'), A.leggiMeta('impostazioni')]);
      S.imp = unisciImp(imp); L.impostaTipi(S.imp.tipi);
      S.clienti = cl.map(L.migraCliente); S.gruppi = gr; S.giri = gi;
      S.giorni = S.imp.giorniDefault; S.raggruppa = S.imp.raggruppa;
      S.ultimoBackup = await A.leggiMeta('ultimoBackup');
      if (navigator.storage && navigator.storage.persist) S.persist = await navigator.storage.persist();
      S.daV1 = await A.leggiDaV1();
    } catch (e) { app.innerHTML = '<div class="avviso ko">Impossibile aprire l\'archivio dati: ' + esc(e.message) + '. Se stai usando la navigazione privata, aprila in una scheda normale.</div>'; return; }
    if (S.ciclo && !cicliPresenti().some(c => c.key === S.ciclo)) S.ciclo = '';
    render();
    if (location.hash) vaiA(location.hash);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
