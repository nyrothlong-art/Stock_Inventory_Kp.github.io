(function () {
  const CFG_KEY = 'stock_app_firebase_cfg_v16';
  const ROOT = 'stock_inventory_standard_v16';
  const DEVICE_ID = 'dev_' + Math.random().toString(36).slice(2, 10);
  const COLS = {
    'stock_app_items_v16':          { node: 'items',         get: () => inventoryData,         set: v => { inventoryData = v; },         render: () => { applyFilters(); updateAnalyticsDashboard(); } },
    'stock_app_branches_v16':       { node: 'branches',      get: () => branchesData,          set: v => { branchesData = v; },          render: () => populateBranchDropdowns() },
    'stock_app_deliveries_v16':     { node: 'deliveries',    get: () => deliveryOptions,       set: v => { deliveryOptions = ensureCoreDeliveries(v); }, render: () => populateDeliveryDropdowns() },
    'stock_app_prov_companies_v16': { node: 'provCompanies', get: () => provinceCompanies,     set: v => { provinceCompanies = v; },     render: () => populateProvCompanyDropdowns() },
    'stock_app_province_v16':       { node: 'province',      get: () => provinceShipmentsData, set: v => { provinceShipmentsData = v; normalizeProvinceShipments(); }, render: () => { renderActiveProvinceDraft(); renderProvinceShipmentsTable(); } },
    'stock_app_telegram_v16':       { node: 'telegram',      get: () => telegramConfig,        set: v => { telegramConfig = v; },        render: () => renderTelegramSettingsUI() },
    'stock_app_returns_v16':        { node: 'returns',       get: () => returnsData,           set: v => { returnsData = v; },           render: () => renderReturnsTable() },
    'stock_app_cust_issues_v16':    { node: 'issues',        get: () => customerIssuesData,    set: v => { customerIssuesData = v; },    render: () => renderCustomerIssuesTable() },
    'stock_app_roles_v16':          { node: 'roles',         get: () => availableRoles,        set: v => { availableRoles = v; },        render: () => { renderRolesOptions(); renderRolesList(); } },
    'stock_app_users_v16':          { node: 'users',         get: () => registeredUsers,       set: v => { registeredUsers = v; },       render: () => { renderUsersTable(); renderPendingUsersTable(); } },
    'stock_app_config_v16':         { node: 'config',        get: () => systemConfig,          set: v => { systemConfig = v; },          render: () => applyBrandingUI() }
  };
  let db = null, rootRef = null, suppress = false;
  const ready = {};
  const origSet = Storage.prototype.setItem;

  function setStatus(online, msg) {
    document.querySelectorAll('.cloud-dot').forEach(el => el.className = 'cloud-dot w-2 h-2 rounded-full ' + (online ? 'bg-emerald-400' : 'bg-amber-400'));
    document.querySelectorAll('.cloud-text').forEach(el => el.textContent = msg);
  }
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === localStorage && !suppress && COLS[k] && rootRef && ready[k]) {
      rootRef.child(COLS[k].node).set({ d: v, by: DEVICE_ID, ts: firebase.database.ServerValue.TIMESTAMP });
    }
  };
  function startCloud() {
    const saved = localStorage.getItem(CFG_KEY);
    if (!saved) return setStatus(false, 'Cloud: មិនទាន់ភ្ជាប់');
    try {
      const cfg = JSON.parse(saved);
      firebase.initializeApp(cfg);
      db = firebase.database(); rootRef = db.ref(ROOT);
      firebase.auth().signInAnonymously().catch(() => {});
      db.ref('.info/connected').on('value', s => setStatus(!!s.val(), s.val() ? 'Cloud: Online ✓' : 'Cloud: Connecting...'));
      Object.keys(COLS).forEach(key => {
        const col = COLS[key];
        rootRef.child(col.node).on('value', snap => {
          const val = snap.val();
          if (!ready[key]) {
            ready[key] = true;
            if (!val || !val.d) { rootRef.child(col.node).set({ d: JSON.stringify(col.get()), by: DEVICE_ID }); return; }
          }
          if (val && val.d && val.by !== DEVICE_ID) {
            suppress = true; origSet.call(localStorage, key, val.d); suppress = false;
            col.set(JSON.parse(val.d)); col.render();
          }
        });
      });
    } catch (e) { setStatus(false, 'Cloud Error'); }
  }
  window.openCloudSetupModal = () => { document.getElementById('cloud-cfg-input').value = localStorage.getItem(CFG_KEY) || ''; document.getElementById('cloud-setup-modal').classList.remove('hidden'); };
  window.closeCloudSetupModal = () => document.getElementById('cloud-setup-modal').classList.add('hidden');
  window.saveCloudConfig = () => {
    try {
      let raw = document.getElementById('cloud-cfg-input').value.trim();
      raw = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const cfg = JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
      origSet.call(localStorage, CFG_KEY, JSON.stringify(cfg));
      showToast('បានរក្សាទុក Config! កំពុងផ្ទុកឡើង...', 'success');
      setTimeout(() => location.reload(), 600);
    } catch (e) { showToast('JSON မិនត្រឹមត្រូវទេ!', 'error'); }
  };
  window.disconnectCloud = () => { localStorage.removeItem(CFG_KEY); location.reload(); };
  window.forceUploadAllToCloud = () => {
    if (!rootRef) return showToast('សូមភ្ជាប់ Cloud ជាមុនសិន!', 'warning');
    Object.keys(COLS).forEach(k => rootRef.child(COLS[k].node).set({ d: JSON.stringify(COLS[k].get()), by: DEVICE_ID }));
    showToast('បាន Sync ទៅ Cloud ជោគជ័យ!', 'success');
  };
  window.addEventListener('DOMContentLoaded', startCloud);
})();
