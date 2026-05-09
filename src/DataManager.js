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
    // For single updates, it's better to update just the changed doc, 
    // but to keep compatibility with the old `saveCuadres(all)`, 
    // we assume we just update the ones that changed or we do a batch.
    // Actually, let's rewrite the logic where it's used so we don't save ALL cuadres every time.
    // But for now, we can just find the difference or rely on the components calling saveCuadre(single)
    DataManager._cuadres = data;
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
    // To save an array of sales, we use a batch
    const batch = writeBatch(db);
    data.forEach(sale => {
      const saleRef = doc(db, SALES_COLLECTION, sale.id || Date.now() + Math.random().toString());
      batch.set(saleRef, sale);
    });
    await batch.commit();
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
