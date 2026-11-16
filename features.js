let focusBarcodeMode = localStorage.getItem('app_focus_barcode') === 'true';
function h5opts() {
  const o = { experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
  if (focusBarcodeMode && window.Html5QrcodeSupportedFormats) {
    const F = Html5QrcodeSupportedFormats;
    o.formatsToSupport = [F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR];
  }
  return o;
}
function getQrbox() {
  return focusBarcodeMode
    ? (vw, vh) => ({ width: Math.min(340, Math.floor(vw * 0.92)), height: Math.min(100, Math.floor(vh * 0.4)) })
    : (vw, vh) => ({ width: Math.min(320, Math.floor(vw * 0.85)), height: Math.min(220, Math.floor(vh * 0.7)) });
}
function updateFocusBtns() {
  document.querySelectorAll('.focus-barcode-btn').forEach(b => {
    b.className = 'focus-barcode-btn px-2 py-1 rounded-xl text-[10px] font-bold border transition ' + (focusBarcodeMode ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-900/90 text-slate-300 border-slate-600');
    b.innerText = focusBarcodeMode ? '🎯 Focus: ON' : '🎯 Focus';
  });
}
function toggleFocusBarcode() {
  focusBarcodeMode = !focusBarcodeMode;
  localStorage.setItem('app_focus_barcode', focusBarcodeMode);
  updateFocusBtns();
  showToast(focusBarcodeMode ? 'Focus Barcode ON' : 'Focus Barcode OFF', 'info');
  const restart = scannerObj ? startScannerCamera : deliveryScannerObj ? startDeliveryScannerCamera : provinceScannerObj ? startProvinceScannerCamera : null;
  if (restart) { stopAllCamerasExcept('none'); setTimeout(restart, 500); }
}
function refocusCamera() {
  const inst = scannerObj || deliveryScannerObj || provinceScannerObj || auditScannerObj;
  if (!inst) return;
  inst.applyVideoConstraints({ advanced: [{ focusMode: 'single-shot' }] }).catch(() => {});
  setTimeout(() => inst.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 700);
}
['reader', 'delivery-reader', 'province-reader'].forEach(id => document.getElementById(id)?.addEventListener('click', refocusCamera));

function renderRolesList() {
  const box = document.getElementById('roles-list-badges'); if (!box) return;
  box.innerHTML = availableRoles.map((r, i) => `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-purple-300">${r}${CORE_ROLES.includes(r) ? '' : `<button onclick="deleteRole(${i})" class="text-rose-400 ml-1">✕</button>`}</span>`).join('');
}
function addRole() {
  const inp = document.getElementById('settings-new-role');
  const name = inp.value.trim().replace(/[<>"']/g, '');
  if (!name) return;
  if (availableRoles.some(r => r.toLowerCase() === name.toLowerCase())) return showToast('Role នេះមានរួចហើយ!', 'warning');
  availableRoles.push(name);
  localStorage.setItem('stock_app_roles_v16', JSON.stringify(availableRoles));
  renderRolesOptions(); renderRolesList(); inp.value = '';
  showToast(`បានបន្ថែម Role [${name}] ជោគជ័យ!`, 'success');
}
function deleteRole(i) {
  if (sessionUser?.role !== 'Admin' || CORE_ROLES.includes(availableRoles[i])) return;
  availableRoles.splice(i, 1);
  localStorage.setItem('stock_app_roles_v16', JSON.stringify(availableRoles));
  renderRolesOptions(); renderRolesList();
}

const I18N_EN = {"ស្កេនស្តុក": "Scan Stock", "កំណត់ត្រាស្តុក": "Stock Records", "ដឹកជញ្ជូន": "Delivery", "ផ្ញើតាមស្រុក": "Province", "រាប់ស្តុក": "Stock Count"};
let appLang = localStorage.getItem('app_lang') || 'km';
function toggleLang() {
  appLang = appLang === 'km' ? 'en' : 'km';
  localStorage.setItem('app_lang', appLang);
  document.getElementById('btn-lang-toggle').innerText = appLang === 'km' ? 'EN' : 'ខ្មែរ';
  document.documentElement.lang = appLang === 'km' ? 'km' : 'en';
}

window.addEventListener('DOMContentLoaded', () => {
  renderRolesList(); updateFocusBtns();
  const t = localStorage.getItem('app_active_tab');
  if (t && t !== 'scanner' && sessionUser && !(t === 'settings' && sessionUser.role !== 'Admin')) switchNavTab(t);
});
