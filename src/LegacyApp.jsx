function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Plus, Trash2, Save, ArrowLeft, TrendingUp, AlertCircle, Truck, DollarSign, Calendar, Search, BarChart3, LayoutDashboard, Wallet, X, Settings, Download, ClipboardList, ChevronDown, ChevronRight, Filter, PieChart, FileSpreadsheet, HardDrive, ShieldCheck, Banknote, Upload, Users, Briefcase, CheckCircle2, AlertTriangle, ClipboardCopy, BrainCircuit, Sparkles, Map, FileText, Percent, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

import { DataManager } from './DataManager';

// --- HELPERS ---
var formatCurrency = n => new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN'
}).format(n || 0);
var formatDate = d => {
  if (!d) return '';
  var [y, m, day] = d.split('-');
  return "".concat(day, "/").concat(m, "/").concat(y);
};
var normalize = str => str ? str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

// --- LÓGICA DE IMPORTACIÓN ---
var processImportData = (rows, onSuccess) => {
  if (!rows || rows.length === 0) return alert("Datos vacíos.");
  var findKey = (row, opts) => Object.keys(row).find(k => opts.some(opt => normalize(k).includes(normalize(opt))));
  var sample = rows[0];
  var kPlaca = findKey(sample, ['placa']);
  var kImporte = findKey(sample, ['importe', 'total', 'monto']);
  var kFecha = findKey(sample, ['fecha de facturacion', 'fecha', 'factura', 'emision']);
  var kCliente = findKey(sample, ['cliente', 'nombre']);
  var kVend = findKey(sample, ['vendedor']);
  var kGuia = findKey(sample, ['fórmula', 'formula', 'guia', 'guía', 'remision']);
  if (!kPlaca || !kImporte || !kFecha) return alert("Faltan columnas clave. Detectado: Placa, Importe, Fecha.");
  var parseDate = val => {
    if (!val) return null;
    if (typeof val === 'number') return new Date((val - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
    var s = String(val).trim();
    if (s.includes('/')) {
      var parts = s.split('/');
      if (parts.length === 3) return "".concat(parts[2], "-").concat(parts[1].padStart(2, '0'), "-").concat(parts[0].padStart(2, '0'));
    }
    if (s.includes('-')) return s.split('T')[0];
    return null;
  };
  var parseMoney = val => {
    if (typeof val === 'number') return val;
    return parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
  };
  var cleanRows = [];
  rows.forEach(r => {
    if (r[kPlaca] && r[kImporte]) {
      cleanRows.push({
        placa: String(r[kPlaca]).toUpperCase().replace(/\s/g, ''),
        importe: parseMoney(r[kImporte]),
        fechaVenta: parseDate(r[kFecha]),
        cliente: r[kCliente] || 'Desconocido',
        vendedor: r[kVend] || 'Desconocido',
        guia: kGuia ? String(r[kGuia]).trim() : ''
      });
    }
  });
  if (cleanRows.length === 0) return alert("No se encontraron filas válidas.");

  // 1. Guardar Ventas (con filtro de duplicados)
  var existingSales = DataManager.getSales();
  var newSales = cleanRows.filter(row => {
    // Si la venta ya existe (misma fecha, placa e importe), la ignoramos
    return !existingSales.some(s => s.fechaVenta === row.fechaVenta && s.placa === row.placa && s.importe === row.importe);
  });
  if (newSales.length > 0) {
    DataManager.saveSales([...existingSales, ...newSales]);
  }

  // 2. Agrupar Despachos
  var dispatches = {};
  cleanRows.forEach(row => {
    if (!row.fechaVenta) return;
    var saleDate = new Date(row.fechaVenta);
    saleDate.setMinutes(saleDate.getMinutes() + saleDate.getTimezoneOffset());
    var dispatchDate = new Date(saleDate);
    // Regla Sábado -> Lunes
    if (saleDate.getDay() === 6) dispatchDate.setDate(saleDate.getDate() + 2);else dispatchDate.setDate(saleDate.getDate() + 1);
    var dStr = dispatchDate.toISOString().split('T')[0];
    var key = "".concat(dStr, "_").concat(row.placa);
    if (!dispatches[key]) dispatches[key] = {
      fecha: dStr,
      placa: row.placa,
      total: 0,
      guides: []
    };
    dispatches[key].total += row.importe;
    if (row.guia) dispatches[key].guides.push(row.guia);
  });

  // 3. Actualizar DB
  var current = DataManager.getCuadres();
  var updated = 0,
    created = 0;
  Object.values(dispatches).forEach(d => {
    var newTotal = parseFloat(d.total.toFixed(2));
    var uniqueGuides = [...new Set(d.guides)].sort();
    var idx = current.findIndex(c => c.fecha === d.fecha && c.placa === d.placa);
    if (idx >= 0) {
      var existingRecord = current[idx];
      existingRecord.montoDespacho = newTotal;
      var existingGuides = existingRecord.guides || [];
      existingRecord.guides = [...new Set([...existingGuides, ...uniqueGuides])].sort();
      var recaudadoActual = (existingRecord.items || []).reduce((s, i) => s + (parseFloat(i.monto) || 0), 0);
      existingRecord.totalRecaudado = recaudadoActual;
      existingRecord.diferencia = recaudadoActual - newTotal;
      updated++;
    } else {
      current.unshift({
        id: Date.now() + Math.random(),
        fecha: d.fecha,
        placa: d.placa,
        montoDespacho: newTotal,
        totalRecaudado: 0,
        diferencia: -newTotal,
        items: [],
        isReviewed: false,
        createdAt: new Date(),
        guides: uniqueGuides
      });
      created++;
    }
  });
  DataManager.saveCuadres(current);
  onSuccess(created, updated);
};

// --- COMPONENTES UI ---
var KpiCard = _ref => {
  var {
    title,
    value,
    icon: Icon,
    color,
    trend
  } = _ref;
  return /*#__PURE__*/React.createElement("div", {
    className: "glass-effect p-6 rounded-3xl border border-white/40 shadow-sm hover-scale flex items-start justify-between relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-white/40 to-transparent rounded-full blur-2xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative z-10"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-xs font-bold uppercase mb-2 tracking-wider"
  }, title), /*#__PURE__*/React.createElement("h3", {
    className: "text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight"
  }, value), trend && /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 mt-3 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 w-fit border border-emerald-100/50 shadow-sm"
  }, /*#__PURE__*/React.createElement(TrendingUp, {
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, trend))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 rounded-2xl ".concat(color, " bg-opacity-20 text-").concat(color.split('-')[1], "-600 shadow-inner relative z-10 backdrop-blur-sm")
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 32
  })));
};

// --- DASHBOARD (SUMA GLOBAL CORREGIDA) ---
var Dashboard = _ref2 => {
  var {
    cuadres,
    setView,
    setActiveCuadreId,
    searchTerm
  } = _ref2;
  var stats = useMemo(() => {
    // Asegurar que sumamos números y no texto o nulos
    var rec = cuadres.reduce((acc, c) => acc + (parseFloat(c.totalRecaudado) || 0), 0);
    var meta = cuadres.reduce((acc, c) => acc + (parseFloat(c.montoDespacho) || 0), 0);

    // Sumar devoluciones item por item de TODOS los despachos
    var dev = cuadres.reduce((acc, c) => {
      var devolucionesDespacho = (c.items || []).filter(i => i.type === 'devolucion').reduce((sum, item) => sum + (parseFloat(item.monto) || 0), 0);
      return acc + devolucionesDespacho;
    }, 0);
    var eff = meta > 0 ? (meta - dev) / meta * 100 : 0;
    return {
      rec,
      meta,
      dev,
      eff
    };
  }, [cuadres]);
  var filtered = cuadres.filter(c => (c.placa || "").toLowerCase().includes(searchTerm.toLowerCase()) || (c.fecha || "").includes(searchTerm));
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-8 animate-slide-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-4 gap-6"
  }, /*#__PURE__*/React.createElement(KpiCard, {
    title: "Recaudo Global",
    value: formatCurrency(stats.rec),
    icon: DollarSign,
    color: "text-emerald-600 bg-emerald-100"
  }), /*#__PURE__*/React.createElement(KpiCard, {
    title: "Despacho Global",
    value: formatCurrency(stats.meta),
    icon: Truck,
    color: "text-blue-600 bg-blue-100"
  }), /*#__PURE__*/React.createElement(KpiCard, {
    title: "Total Devoluciones",
    value: formatCurrency(stats.dev),
    icon: AlertCircle,
    color: "text-orange-600 bg-orange-100"
  }), /*#__PURE__*/React.createElement(KpiCard, {
    title: "Efectividad Global",
    value: "".concat(stats.eff.toFixed(1), "%"),
    icon: TrendingUp,
    color: "text-purple-600 bg-purple-100"
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-5 border-b bg-white flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-lg flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Truck, {
    className: "text-blue-500",
    size: 20
  }), " Movimientos Recientes"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-slate-100 px-3 py-1 rounded-full border font-medium text-slate-600"
  }, filtered.length, " registros")), /*#__PURE__*/React.createElement("div", {
    className: "divide-y divide-slate-100 max-h-[500px] overflow-y-auto custom-scrollbar"
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "p-12 text-center text-slate-400"
  }, "Sin datos") : filtered.slice(0, 50).map(c => {
    var dif = (c.totalRecaudado || 0) - (c.montoDespacho || 0);
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      onClick: () => {
        setActiveCuadreId(c.id);
        setView('edit');
      },
      className: "p-4 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-all border-l-4 ".concat(c.isReviewed ? 'border-l-green-500 bg-green-50/20' : 'border-l-transparent')
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "p-3 rounded-xl ".concat(c.isReviewed ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600')
    }, c.isReviewed ? /*#__PURE__*/React.createElement(ShieldCheck, {
      size: 20
    }) : /*#__PURE__*/React.createElement(Truck, {
      size: 20
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      className: "font-bold text-slate-800 text-lg"
    }, c.placa), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 font-medium"
    }, formatDate(c.fecha)))), /*#__PURE__*/React.createElement("div", {
      className: "text-right"
    }, /*#__PURE__*/React.createElement("p", {
      className: "font-bold text-emerald-600 text-lg"
    }, formatCurrency(c.totalRecaudado)), /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-1 ".concat(Math.abs(dif) < 0.1 ? 'text-green-700 bg-green-100' : dif > 0 ? 'text-blue-700 bg-blue-100' : 'text-red-700 bg-red-100')
    }, Math.abs(dif) < 0.1 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(CheckCircle2, {
      size: 12
    }), " OK") : dif > 0 ? "+".concat(formatCurrency(dif)) : formatCurrency(dif))));
  }))));
};

// --- EDITOR ---
var Editor = _ref3 => {
  var {
    initial,
    setView,
    setCuadres,
    uniquePlates
  } = _ref3;
  var [form, setForm] = useState(initial || {
    fecha: new Date().toISOString().split('T')[0],
    placa: '',
    montoDespacho: 0,
    items: [],
    isReviewed: false
  });
  var [toast, setToast] = useState(null);
  var subtotals = useMemo(() => {
    var res = {
      efectivo: 0,
      yape: 0,
      devolucion: 0,
      descuento: 0
    };
    (form.items || []).forEach(i => {
      var m = parseFloat(i.monto) || 0;
      if (res[i.type] !== undefined) res[i.type] += m;
    });
    return res;
  }, [form.items]);
  var totals = useMemo(() => {
    var rec = (form.items || []).reduce((s, i) => s + (parseFloat(i.monto) || 0), 0);
    return {
      rec,
      dif: rec - (parseFloat(form.montoDespacho) || 0)
    };
  }, [form, subtotals]);
  var showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };
  var save = () => {
    if (!form.placa) return alert("Falta la placa");
    var itemsSafe = form.items || [];
    var allVerified = itemsSafe.length > 0 && itemsSafe.every(i => i.verified);
    var newState = _objectSpread(_objectSpread({}, form), {}, {
      items: itemsSafe,
      isReviewed: form.isReviewed || allVerified,
      totalRecaudado: totals.rec,
      diferencia: totals.dif
    });
    var all = DataManager.getCuadres();
    var idx = all.findIndex(x => x.id === form.id);
    if (idx >= 0) all[idx] = _objectSpread(_objectSpread({}, newState), {}, {
      updatedAt: new Date()
    });else all.unshift(_objectSpread(_objectSpread({}, newState), {}, {
      id: Date.now().toString(),
      createdAt: new Date()
    }));
    DataManager.saveCuadres(all);
    setCuadres(all);
    showToast("¡Guardado correctamente!");
    setTimeout(() => setView('dashboard'), 1000);
  };
  var del = () => {
    if (confirm("¿Eliminar?")) {
      var all = DataManager.deleteCuadre(form.id);
      setCuadres(all);
      setView('dashboard');
    }
  };
  var addItem = type => setForm(p => _objectSpread(_objectSpread({}, p), {}, {
    items: [...(p.items || []), {
      id: Date.now() + Math.random(),
      type,
      monto: '',
      descripcion: '',
      verified: false
    }]
  }));
  var updateItem = (id, k, v) => setForm(p => _objectSpread(_objectSpread({}, p), {}, {
    items: p.items.map(i => i.id === id ? _objectSpread(_objectSpread({}, i), {}, {
      [k]: v
    }) : i)
  }));
  var toggleVerify = id => setForm(p => _objectSpread(_objectSpread({}, p), {}, {
    items: p.items.map(i => i.id === id ? _objectSpread(_objectSpread({}, i), {}, {
      verified: !i.verified
    }) : i)
  }));
  var handleFocus = e => e.target.value === '0' && setForm(_objectSpread(_objectSpread({}, form), {}, {
    montoDespacho: ''
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow-xl flex flex-col overflow-hidden relative animate-slide-in"
  }, toast && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 20,
    className: "text-green-400"
  }), " ", toast), /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b flex justify-between items-center transition-colors ".concat(form.isReviewed ? 'bg-green-50' : 'bg-white')
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('dashboard')
  }, /*#__PURE__*/React.createElement(ArrowLeft, {
    className: "text-slate-600 hover:text-blue-600 transition-colors"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-slate-800 text-lg"
  }, form.id ? 'Editar Despacho' : 'Nuevo Despacho')), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setForm(p => _objectSpread(_objectSpread({}, p), {}, {
      isReviewed: !p.isReviewed
    })),
    className: "px-4 py-2 rounded-lg text-xs font-bold border transition-all flex gap-2 items-center ".concat(form.isReviewed ? 'bg-green-600 text-white border-green-600 shadow-md scale-105' : 'bg-white text-slate-500 border-slate-300 hover:border-blue-500 hover:text-blue-600')
  }, /*#__PURE__*/React.createElement(ShieldCheck, {
    size: 16
  }), " ", form.isReviewed ? 'VERIFICADO' : 'PENDIENTE'), form.id && /*#__PURE__*/React.createElement("button", {
    onClick: del,
    className: "p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
  }, /*#__PURE__*/React.createElement(Trash2, {
    size: 20
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 rounded-xl flex justify-between items-center shadow-sm border ".concat(Math.abs(totals.dif) < 0.1 ? 'bg-green-100 border-green-200 text-green-800' : totals.dif > 0 ? 'bg-blue-100 border-blue-200 text-blue-800' : 'bg-red-100 border-red-200 text-red-800')
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, Math.abs(totals.dif) < 0.1 ? /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 24
  }) : /*#__PURE__*/React.createElement(AlertTriangle, {
    size: 24
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold uppercase opacity-70"
  }, "Estado del Cuadre"), /*#__PURE__*/React.createElement("p", {
    className: "font-bold text-lg"
  }, Math.abs(totals.dif) < 0.1 ? 'CUADRADO PERFECTO' : totals.dif > 0 ? 'TIENE EXCEDENTE' : 'FALTANTE DE DINERO'))), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold uppercase opacity-70"
  }, "Diferencia"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black"
  }, totals.dif > 0 ? '+' : '', formatCurrency(totals.dif)))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border shadow-sm"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-slate-400 uppercase mb-1 block"
  }, "Fecha"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "w-full p-2 bg-slate-50 border-0 rounded-lg font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none",
    value: form.fecha,
    onChange: e => setForm(_objectSpread(_objectSpread({}, form), {}, {
      fecha: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border shadow-sm"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-slate-400 uppercase mb-1 block"
  }, "Placa"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    list: "plates",
    className: "w-full p-2 bg-slate-50 border-0 rounded-lg font-black text-slate-800 text-lg uppercase focus:ring-2 focus:ring-blue-500 outline-none",
    value: form.placa,
    onChange: e => setForm(_objectSpread(_objectSpread({}, form), {}, {
      placa: e.target.value.toUpperCase()
    })),
    placeholder: "ABC-123"
  }), /*#__PURE__*/React.createElement("datalist", {
    id: "plates"
  }, uniquePlates.map(p => /*#__PURE__*/React.createElement("option", {
    key: p,
    value: p
  })))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border shadow-sm ring-1 ring-blue-100"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-blue-500 uppercase mb-1 block"
  }, "Meta a Cobrar (S/)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "w-full p-2 bg-blue-50 border-0 rounded-lg text-2xl font-black text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none",
    value: form.montoDespacho,
    onFocus: handleFocus,
    onChange: e => setForm(_objectSpread(_objectSpread({}, form), {}, {
      montoDespacho: e.target.value
    })),
    placeholder: "0.00"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-4 gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 p-2 opacity-10"
  }, /*#__PURE__*/React.createElement(DollarSign, {
    size: 48,
    className: "text-emerald-600"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-emerald-600 font-bold uppercase flex items-center gap-1 mb-1"
  }, "Efectivo"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-emerald-900"
  }, formatCurrency(subtotals.efectivo))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border border-purple-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 p-2 opacity-10"
  }, /*#__PURE__*/React.createElement(Wallet, {
    size: 48,
    className: "text-purple-600"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-purple-600 font-bold uppercase flex items-center gap-1 mb-1"
  }, "Yape"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-purple-900"
  }, formatCurrency(subtotals.yape))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border border-orange-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 p-2 opacity-10"
  }, /*#__PURE__*/React.createElement(AlertCircle, {
    size: 48,
    className: "text-orange-600"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-orange-600 font-bold uppercase flex items-center gap-1 mb-1"
  }, "Devoluciones"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-orange-900"
  }, formatCurrency(subtotals.devolucion))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 p-2 opacity-10"
  }, /*#__PURE__*/React.createElement(TrendingUp, {
    size: 48,
    className: "text-slate-600"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 font-bold uppercase flex items-center gap-1 mb-1"
  }, "Descuentos"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-slate-700"
  }, formatCurrency(subtotals.descuento)))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3 pb-2 overflow-x-auto no-scrollbar"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => addItem('efectivo'),
    className: "flex-1 bg-white border border-emerald-200 text-emerald-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors shadow-sm"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16
  }), " Efectivo"), /*#__PURE__*/React.createElement("button", {
    onClick: () => addItem('yape'),
    className: "flex-1 bg-white border border-purple-200 text-purple-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-purple-50 transition-colors shadow-sm"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16
  }), " Yape"), /*#__PURE__*/React.createElement("button", {
    onClick: () => addItem('devolucion'),
    className: "flex-1 bg-white border border-orange-200 text-orange-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors shadow-sm"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16
  }), " Devoluci\xF3n"), /*#__PURE__*/React.createElement("button", {
    onClick: () => addItem('descuento'),
    className: "flex-1 bg-white border border-slate-200 text-slate-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors shadow-sm"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16
  }), " Descuento")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, (form.items || []).map(item => /*#__PURE__*/React.createElement("div", {
    key: item.id,
    className: "flex gap-3 items-center bg-white p-3 rounded-xl border shadow-sm transition-all animate-fade ".concat(item.verified ? 'border-green-300 ring-1 ring-green-100' : 'border-slate-100')
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: item.verified || false,
    onChange: () => toggleVerify(item.id),
    className: "custom-checkbox",
    title: "Verificar"
  }), /*#__PURE__*/React.createElement("div", {
    className: "w-1 h-10 rounded-full shrink-0 ".concat(item.type === 'efectivo' ? 'bg-emerald-500' : item.type === 'yape' ? 'bg-purple-500' : item.type === 'devolucion' ? 'bg-orange-500' : 'bg-slate-500')
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold uppercase text-slate-400 mb-0.5"
  }, item.type), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Descripci\xF3n...",
    className: "w-full text-sm bg-transparent outline-none font-medium text-slate-700 placeholder-slate-300",
    value: item.descripcion,
    onChange: e => updateItem(item.id, 'descripcion', e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("span", {
    className: "absolute left-2 top-2 text-xs text-slate-400 font-bold"
  }, "S/"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "0.00",
    className: "w-28 pl-6 pr-3 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-blue-500 outline-none",
    value: item.monto,
    onChange: e => updateItem(item.id, 'monto', e.target.value)
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setForm(p => _objectSpread(_objectSpread({}, p), {}, {
      items: p.items.filter(i => i.id !== item.id)
    })),
    className: "p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
  }, /*#__PURE__*/React.createElement(X, {
    size: 18
  })))), (form.items || []).length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300"
  }, "No hay registros a\xFAn. Agrega uno arriba.")))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-white border-t flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-slate-500 font-medium"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hidden md:inline"
  }, "Total Recaudado:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-slate-800 text-lg"
  }, formatCurrency(totals.rec))), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    className: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-transform"
  }, /*#__PURE__*/React.createElement(Save, {
    size: 20
  }), " Guardar Cambios")));
};

// --- IMPORTACIÓN Y PEGAR DATOS ---
var ExcelImporter = _ref4 => {
  var {
    onImportSuccess
  } = _ref4;
  var handleFileUpload = e => {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = evt => {
      try {
        var data = new Uint8Array(evt.target.result);
        var wb = XLSX.read(data, {
          type: 'array'
        });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var jsonData = XLSX.utils.sheet_to_json(ws);
        processImportData(jsonData, (c, u) => {
          alert("Excel Cargado:\nNuevos Despachos: ".concat(c, "\nActualizados (Meta): ").concat(u));
          onImportSuccess();
        });
      } catch (error) {
        alert("Error archivo");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "relative w-full group"
  }, /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx, .xls, .csv",
    onChange: handleFileUpload,
    className: "absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
  }), /*#__PURE__*/React.createElement("button", {
    className: "w-full text-left p-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-emerald-400 flex items-center gap-2 border border-emerald-900/30 group-hover:bg-slate-700 transition-colors"
  }, /*#__PURE__*/React.createElement(FileSpreadsheet, {
    size: 16
  }), " Cargar Excel Diario"));
};
var BulkImportView = _ref5 => {
  var {
    onImportSuccess
  } = _ref5;
  var [text, setText] = useState("");
  var handlePaste = () => {
    if (!text.trim()) return alert("Pega datos primero");
    var lines = text.trim().split('\n');
    if (lines.length < 2) return alert("Incluye encabezados");
    var headers = lines[0].split('\t').map(h => h.trim());
    var data = lines.slice(1).map(l => {
      var v = l.split('\t');
      var r = {};
      headers.forEach((h, i) => r[h] = v[i]);
      return r;
    });
    processImportData(data, (c, u) => {
      alert("Pegado Exitoso:\nNuevos: ".concat(c, "\nActualizados: ").concat(u));
      onImportSuccess();
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow p-6 h-full flex flex-col"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-lg mb-2 flex gap-2"
  }, /*#__PURE__*/React.createElement(ClipboardCopy, null), " Pegar Datos (Excel)"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500 mb-2"
  }, "Copia desde Excel (Ctrl+C) y pega aqu\xED (Ctrl+V). Incluye encabezados (Placa, Importe...)."), /*#__PURE__*/React.createElement("textarea", {
    value: text,
    onChange: e => setText(e.target.value),
    className: "flex-1 border p-2 text-xs font-mono mb-4 rounded",
    placeholder: "Placa\tImporte..."
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handlePaste,
    className: "bg-blue-600 text-white p-2 rounded font-bold"
  }, "Procesar"));
};

// --- NUEVO REPORTE: DESCUENTOS CON FILTRO PLACA ---
var DiscountsReport = () => {
  var [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  var [searchPlate, setSearchPlate] = useState('');
  var [data, setData] = useState([]);
  var [total, setTotal] = useState(0);
  useEffect(() => {
    var cuadres = DataManager.getCuadres();
    var filtered = cuadres.filter(c => (!dateRange.start || c.fecha >= dateRange.start) && (!dateRange.end || c.fecha <= dateRange.end) && (!searchPlate || (c.placa || '').toLowerCase().includes(searchPlate.toLowerCase())));
    var discountItems = [];
    var sum = 0;
    filtered.forEach(c => {
      (c.items || []).forEach(item => {
        if (item.type === 'descuento') {
          var monto = parseFloat(item.monto) || 0;
          discountItems.push({
            fecha: c.fecha,
            placa: c.placa,
            descripcion: item.descripcion || 'Sin descripción',
            monto
          });
          sum += monto;
        }
      });
    });
    discountItems.sort((a, b) => b.fecha.localeCompare(a.fecha));
    setData(discountItems);
    setTotal(sum);
  }, [dateRange, searchPlate]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-slate-800 flex gap-2 items-center"
  }, /*#__PURE__*/React.createElement(Percent, {
    size: 20,
    className: "text-pink-500"
  }), " Reporte de Descuentos"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 items-center bg-white border rounded-lg p-1 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center px-2 border-r"
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    className: "text-slate-400 mr-2"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "PLACA...",
    value: searchPlate,
    onChange: e => setSearchPlate(e.target.value.toUpperCase()),
    className: "text-xs outline-none w-20 font-bold text-slate-700"
  })), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400 px-1"
  }, "Filtro:"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "text-xs outline-none",
    value: dateRange.start,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      start: e.target.value
    }))
  }), " - ", /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "text-xs outline-none",
    value: dateRange.end,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      end: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm text-left border-collapse"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "text-xs text-slate-500 uppercase bg-slate-50 border-b"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3"
  }, "Fecha"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3"
  }, "Placa"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3"
  }, "Descripci\xF3n"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 text-right"
  }, "Monto"))), /*#__PURE__*/React.createElement("tbody", {
    className: "divide-y divide-slate-100"
  }, data.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "4",
    className: "py-8 text-center text-slate-400"
  }, "No hay descuentos registrados.")) : data.map((row, idx) => /*#__PURE__*/React.createElement("tr", {
    key: idx,
    className: "hover:bg-slate-50"
  }, /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 font-medium text-slate-600"
  }, formatDate(row.fecha)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 font-bold text-slate-800"
  }, row.placa), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 text-slate-600"
  }, row.descripcion), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 text-right font-bold text-gray-700"
  }, formatCurrency(row.monto))))), /*#__PURE__*/React.createElement("tfoot", {
    className: "bg-gray-50 border-t font-bold"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "3",
    className: "px-4 py-3 text-right text-slate-600"
  }, "TOTAL DESCUENTOS:"), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 text-right text-gray-800"
  }, formatCurrency(total)))))));
};

// --- REPORTE DE GUÍAS ---
var GuidesReport = () => {
  var [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  var [data, setData] = useState([]);
  useEffect(() => {
    var cuadres = DataManager.getCuadres();
    var filtered = cuadres.filter(c => (!dateRange.start || c.fecha >= dateRange.start) && (!dateRange.end || c.fecha <= dateRange.end));
    var report = filtered.map(c => {
      var guides = (c.guides || []).filter(g => g && g.trim() !== '').sort();
      return {
        fecha: c.fecha,
        placa: c.placa,
        count: guides.length,
        start: guides.length > 0 ? guides[0] : '-',
        end: guides.length > 0 ? guides[guides.length - 1] : '-'
      };
    }).sort((a, b) => b.fecha.localeCompare(a.fecha));
    setData(report);
  }, [dateRange]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-slate-800 flex gap-2 items-center"
  }, /*#__PURE__*/React.createElement(Map, {
    size: 20,
    className: "text-blue-600"
  }), " Control de Gu\xEDas"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 items-center bg-white border rounded p-1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400 px-1"
  }, "Filtro:"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "text-xs outline-none",
    value: dateRange.start,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      start: e.target.value
    }))
  }), " - ", /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: "text-xs outline-none",
    value: dateRange.end,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      end: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm text-left border-collapse"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "text-xs text-slate-500 uppercase bg-slate-50 border-b"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3"
  }, "Fecha"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3"
  }, "Placa"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 text-center"
  }, "Cant."), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 text-center"
  }, "Rango"))), /*#__PURE__*/React.createElement("tbody", {
    className: "divide-y divide-slate-100"
  }, data.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "4",
    className: "py-8 text-center text-slate-400"
  }, "Sin datos.")) : data.map((row, idx) => /*#__PURE__*/React.createElement("tr", {
    key: idx,
    className: "hover:bg-blue-50"
  }, /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 font-medium text-slate-600"
  }, formatDate(row.fecha)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 font-bold text-slate-800"
  }, row.placa), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 text-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold"
  }, row.count)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-3 text-center font-mono text-slate-600"
  }, row.start, " \u279C ", row.end)))))));
};

// --- RANKINGS, SUPERVISION, ETC (IGUAL QUE ANTES) ---
var RankingView = _ref6 => {
  var { type } = _ref6;
  var [data, setData] = useState([]);
  var [dateFrom, setDateFrom] = useState('');
  var [dateTo, setDateTo] = useState('');
  useEffect(() => {
    var raw = DataManager.getSales();
    var g = {};
    raw.forEach(r => {
      var fecha = r.fechaVenta || '';
      if (type === 'sellers') {
        if (dateFrom && fecha < dateFrom) return;
        if (dateTo && fecha > dateTo) return;
      }
      var k = type === 'clients' ? r.cliente : r.vendedor;
      if (!k) return;
      g[k] = (g[k] || 0) + (r.importe || 0);
    });
    setData(Object.entries(g).map(([n, t]) => ({ name: n, total: t })).sort((a, b) => b.total - a.total));
  }, [type, dateFrom, dateTo]);
  var max = data.length > 0 ? data[0].total : 1;
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border border-slate-200 flex flex-col overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement("div", { className: "flex items-center gap-2 font-bold text-slate-800" },
    type === 'clients' ? /*#__PURE__*/React.createElement(Users, { size: 20 }) : /*#__PURE__*/React.createElement(Briefcase, { size: 20 }),
    " Ranking ", type === 'clients' ? 'Clientes' : 'Vendedores'
  ),
  type === 'sellers' && /*#__PURE__*/React.createElement("div", { className: "flex items-center gap-2 ml-auto" },
    /*#__PURE__*/React.createElement("label", { className: "text-xs font-bold text-slate-500" }, "Desde"),
    /*#__PURE__*/React.createElement("input", {
      type: "date", value: dateFrom,
      onChange: e => setDateFrom(e.target.value),
      className: "border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-400"
    }),
    /*#__PURE__*/React.createElement("label", { className: "text-xs font-bold text-slate-500" }, "Hasta"),
    /*#__PURE__*/React.createElement("input", {
      type: "date", value: dateTo,
      onChange: e => setDateTo(e.target.value),
      className: "border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-400"
    }),
    (dateFrom || dateTo) && /*#__PURE__*/React.createElement("button", {
      onClick: () => { setDateFrom(''); setDateTo(''); },
      className: "text-xs text-slate-400 hover:text-red-500 font-bold"
    }, "✕ Limpiar")
  )), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-3"
  }, data.map((x, i) => /*#__PURE__*/React.createElement("div", { key: i },
    /*#__PURE__*/React.createElement("div", { className: "flex justify-between text-sm mb-1" },
      /*#__PURE__*/React.createElement("span", { className: "font-bold text-slate-400 w-6" }, "#", i + 1),
      /*#__PURE__*/React.createElement("span", { className: "flex-1 px-2" }, x.name),
      /*#__PURE__*/React.createElement("span", { className: "font-bold text-slate-800" }, formatCurrency(x.total))
    ),
    /*#__PURE__*/React.createElement("div", { className: "h-2 bg-slate-100 rounded-full overflow-hidden" },
      /*#__PURE__*/React.createElement("div", {
        className: "h-full rounded-full " + (type === 'clients' ? 'bg-blue-500' : 'bg-purple-500'),
        style: { width: (x.total / max * 100) + "%" }
      })
    )
  ))));
};
var SupervisionDashboard = _ref8 => {
  var {
    cuadres,
    setActiveCuadreId,
    setView
  } = _ref8;
  var [tab, setTab] = useState('pending');
  var filtered = useMemo(() => tab === 'reviewed' ? cuadres.filter(c => c.isReviewed) : cuadres.filter(c => !c.isReviewed), [cuadres, tab]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab('pending'),
    className: "flex-1 py-1 rounded text-sm font-bold ".concat(tab === 'pending' ? 'bg-white shadow text-blue-600' : 'text-slate-500')
  }, "Pendientes"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab('reviewed'),
    className: "flex-1 py-1 rounded text-sm font-bold ".concat(tab === 'reviewed' ? 'bg-white shadow text-green-600' : 'text-slate-500')
  }, "Revisados")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-3 space-y-2"
  }, filtered.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    onClick: () => {
      setActiveCuadreId(c.id);
      setView('edit');
    },
    className: "p-3 border rounded-xl hover:shadow cursor-pointer bg-white"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between font-bold text-slate-700"
  }, /*#__PURE__*/React.createElement("span", null, c.placa), /*#__PURE__*/React.createElement("span", null, formatDate(c.fecha))), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm text-slate-500 mt-1"
  }, /*#__PURE__*/React.createElement("span", null, c.items.length || 0, " items"), /*#__PURE__*/React.createElement("span", {
    className: c.diferencia < -0.1 ? 'text-red-500 font-bold' : 'text-green-600'
  }, formatCurrency(c.diferencia)))))));
};
var DailySummaryReport = _ref9 => {
  var {
    cuadres
  } = _ref9;
  var [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  var summary = useMemo(() => {
    var day = cuadres.filter(c => c.fecha === date);
    var meta = 0,
      efec = 0,
      yape = 0,
      dev = 0,
      desc = 0;
    day.forEach(c => {
      meta += c.montoDespacho || 0;
      (c.items || []).forEach(i => {
        var v = parseFloat(i.monto) || 0;
        if (i.type === 'efectivo') efec += v;
        if (i.type === 'yape') yape += v;
        if (i.type === 'devolucion') dev += v;
        if (i.type === 'descuento') desc += v;
      });
    });
    return {
      meta,
      efec,
      yape,
      dev,
      desc,
      rec: efec + yape + dev + desc,
      list: day.map(d => ({
        placa: d.placa,
        monto: d.montoDespacho,
        rec: d.totalRecaudado,
        dif: d.diferencia
      })).sort((a, b) => b.monto - a.monto)
    };
  }, [cuadres, date]);

  // Cálcula el "Cierre Global del Día" (Total Recaudado - Total Meta)
  var cierreGlobal = summary.rec - summary.meta;
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-bold"
  }, "Resumen D\xEDa"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: date,
    onChange: e => setDate(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 font-bold"
  }, "Total Programado"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-black text-slate-800"
  }, formatCurrency(summary.meta)), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ".concat(Math.abs(cierreGlobal) < 1 ? 'bg-green-100 text-green-700 border-green-200' : cierreGlobal > 0 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-red-100 text-red-700 border-red-200')
  }, Math.abs(cierreGlobal) < 1 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 16,
    className: "mr-1"
  }), " CIERRE PERFECTO") : cierreGlobal > 0 ? "EXCEDENTE: +".concat(formatCurrency(cierreGlobal)) : "FALTANTE: ".concat(formatCurrency(cierreGlobal)))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-emerald-50 rounded-xl border border-emerald-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-emerald-800"
  }, "Efectivo"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-bold text-emerald-600"
  }, formatCurrency(summary.efec))), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-purple-50 rounded-xl border border-purple-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-purple-800"
  }, "Yape"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-bold text-purple-600"
  }, formatCurrency(summary.yape))), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-orange-50 rounded-xl border border-orange-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-orange-800"
  }, "Devoluciones"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-bold text-orange-600"
  }, formatCurrency(summary.dev))), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-gray-50 rounded-xl border border-gray-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-gray-800"
  }, "Descuentos"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-bold text-gray-600"
  }, formatCurrency(summary.desc)))), /*#__PURE__*/React.createElement("div", {
    className: "border-t pt-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-sm text-slate-600 mb-3 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Truck, {
    size: 16
  }), " Detalle por Placa"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, summary.list.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "flex justify-between items-center p-3 border rounded-lg bg-white hover:shadow-sm transition-shadow"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-slate-800 block"
  }, l.placa), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400"
  }, "Meta: ", formatCurrency(l.monto), " | Rec: ", formatCurrency(l.rec))), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-bold text-slate-500 block"
  }, "Diferencia"), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-sm ".concat(Math.abs(l.dif) < 0.1 ? 'text-slate-400' : l.dif > 0 ? 'text-green-600' : 'text-red-500')
  }, Math.abs(l.dif) < 0.1 ? 'OK (0.00)' : l.dif > 0 ? "+".concat(formatCurrency(l.dif)) : formatCurrency(l.dif)))))))));
};
var SurplusReport = _ref0 => {
  var {
    cuadres,
    setActiveCuadreId,
    setView
  } = _ref0;
  var surplus = useMemo(() => {
    var list = cuadres.filter(c => c.totalRecaudado - c.montoDespacho > 0.1);
    return {
      list,
      total: list.reduce((a, b) => a + (b.totalRecaudado - b.montoDespacho), 0)
    };
  }, [cuadres]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-slate-800 flex gap-2"
  }, /*#__PURE__*/React.createElement(Banknote, {
    size: 20,
    className: "text-green-600"
  }), " Excedentes"), /*#__PURE__*/React.createElement("span", {
    className: "bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold"
  }, "Total: ", formatCurrency(surplus.total))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-2"
  }, surplus.list.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    onClick: () => {
      setActiveCuadreId(c.id);
      setView('edit');
    },
    className: "p-3 border rounded hover:bg-green-50 cursor-pointer flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-bold"
  }, c.placa, " (", formatDate(c.fecha), ")"), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-green-600"
  }, "+", formatCurrency(c.totalRecaudado - c.montoDespacho))))));
};

// CORRECCIÓN EFECTIVIDAD Y MONTO DEVOLUCIONES
var Analytics = _ref1 => {
  var {
    cuadres
  } = _ref1;
  var [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  var data = useMemo(() => {
    var filtered = cuadres.filter(c => (!dateRange.start || c.fecha >= dateRange.start) && (!dateRange.end || c.fecha <= dateRange.end));
    var s = {};
    var max = 0;
    filtered.forEach(c => {
      var ret = (c.items || []).filter(i => i.type === 'devolucion').reduce((a, b) => a + (parseFloat(b.monto) || 0), 0);
      var desp = c.montoDespacho || 0;

      // Asegurar inicialización
      if (!s[c.placa]) s[c.placa] = {
        r: 0,
        d: 0
      };

      // Sumar siempre, no solo si > 0 (para que aparezca en el reporte aunque sea 0 devoluciones)
      s[c.placa].r += ret;
      s[c.placa].d += desp;
    });

    // Calcular efectividad: (Despachado - Devuelto) / Despachado
    var list = Object.entries(s).filter(_ref10 => {
      var [k, v] = _ref10;
      return v.d > 0;
    }) // Solo mostrar si hubo despacho
    .map(_ref11 => {
      var [k, v] = _ref11;
      return {
        p: k,
        r: v.r,
        // Monto devuelto
        d: v.d,
        // Monto despachado
        eff: (v.d - v.r) / v.d * 100
      };
    }).sort((a, b) => b.r - a.r); // Ordenar por mayor devolución

    if (list.length > 0) max = list[0].r;
    return {
      list,
      max
    };
  }, [cuadres, dateRange]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-slate-800 flex gap-2"
  }, /*#__PURE__*/React.createElement(BarChart3, {
    size: 20,
    className: "text-orange-500"
  }), " Devoluciones y Efectividad"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: dateRange.start,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      start: e.target.value
    })),
    className: "border rounded px-1 text-xs"
  }), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: dateRange.end,
    onChange: e => setDateRange(_objectSpread(_objectSpread({}, dateRange), {}, {
      end: e.target.value
    })),
    className: "border rounded px-1 text-xs"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-4"
  }, data.list.map((x, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm mb-1 items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-bold w-6 text-slate-400"
  }, "#", i + 1), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-slate-800"
  }, x.p)), /*#__PURE__*/React.createElement("div", {
    className: "text-xs px-2 py-0.5 rounded font-bold ".concat(x.eff >= 95 ? 'bg-green-100 text-green-700' : x.eff >= 85 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')
  }, x.eff.toFixed(1), "% Efec.")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-xs text-slate-500 mb-1"
  }, /*#__PURE__*/React.createElement("span", null, "Devuelto: ", /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-orange-600"
  }, formatCurrency(x.r))), /*#__PURE__*/React.createElement("span", null, "Total: ", formatCurrency(x.d))), /*#__PURE__*/React.createElement("div", {
className: "h-2 bg-slate-100 rounded overflow-hidden relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 h-full bg-orange-500",
    style: {
      width: "".concat(Math.min(x.r / x.d * 100, 100), "%")
    }
  }))))));
};
var CalendarSubView = ({ cuadres, setActiveCuadreId, setView }) => {
  var [currentMonth, setCurrentMonth] = useState(new Date());
  var [selectedDay, setSelectedDay] = useState(null);
  var [selectedDayCuadres, setSelectedDayCuadres] = useState([]);

  var getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  var getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  var year = currentMonth.getFullYear();
  var month = currentMonth.getMonth();
  var daysInMonth = getDaysInMonth(year, month);
  var firstDay = getFirstDayOfMonth(year, month);
  var days = [];

  var cuadresByDay = {};
  cuadres.forEach(c => {
    if (!c.fecha) return;
    if (!cuadresByDay[c.fecha]) cuadresByDay[c.fecha] = [];
    cuadresByDay[c.fecha].push(c);
  });

  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

  var monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  var prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  var openDay = (ds, dcs) => { setSelectedDay(ds); setSelectedDayCuadres(dcs); };
  var closeModal = () => setSelectedDay(null);

  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white h-full rounded-2xl shadow border overflow-hidden flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b flex justify-between items-center bg-slate-50"
  }, /*#__PURE__*/React.createElement("button", { onClick: prevMonth, className: "p-2 hover:bg-slate-200 rounded-lg transition-colors" },
    /*#__PURE__*/React.createElement(ChevronDown, { className: "rotate-90", size: 20 })
  ), /*#__PURE__*/React.createElement("h2", { className: "font-bold text-lg text-slate-800" }, monthNames[month], " ", year),
  /*#__PURE__*/React.createElement("button", { onClick: nextMonth, className: "p-2 hover:bg-slate-200 rounded-lg transition-colors" },
    /*#__PURE__*/React.createElement(ChevronDown, { className: "-rotate-90", size: 20 })
  )), /*#__PURE__*/React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
    /*#__PURE__*/React.createElement("div", { className: "grid grid-cols-7 gap-1" },
      ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => /*#__PURE__*/React.createElement("div", {
        key: d, className: "text-center font-bold text-slate-400 text-xs uppercase py-2"
      }, d)),
      days.map((d, i) => {
        if (!d) return /*#__PURE__*/React.createElement("div", { key: i, className: "min-h-[72px] bg-slate-50 rounded-xl" });
        var mStr = String(month + 1).padStart(2, '0');
        var dStr = String(d.getDate()).padStart(2, '0');
        var ds = year + "-" + mStr + "-" + dStr;
        var dcs = cuadresByDay[ds] || [];
        var hasData = dcs.length > 0;
        var allOk = hasData && dcs.every(c => (c.totalRecaudado || 0) >= (c.montoDespacho || 0) - 0.1);
        var hasPending = hasData && dcs.some(c => (c.totalRecaudado || 0) < (c.montoDespacho || 0) - 0.1);
        var isToday = new Date().toISOString().slice(0, 10) === ds;
        return /*#__PURE__*/React.createElement("div", {
          key: i,
          onClick: hasData ? () => openDay(ds, dcs) : undefined,
          className: "min-h-[72px] border rounded-xl p-2 flex flex-col items-center gap-1 bg-white " +
            (hasData ? "cursor-pointer hover:bg-blue-50 border-slate-200" : "border-slate-100") +
            (isToday ? " ring-2 ring-blue-400" : "")
        }, /*#__PURE__*/React.createElement("span", {
          className: "text-sm font-bold " + (isToday ? "text-blue-600" : "text-slate-600")
        }, d.getDate()),
        hasData && /*#__PURE__*/React.createElement("div", { className: "flex gap-1" },
          hasPending && /*#__PURE__*/React.createElement("span", { className: "w-2.5 h-2.5 rounded-full bg-red-400" }),
          allOk && /*#__PURE__*/React.createElement("span", { className: "w-2.5 h-2.5 rounded-full bg-emerald-400" })
        ),
        hasData && /*#__PURE__*/React.createElement("span", { className: "text-[9px] text-slate-400 font-semibold" }, dcs.length, " desp."));
      })
    )
  ), selectedDay && /*#__PURE__*/React.createElement("div", {
    onClick: closeModal,
    className: "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b bg-slate-50 flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", { className: "font-bold text-slate-800 flex items-center gap-2" },
    /*#__PURE__*/React.createElement(Calendar, { size: 18, className: "text-blue-500" }),
    "Despachos — ", formatDate(selectedDay)
  ), /*#__PURE__*/React.createElement("button", {
    onClick: closeModal, className: "p-1 hover:bg-slate-200 rounded-lg text-slate-500 font-bold transition-colors text-lg leading-none"
  }, "✕")), /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-2 max-h-[60vh] overflow-y-auto"
  }, selectedDayCuadres.map(c => {
    var ok = (c.totalRecaudado || 0) >= (c.montoDespacho || 0) - 0.1;
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      onClick: () => { setActiveCuadreId(c.id); setView('edit'); closeModal(); },
      className: "flex items-center justify-between p-3 rounded-xl border cursor-pointer " +
        (ok ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100" : "border-red-200 bg-red-50 hover:bg-red-100")
    }, /*#__PURE__*/React.createElement("div", { className: "flex items-center gap-3" },
      /*#__PURE__*/React.createElement("span", {
        className: "px-2 py-1 rounded-lg text-xs font-mono font-bold " + (ok ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800")
      }, c.placa),
      /*#__PURE__*/React.createElement("div", null,
        /*#__PURE__*/React.createElement("p", { className: "text-xs text-slate-500" }, "Despacho: ", /*#__PURE__*/React.createElement("span", { className: "font-bold text-slate-700" }, formatCurrency(c.montoDespacho))),
        /*#__PURE__*/React.createElement("p", { className: "text-xs text-slate-500" }, "Recaudado: ", /*#__PURE__*/React.createElement("span", { className: "font-bold " + (ok ? "text-emerald-700" : "text-red-700") }, formatCurrency(c.totalRecaudado)))
      )
    ), /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold px-2 py-1 rounded-full " + (ok ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800")
    }, ok ? "✓ Cuadrado" : "✗ Pendiente"));
  })))));
};

var ClientListSubView = () => {
  var [sales, setSales] = useState([]);
  var [filterPlaca, setFilterPlaca] = useState('');
  var [filterDate, setFilterDate] = useState('');
  useEffect(() => {
    setSales(DataManager.getSales() || []);
  }, []);
  var uniquePlates = useMemo(() => {
    return [...new Set(sales.map(s => s.placa).filter(Boolean))].sort();
  }, [sales]);
  var filteredSales = useMemo(() => {
    return sales.filter(s => {
      var matchP = !filterPlaca || s.placa === filterPlaca;
      var matchD = !filterDate || s.fechaVenta === filterDate;
      return matchP && matchD;
    });
  }, [sales, filterPlaca, filterDate]);
  var totalImporte = filteredSales.reduce((acc, s) => acc + (s.importe || 0), 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-bold text-slate-500 mb-1"
  }, "Buscar Placa"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-2.5 text-slate-400",
    size: 16
  }), /*#__PURE__*/React.createElement("select", {
    value: filterPlaca,
    onChange: e => setFilterPlaca(e.target.value),
    className: "pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm appearance-none"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Todas las placas"), uniquePlates.map(p => /*#__PURE__*/React.createElement("option", {
    key: p,
    value: p
  }, p))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-bold text-slate-500 mb-1"
  }, "Fecha Despacho"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: filterDate,
    onChange: e => setFilterDate(e.target.value),
    className: "px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ml-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-xl shadow-lg shadow-blue-500/30 flex flex-col items-end"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] uppercase font-bold text-blue-200 tracking-wider"
  }, "Total Importe"), /*#__PURE__*/React.createElement("span", {
    className: "font-bold font-mono"
  }, formatCurrency(totalImporte)))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow border border-slate-200 overflow-hidden flex-1 flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto flex-1 custom-scrollbar"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-left"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200 w-10 text-center"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200"
  }, "Cliente"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200"
  }, "Vendedor"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200"
  }, "Placa"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200"
  }, "F. Despacho"), /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-3 border-b border-slate-200 text-right"
  }, "Importe"))), /*#__PURE__*/React.createElement("tbody", {
    className: "divide-y divide-slate-100 text-xs"
  }, filteredSales.map((row, idx) => /*#__PURE__*/React.createElement("tr", {
    key: idx,
    className: "hover:bg-slate-50 transition-colors group"
  }, /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 font-mono text-slate-400 text-center"
  }, idx + 1), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 font-medium text-slate-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "break-words"
  }, row.cliente)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 text-slate-500"
  }, /*#__PURE__*/React.createElement("div", {
    className: "break-words"
  }, row.vendedor)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-1 rounded text-[10px] font-mono font-bold bg-white text-indigo-700 border border-indigo-200 shadow-sm"
  }, row.placa)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 text-slate-600 font-medium"
  }, formatDate(row.fechaVenta)), /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 text-right font-mono font-bold text-slate-700 group-hover:text-indigo-700"
  }, formatCurrency(row.importe)))), filteredSales.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "6",
    className: "text-center py-10 text-slate-400"
  }, /*#__PURE__*/React.createElement(Users, {
    size: 32,
    className: "mx-auto mb-2 opacity-20"
  }), "No hay registros para mostrar")))))));
};

var HistorialPlacasView = _ref12 => {
  var {
    cuadres,
    setActiveCuadreId,
    setView
  } = _ref12;
  var [subView, setSubView] = useState('calendar');
  return /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4 p-1 bg-slate-100 rounded-xl max-w-sm w-full mx-auto shadow-inner"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSubView('calendar'),
    className: "flex-1 py-2 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ".concat(subView === 'calendar' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700')
  }, /*#__PURE__*/React.createElement(Calendar, {
    size: 18
  }), " Calendario"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSubView('clients'),
    className: "flex-1 py-2 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ".concat(subView === 'clients' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700')
  }, /*#__PURE__*/React.createElement(Users, {
    size: 18
  }), " Clientes")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-hidden"
  }, subView === 'calendar' && /*#__PURE__*/React.createElement(CalendarSubView, {
    cuadres: cuadres,
    setActiveCuadreId: setActiveCuadreId,
    setView: setView
  }), subView === 'clients' && /*#__PURE__*/React.createElement(ClientListSubView, null)));
};

// --- APP PRINCIPAL ---
export default function MainApp() {
  var [view, setView] = useState('dashboard');
  var [cuadres, setCuadres] = useState([]);
  var [activeCuadreId, setActiveCuadreId] = useState(null);
  var [searchTerm, setSearchTerm] = useState('');
  var [loading, setLoading] = useState(true);

  useEffect(() => {
    DataManager.fetchAll().then(() => {
      setCuadres(DataManager.getCuadres());
      setLoading(false);
    });
  }, []);

  var uniquePlates = useMemo(() => Array.from(new Set(cuadres.map(c => c.placa).filter(Boolean))).sort(), [cuadres]);

  if (loading) return /*#__PURE__*/React.createElement("div", {
    className: "flex h-screen items-center justify-center font-bold text-2xl"
  }, "Cargando...");

  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-screen overflow-hidden bg-slate-100/50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hidden md:flex w-64 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 flex-col p-4 overflow-y-auto border-r border-slate-800 shadow-2xl z-20 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-white font-bold text-xl mb-6 p-2"
  }, /*#__PURE__*/React.createElement(Truck, {
    className: "text-blue-500"
  }), " R&R Final UX"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1 flex-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('dashboard'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'dashboard' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(LayoutDashboard, {
    size: 20
  }), " Dashboard"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setActiveCuadreId(null);
      setView('create');
    },
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'create' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 20
  }), " Nuevo Despacho"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('import'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'import' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800 text-emerald-400')
  }, /*#__PURE__*/React.createElement(ClipboardCopy, {
    size: 20
  }), " Pegar Excel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('supervision'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'supervision' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(ShieldCheck, {
    size: 20
  }), " Supervisi\xF3n"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('daily'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'daily' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Calendar, {
    size: 20
  }), " Resumen Diario"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('hist_placa'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'hist_placa' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Truck, {
    size: 20
  }), " Historial Placas"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('guides_report'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'guides_report' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800 text-yellow-400')
  }, /*#__PURE__*/React.createElement(Map, {
    size: 20
  }), " Control Gu\xEDas"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('excedentes'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'excedentes' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Banknote, {
    size: 20
  }), " Reporte Excedentes"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('devoluciones'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'devoluciones' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    size: 20
  }), " Reporte Devoluciones"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('discounts'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'discounts' ? 'bg-pink-600 text-white font-bold' : 'hover:bg-slate-800 text-pink-400')
  }, /*#__PURE__*/React.createElement(Percent, {
    size: 20
  }), " Reporte Descuentos"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('clients'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'clients' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Users, {
    size: 20
  }), " Ranking Clientes"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView('sellers'),
    className: "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ".concat(view === 'sellers' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800')
  }, /*#__PURE__*/React.createElement(Briefcase, {
    size: 20
  }), " Ranking Vendedores")), /*#__PURE__*/React.createElement("div", {
    className: "pt-4 border-t border-slate-800 space-y-2 mt-4"
  }, /*#__PURE__*/React.createElement(ExcelImporter, {
    onImportSuccess: () => {
      setCuadres(DataManager.getCuadres());
      setView('dashboard');
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: DataManager.backup,
    className: "w-full text-left p-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-400 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Download, {
    size: 16
  }), " Exportar Backup JSON"), /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      if(!window.confirm("¿Seguro que deseas migrar los datos del backup histórico a Firebase?")) return;
      try {
        const res = await fetch('/backup.json');
        const data = await res.json();
        await DataManager.migrateData(data.cuadres || [], data.sales || []);
      } catch(e) {
        alert("Error cargando backup.json: " + e.message);
      }
    },
    className: "w-full text-left p-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-purple-400 flex items-center gap-2 mt-2"
  }, /*#__PURE__*/React.createElement(Upload, {
    size: 16
  }), " Migrar Backup a Firebase"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex flex-col bg-slate-100 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 flex items-center justify-between border-b shadow-sm z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 max-w-md relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-2.5 text-slate-400",
    size: 20
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Buscar placa...",
    className: "w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium",
    value: searchTerm,
    onChange: e => setSearchTerm(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setActiveCuadreId(null);
      setView('create');
    },
    className: "bg-blue-600 hover:bg-blue-700 text-white p-2 md:px-4 md:py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 20
  }), /*#__PURE__*/React.createElement("span", {
    className: "hidden md:inline"
  }, "Nuevo Despacho")), /*#__PURE__*/React.createElement("div", {
    className: "w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden"
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    alt: "User",
    className: "w-full h-full object-cover"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-hidden p-6"
  }, view === 'dashboard' && /*#__PURE__*/React.createElement(Dashboard, {
    cuadres: cuadres,
    setView: setView,
    setActiveCuadreId: setActiveCuadreId,
    searchTerm: searchTerm
  }), (view === 'create' || view === 'edit') && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(Editor, {
    initial: view === 'edit' ? cuadres.find(c => c.id === activeCuadreId) : null,
    setView: setView,
    setCuadres: setCuadres,
    uniquePlates: uniquePlates
  })), view === 'import' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(BulkImportView, {
    onImportSuccess: () => {
      setCuadres(DataManager.getCuadres());
      setView('dashboard');
    }
  })), view === 'supervision' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(SupervisionDashboard, {
    cuadres: cuadres,
    setActiveCuadreId: setActiveCuadreId,
    setView: setView
  })), view === 'daily' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(DailySummaryReport, {
    cuadres: cuadres
  })), view === 'hist_placa' && /*#__PURE__*/React.createElement("div", {
    className: "h-full"
  }, /*#__PURE__*/React.createElement(HistorialPlacasView, {
    cuadres: cuadres,
    setActiveCuadreId: setActiveCuadreId,
    setView: setView
  })), view === 'excedentes' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(SurplusReport, {
    cuadres: cuadres,
    setActiveCuadreId: setActiveCuadreId,
    setView: setView
  })), view === 'devoluciones' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(Analytics, {
    cuadres: cuadres
  })), view === 'discounts' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(DiscountsReport, null)), view === 'clients' && /*#__PURE__*/React.createElement("div", {
    className: "h-full"
  }, /*#__PURE__*/React.createElement(RankingView, {
    type: "clients"
  })), view === 'sellers' && /*#__PURE__*/React.createElement("div", {
    className: "h-full"
  }, /*#__PURE__*/React.createElement(RankingView, {
    type: "sellers"
  })), view === 'guides_report' && /*#__PURE__*/React.createElement("div", {
    className: "h-full max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(GuidesReport, null)))));
};
