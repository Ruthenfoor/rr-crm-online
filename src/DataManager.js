import { db } from './firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';

const CUADRES_COLLECTION = 'cuadres';
const SALES_COLLECTION = 'sales';

export const DataManager = {
  // We'll cache data locally after fetching
  _cuadres: [],
  _sales: [],

  async fetchAll() {
    try {
      const cuadresSnap = await getDocs(collection(db, CUADRES_COLLECTION));
      this._cuadres = cuadresSnap.docs.map(doc => doc.data()).sort((a, b) => new Date(b.createdAt || b.fecha) - new Date(a.createdAt || a.fecha));
      
      const salesSnap = await getDocs(collection(db, SALES_COLLECTION));
      this._sales = salesSnap.docs.map(doc => doc.data());
    } catch (e) {
      console.error("Error fetching data:", e);
    }
  },

  getCuadres: () => DataManager._cuadres,
  
  async saveCuadres(data) {
    // Update local cache immediately
    DataManager._cuadres = data;
    // Persist all cuadres to Firestore using batch writes
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const cuadre of data) {
        const id = String(cuadre.id || Date.now() + Math.random());
        const ref = doc(db, CUADRES_COLLECTION, id);
        batch.set(ref, { ...cuadre, id });
        count++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) {
        await batch.commit();
      }
    } catch (e) {
      console.error('Error saving cuadres batch:', e);
      throw e;
    }
  },

  async saveCuadre(cuadre) {
    try {
      await setDoc(doc(db, CUADRES_COLLECTION, cuadre.id), cuadre);
      const idx = this._cuadres.findIndex(c => c.id === cuadre.id);
      if (idx >= 0) this._cuadres[idx] = cuadre;
      else this._cuadres.unshift(cuadre);
    } catch (e) {
      console.error("Error saving cuadre", e);
      throw e;
    }
  },

  getSales: () => DataManager._sales,

  async saveSales(data) {
    DataManager._sales = data;
    // Use the sale's existing deterministic id as the Firestore document ID.
    // This ensures reimporting the same Excel overwrites the same document
    // instead of creating duplicate entries.
    let batch = writeBatch(db);
    let count = 0;
    for (const sale of data) {
      if (!sale.id) continue; // skip entries without an id (should not happen)
      const saleRef = doc(db, SALES_COLLECTION, String(sale.id));
      batch.set(saleRef, sale);
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    if (count % 400 !== 0) {
      await batch.commit();
    }
  },

  async deleteCuadre(id) {
    try {
      await deleteDoc(doc(db, CUADRES_COLLECTION, id));
      this._cuadres = this._cuadres.filter(c => c.id !== id);
      return this._cuadres;
    } catch (e) {
      console.error("Error deleting cuadre", e);
      throw e;
    }
  },

  // Deduplication function — cleans up sales that were saved with random IDs
  // Groups sales by their deterministic key and deletes all but one per group.
  async deduplicateSales() {
    // Re-fetch fresh data from Firestore
    const salesSnap = await getDocs(collection(db, SALES_COLLECTION));
    const allDocs = salesSnap.docs; // [{id, data()}]

    // Helper: compute deterministic key for a sale (same algorithm as makeSaleId in LegacyApp)
    const normalize = str => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
    const makeKey = (s) => [
      (s.placa || '').toUpperCase(),
      s.fechaVenta || '',
      String(parseFloat(s.importe) || 0),
      normalize(s.cliente || ''),
      normalize(s.vendedor || '')
    ].join('|');

    // Group documents by key — keep the one with a "sale_" id (deterministic) if available,
    // otherwise keep the first one found.
    const groups = {};
    for (const d of allDocs) {
      const data = d.data();
      const key = makeKey(data);
      if (!groups[key]) {
        groups[key] = { keep: d, dupes: [] };
      } else {
        const currentKeepId = groups[key].keep.id;
        // Prefer the deterministic id (starts with "sale_")
        if (d.id.startsWith('sale_') && !currentKeepId.startsWith('sale_')) {
          groups[key].dupes.push(groups[key].keep);
          groups[key].keep = d;
        } else {
          groups[key].dupes.push(d);
        }
      }
    }

    // Collect all doc IDs to delete
    const toDelete = [];
    const toUpdate = []; // docs to re-save with a deterministic id
    for (const key of Object.keys(groups)) {
      const { keep, dupes } = groups[key];
      // If the keeper doesn't have a deterministic id, we need to re-save it with one
      if (!keep.id.startsWith('sale_')) {
        toUpdate.push({ oldId: keep.id, data: keep.data() });
        toDelete.push(keep.id); // will be replaced
      }
      for (const d of dupes) {
        toDelete.push(d.id);
      }
    }

    let deleted = 0;
    let rewritten = 0;

    // Delete duplicates in batches of 400
    if (toDelete.length > 0) {
      let batch = writeBatch(db);
      let count = 0;
      for (const id of toDelete) {
        batch.delete(doc(db, SALES_COLLECTION, id));
        count++;
        deleted++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) await batch.commit();
    }

    // Re-save keepers that had random IDs under their new deterministic ID
    if (toUpdate.length > 0) {
      let batch = writeBatch(db);
      let count = 0;
      for (const item of toUpdate) {
        const data = item.data;
        const makeId = (placa, fechaVenta, importe, cliente, vendedor) => {
          const raw = [placa, fechaVenta, importe, normalize(cliente || ''), normalize(vendedor || '')].join('|');
          let hash = 0;
          for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
          }
          return 'sale_' + Math.abs(hash).toString(36) + '_' + raw.length;
        };
        const newId = makeId(data.placa, data.fechaVenta, data.importe, data.cliente, data.vendedor);
        const ref = doc(db, SALES_COLLECTION, newId);
        batch.set(ref, { ...data, id: newId });
        count++;
        rewritten++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) await batch.commit();
    }

    // Refresh local cache
    const fresh = await getDocs(collection(db, SALES_COLLECTION));
    this._sales = fresh.docs.map(d => d.data());

    return {
      total: allDocs.length,
      unique: Object.keys(groups).length,
      deleted: deleted - toUpdate.length, // actual duplicates removed
      rewritten
    };
  },

  // Migration function
  async migrateData(localCuadres, localSales) {
    try {
      let batch = writeBatch(db);
      let count = 0;
      
      // Upload Cuadres
      for (const cuadre of localCuadres) {
        // Stringify id just in case
        cuadre.id = String(cuadre.id || Date.now() + Math.random());
        const ref = doc(db, CUADRES_COLLECTION, cuadre.id);
        batch.set(ref, cuadre);
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db); // Create new batch
        }
      }
      
      // Upload Sales
      for (const sale of localSales || []) {
        sale.id = String(sale.id || Date.now() + Math.random());
        const ref = doc(db, SALES_COLLECTION, sale.id);
        batch.set(ref, sale);
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db); // Create new batch
        }
      }
      
      if (count % 400 !== 0) {
        await batch.commit();
      }
      
      alert("Migración completada con éxito!");
      await this.fetchAll();
    } catch (e) {
      console.error("Migration error", e);
      alert("Error en migración: " + e.message);
    }
  }
};
