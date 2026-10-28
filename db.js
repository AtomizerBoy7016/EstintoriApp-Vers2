/* Archivio sul telefono (IndexedDB), versione 2.
   Usa un database con nome DIVERSO dalla v1 ("estintori-v2"): le due app, anche se stanno sullo stesso
   indirizzo di base (github.io), non si mescolano. La v1 viene solo LETTA, su richiesta, dall'importazione. */
(function (root) {
  'use strict';
  const NOME = 'estintori-v2', VERSIONE = 1, NOME_V1 = 'scadenze-estintori';
  const STORES = ['clienti', 'gruppi', 'giri', 'meta'];
  let _db = null;

  function apri() {
    if (_db) return Promise.resolve(_db);
    return new Promise((ok, ko) => {
      const rq = indexedDB.open(NOME, VERSIONE);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'meta' ? 'k' : 'id' }); });
      };
      rq.onsuccess = () => { _db = rq.result; ok(_db); };
      rq.onerror = () => ko(rq.error);
    });
  }
  function tx(store, modo, fn) {
    return apri().then(d => new Promise((ok, ko) => {
      const t = d.transaction(store, modo);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => ok(r && r.result !== undefined ? r.result : undefined);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    }));
  }
  const tutti = store => tx(store, 'readonly', s => s.getAll());
  const salva = (store, doc) => tx(store, 'readwrite', s => s.put(doc));
  const elimina = (store, id) => tx(store, 'readwrite', s => s.delete(id));
  const salvaMolti = (store, lista) => tx(store, 'readwrite', s => { lista.forEach(d => s.put(d)); });
  const sostituisci = (store, lista) => tx(store, 'readwrite', s => { s.clear(); lista.forEach(d => s.put(d)); });
  const svuotaTutto = () => Promise.all(['clienti', 'gruppi', 'giri'].map(s => tx(s, 'readwrite', st => st.clear())));
  const leggiMeta = k => tx('meta', 'readonly', s => s.get(k)).then(r => r ? r.v : null);
  const scriviMeta = (k, v) => tx('meta', 'readwrite', s => s.put({ k, v }));

  /* Dati della versione 1 presenti sullo stesso telefono e allo stesso indirizzo di base (sola lettura).
     Non apre il database se non esiste, per non crearne uno vuoto che disturberebbe la v1. */
  async function leggiDaV1() {
    try {
      if (!indexedDB.databases) return null;
      const elenco = await indexedDB.databases();
      if (!elenco.some(d => d.name === NOME_V1)) return null;
      return await new Promise(ok => {
        const rq = indexedDB.open(NOME_V1);
        rq.onerror = () => ok(null);
        rq.onupgradeneeded = () => { rq.transaction.abort(); ok(null); };   // non esisteva davvero: niente da creare
        rq.onsuccess = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains('clienti')) { d.close(); return ok(null); }
          const r = d.transaction('clienti', 'readonly').objectStore('clienti').getAll();
          r.onsuccess = () => { d.close(); ok(r.result); };
          r.onerror = () => { d.close(); ok(null); };
        };
      });
    } catch (e) { return null; }
  }

  root.Archivio = { tutti, salva, elimina, salvaMolti, sostituisci, svuotaTutto, leggiMeta, scriviMeta, leggiDaV1 };
})(self);
