
const DB_NAME = "HospitalBillingDB";
const DB_VERSION = 3;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("priceList")) {
        const s = db.createObjectStore("priceList", { keyPath: "id", autoIncrement: true });
        s.createIndex("category", "category");
      }
      if (!db.objectStoreNames.contains("doctors")) {
        db.createObjectStore("doctors", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("bills")) {
        const b = db.createObjectStore("bills", { keyPath: "id", autoIncrement: true });
        b.createIndex("billNo", "billNo", { unique: true });
        b.createIndex("doctorId", "doctorId");
        b.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("counters")) {
        db.createObjectStore("counters", { keyPath: "bsYear" });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("packages")) {
        db.createObjectStore("packages", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async getAll(store) {
    const s = await tx(store);
    return reqToPromise(s.getAll());
  },
  async get(store, key) {
    const s = await tx(store);
    return reqToPromise(s.get(key));
  },
  async add(store, value) {
    const s = await tx(store, "readwrite");
    return reqToPromise(s.add(value));
  },
  async put(store, value) {
    const s = await tx(store, "readwrite");
    return reqToPromise(s.put(value));
  },
  async delete(store, key) {
    const s = await tx(store, "readwrite");
    return reqToPromise(s.delete(key));
  },
  async clearStore(store) {
    const s = await tx(store, "readwrite");
    return reqToPromise(s.clear());
  },
  async getByIndex(store, indexName, value) {
    const s = await tx(store);
    return reqToPromise(s.index(indexName).get(value));
  },

  // Generate next bill number for the given BS year, atomically.
  async nextBillNo(bsYear) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("counters", "readwrite");
      const store = t.objectStore("counters");
      const getReq = store.get(bsYear);
      getReq.onsuccess = () => {
        const rec = getReq.result || { bsYear, lastNo: 0 };
        rec.lastNo += 1;
        store.put(rec);
        t.oncomplete = () => {
          const billNo = `${bsYear}HMS${String(rec.lastNo).padStart(3, "0")}`;
          resolve(billNo);
        };
        t.onerror = () => reject(t.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  // Wipe the entire database (used by Settings > Danger Zone).
  async destroyDatabase() {
    _dbPromise = null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  },
};

const DEFAULT_SETTINGS = {
  id: 1,
  hospitalName: "Sunrise Multispecialty Hospital",
  address: "Putalisadak, Kathmandu, Nepal",
  phone: "01-4123456",
  email: "info@sunrisehospital.com.np",
  pan: "600123456",
  logo: "",
  signatoryName: "Billing In-Charge",
  bsYear: 2083,
  footerNote: "Thank you for choosing us. This is a computer generated bill.",
  vatRate: 13,
  lastBackupAt: null,
};

const DEFAULT_DOCTORS = [
  { name: "Dr. Anup Shrestha", category: "OPD", department: "General Medicine", contact: "9800000001", commissionPercent: 0, active: true },
  { name: "Dr. Sabina Karki", category: "OPD", department: "Gynecology", contact: "9800000002", commissionPercent: 10, active: true },
  { name: "Dr. Rajesh Thapa", category: "Emergency", department: "Emergency Medicine", contact: "9800000003", commissionPercent: 0, active: true },
  { name: "Dr. Mina Gurung", category: "Physiotherapy", department: "Physiotherapy", contact: "9800000004", commissionPercent: 15, active: true },
];

const DEFAULT_CATEGORIES = ["OPD", "Physiotherapy", "Emergency", "Pharmacy"];

const DEFAULT_PRICE_LIST = [
  { name: "General OPD Consultation", category: "OPD", rate: 500, unit: "visit", active: true },
  { name: "Specialist Consultation", category: "OPD", rate: 1000, unit: "visit", active: true },
  { name: "X-Ray (Single View)", category: "OPD", rate: 1200, unit: "each", active: true },
  { name: "Blood Test - CBC", category: "OPD", rate: 600, unit: "test", active: true },
  { name: "Ultrasound", category: "OPD", rate: 1800, unit: "each", active: true },
  { name: "Physiotherapy Session", category: "Physiotherapy", rate: 800, unit: "session", active: true },
  { name: "Electrotherapy", category: "Physiotherapy", rate: 400, unit: "session", active: true },
  { name: "Emergency Registration", category: "Emergency", rate: 700, unit: "visit", active: true },
  { name: "Emergency Room Charge (per day)", category: "Emergency", rate: 2500, unit: "day", active: true },
  { name: "Ambulance Service", category: "Emergency", rate: 1500, unit: "trip", active: true },
  { name: "Paracetamol 500mg (strip)", category: "Pharmacy", rate: 40, unit: "strip", active: true },
  { name: "Amoxicillin 500mg (strip)", category: "Pharmacy", rate: 90, unit: "strip", active: true },
  { name: "IV Fluid Set", category: "Pharmacy", rate: 250, unit: "set", active: true },
];

// Sample bundled item packages — expanded into item rows when added to a bill.
// Item names must match DEFAULT_PRICE_LIST entries; new-bill.js re-resolves
// against the live price list by name at add-time so custom price lists still work.
const DEFAULT_PACKAGES = [
  {
    name: "Normal Delivery Package",
    category: "Emergency",
    items: [
      { name: "Emergency Registration", qty: 1 },
      { name: "Emergency Room Charge (per day)", qty: 2 },
      { name: "Blood Test - CBC", qty: 1 },
      { name: "IV Fluid Set", qty: 2 },
      { name: "Ultrasound", qty: 1 },
    ],
  },
  {
    name: "Basic Health Checkup",
    category: "OPD",
    items: [
      { name: "General OPD Consultation", qty: 1 },
      { name: "Blood Test - CBC", qty: 1 },
      { name: "X-Ray (Single View)", qty: 1 },
    ],
  },
];

// Seed sample data only if the relevant store is empty.
async function seedIfEmpty() {
  const settings = await DB.get("settings", 1);
  if (!settings) await DB.put("settings", DEFAULT_SETTINGS);

  const categories = await DB.getAll("categories");
  if (categories.length === 0) {
    for (const name of DEFAULT_CATEGORIES) await DB.add("categories", { name });
  }

  const doctors = await DB.getAll("doctors");
  if (doctors.length === 0) {
    for (const d of DEFAULT_DOCTORS) await DB.add("doctors", d);
  }

  const prices = await DB.getAll("priceList");
  if (prices.length === 0) {
    for (const p of DEFAULT_PRICE_LIST) await DB.add("priceList", p);
  }

  const packages = await DB.getAll("packages");
  if (packages.length === 0) {
    for (const pkg of DEFAULT_PACKAGES) await DB.add("packages", pkg);
  }
}
