import { db } from './firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';

const CUADRES_COLLECTION = 'cuadres';
const SALES_COLLECTION = 'sales';

// Sanitizer: garantiza que NINGÚN campo sea undefined, NaN o de tipo incompatible con Firestore
export function cleanCuadreForFirestore(raw) {
  if (!raw) return null;
  const id = String(raw.id || Date.now() + Math.random());

  // Formatear createdAt a ISO string seguro
  let createdAt = raw.createdAt;
  if (!createdAt) {
    createdAt = new Date().toISOString();
  } else if (createdAt instanceof Date) {
    createdAt = createdAt.toISOString();
  } else if (typeof createdAt === 'object' && createdAt.seconds) {
    createdAt = new Date(createdAt.seconds * 1000).toISOString();
  } else if (typeof createdAt !== 'string') {
    createdAt = String(createdAt);
  }

  // updatedAt siempre se actualiza al momento actual
  const updatedAt = new Date().toISOString();

  // Limpiar lista de items asegurando que no haya undefined
  const cleanItems = (Array.isArray(raw.items) ? raw.items : []).map(item => ({
    id: String(item.id || Date.now() + Math.random()),
    type: String(item.type || 'efectivo'),
    monto: String(item.monto !== undefined && item.monto !== null ? item.monto : '0'),
    descripcion: String(item.descripcion || ''),
    verified: Boolean(item.verified)
  }));

  return {
    id,
    fecha: String(raw.fecha || new Date().toISOString().split('T')[0]),
    placa: String(raw.placa || '').toUpperCase().trim(),
    montoDespacho: typeof raw.montoDespacho === 'number' && !isNaN(raw.montoDespacho) ? raw.montoDespacho : (parseFloat(raw.montoDespacho) || 0),
    totalRecaudado: typeof raw.totalRecaudado === 'number' && !isNaN(raw.totalRecaudado) ? raw.totalRecaudado : (parseFloat(raw.totalRecaudado) || 0),
    diferencia: typeof raw.diferencia === 'number' && !isNaN(raw.diferencia) ? raw.diferencia : (parseFloat(raw.diferencia) || 0),
    isReviewed: Boolean(raw.isReviewed),
    items: cleanItems,
    guides: Array.isArray(raw.guides) ? raw.guides.filter(Boolean).map(String) : [],
    createdAt,
    updatedAt
  };
}

export const DataManager = {
  // We'll cache data locally after fetching
  _cuadres: [],
  _sales: [],

  async fetchAll() {
    try {
      // 1. Cargar caché local inmediato si existe
      try {
        const cached = localStorage.getItem('rr_crm_cuadres_backup');
        if (cached && (!this._cuadres || this._cuadres.length === 0)) {
          this._cuadres = JSON.parse(cached);
        }
      } catch (_) {}

      // 2. Traer datos frescos de Firestore
      const cuadresSnap = await getDocs(collection(db, CUADRES_COLLECTION));
      if (!cuadresSnap.empty) {
        this._cuadres = cuadresSnap.docs.map(docSnap => {
          const d = docSnap.data();
          return {
            ...d,
            id: String(d.id || docSnap.id)
          };
        }).sort((a, b) => new Date(b.createdAt || b.fecha) - new Date(a.createdAt || a.fecha));

        try {
          localStorage.setItem('rr_crm_cuadres_backup', JSON.stringify(this._cuadres));
        } catch (_) {}
      }
      
      const salesSnap = await getDocs(collection(db, SALES_COLLECTION));
      this._sales = salesSnap.docs.map(doc => doc.data());
    } catch (e) {
      console.error("Error fetching data:", e);
    }
  },

  getCuadres: () => DataManager._cuadres,
  
  async saveCuadres(data) {
    const cleanList = (data || []).map(cleanCuadreForFirestore);
    // Update local cache immediately
    DataManager._cuadres = cleanList;
    try {
      localStorage.setItem('rr_crm_cuadres_backup', JSON.stringify(cleanList));
    } catch (_) {}

    // Persist all cuadres to Firestore using batch writes
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const cuadre of cleanList) {
        const ref = doc(db, CUADRES_COLLECTION, cuadre.id);
        batch.set(ref, cuadre);
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
    const clean = cleanCuadreForFirestore(cuadre);
    if (!clean) throw new Error("Datos de cuadre incompletos o inválidos");

    // 1. Actualización inmediata en caché de memoria para que la interfaz nunca se congele
    const idx = this._cuadres.findIndex(c => String(c.id) === String(clean.id));
    if (idx >= 0) {
      this._cuadres[idx] = clean;
    } else {
      this._cuadres.unshift(clean);
    }

    // 2. Respaldo local inmediato en localStorage
    try {
      localStorage.setItem('rr_crm_cuadres_backup', JSON.stringify(this._cuadres));
    } catch (_) {}

    // 3. Persistir en Firestore con timeout de seguridad (8 segundos)
    try {
      const docRef = doc(db, CUADRES_COLLECTION, clean.id);
      const setDocPromise = setDoc(docRef, clean);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_FIRESTORE')), 8000)
      );

      await Promise.race([setDocPromise, timeoutPromise]);
      return clean;
    } catch (e) {
      if (e.message === 'TIMEOUT_FIRESTORE') {
        console.warn("Firestore tardó más de 8s; los datos fueron asegurados localmente y se sincronizarán en segundo plano.");
        return clean;
      }
      console.error("Error al guardar cuadre en Firestore:", e);
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

  // Solo guarda las ventas NUEVAS en Firestore (sin reescribir las existentes).
  // Mucho más rápido para importaciones incrementales.
  async saveNewSales(newSalesOnly) {
    if (!newSalesOnly || newSalesOnly.length === 0) return;
    // Actualizar caché local con las nuevas ventas
    DataManager._sales = [...DataManager._sales, ...newSalesOnly];
    let batch = writeBatch(db);
    let count = 0;
    for (const sale of newSalesOnly) {
      if (!sale.id) continue;
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
    const idStr = String(id);
    this._cuadres = this._cuadres.filter(c => String(c.id) !== idStr);
    try {
      localStorage.setItem('rr_crm_cuadres_backup', JSON.stringify(this._cuadres));
    } catch (_) {}
    try {
      await deleteDoc(doc(db, CUADRES_COLLECTION, idStr));
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
