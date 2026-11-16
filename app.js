    let appTheme = localStorage.getItem('app_theme_pref') || 'dark';
    let sessionUser = JSON.parse(sessionStorage.getItem('active_session_user') || 'null');
    let voiceAlertEnabled = localStorage.getItem('app_voice_alert') !== 'false';

    let scannerMode = 'IN';
    let deliverySubTab = 'dispatch';
    let scannerObj = null, evidenceScannerObj = null, auditScannerObj = null, deliveryScannerObj = null, provinceScannerObj = null;
    let torchStates = { main: false, delivery: false, province: false, audit: false };
    let currentZoomLevels = { main: 2.0, delivery: 2.0, province: 2.0, audit: 2.0 }; // Default Auto-Zoom ~2.0x
    let lastFrameTime = {};
    let newestScannedBarcode = null, lastInstantItemCode = null;
    let currentFilteredList = [], auditScannedList = [], pendingDeleteContext = null;
    let activeProvinceShipmentId = null;

    let branchesData = JSON.parse(localStorage.getItem('stock_app_branches_v16') || JSON.stringify([
      { id: 'BR-MAIN', name: 'សាខាកណ្តាល (Main Branch)' },
      { id: 'BR-PP', name: 'សាខាភ្នំពេញ (Phnom Penh)' },
      { id: 'BR-KPT', name: 'សាខាកំពត (Kampot)' }
    ]));

    let deliveryOptions = JSON.parse(localStorage.getItem('stock_app_deliveries_v16') || JSON.stringify([
      'ម៉ូតូ (Motor)', 'កង់បី (Tuk Tuk)', 'ឡាន (Car)', 'J&T', 'VET', 'METFONE'
    ]));

    let provinceCompanies = JSON.parse(localStorage.getItem('stock_app_prov_companies_v16') || JSON.stringify([
      'វីរៈប៊ុនថាំ (VET)', 'J&T Express', 'ឡារីតា (Larryta)', 'កាពីតូល (Capitol)', 'ភ្នំពេញសូរិយា (Sorya)', 'ឡានឈ្នួល / តាក់ស៊ី'
    ]));

    const CORE_DELIVERY = ['ម៉ូតូ (Motor)', 'កង់បី (Tuk Tuk)', 'ឡាន (Car)'];
    function ensureCoreDeliveries(a) { a = Array.isArray(a) ? a : []; CORE_DELIVERY.slice().reverse().forEach(c => { if (!a.includes(c)) a.unshift(c); }); return a; }
    deliveryOptions = ensureCoreDeliveries(deliveryOptions);

    let inventoryData = JSON.parse(localStorage.getItem('stock_app_items_v16') || '[]');
    let returnsData = JSON.parse(localStorage.getItem('stock_app_returns_v16') || '[]');
    let customerIssuesData = JSON.parse(localStorage.getItem('stock_app_cust_issues_v16') || '[]');
    let provinceShipmentsData = JSON.parse(localStorage.getItem('stock_app_province_v16') || '[]');
    let telegramConfig = JSON.parse(localStorage.getItem('stock_app_telegram_v16') || JSON.stringify({ enabled: false, botToken: '', groups: [] }));
    let availableRoles = JSON.parse(localStorage.getItem('stock_app_roles_v16') || JSON.stringify(['Operator', 'Manager', 'Auditor', 'Admin']));
    const CORE_ROLES = ['Operator', 'Manager', 'Auditor', 'Admin'];

    let systemConfig = JSON.parse(localStorage.getItem('stock_app_config_v16') || JSON.stringify({ title: 'Stock Inventory Ultimate Pro', adminPass: '8888' }));

    let registeredUsers = JSON.parse(localStorage.getItem('stock_app_users_v16') || JSON.stringify([
      { id: '1', user: 'admin', pass: '8888', role: 'Admin', branch: 'ALL', name: 'អ្នកគ្រប់គ្រង (Admin)', email: 'admin@stock.com', status: 'approved' },
      { id: '2', user: 'staff1', pass: '1234', role: 'Operator', branch: 'សាខាកណ្តាល (Main Branch)', name: 'បុគ្គលិកសាខាកណ្តាល', email: 'staff1@stock.com', status: 'approved' }
    ]));

    function getTodayISO() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function normalizeProvinceShipments() {
      let changed = false;
      provinceShipmentsData = provinceShipmentsData.map(p => {
        if (!Array.isArray(p.trackings)) {
          changed = true;
          return {
            id: p.id || ('PRV-' + Date.now()),
            company: p.company || 'VET',
            receiver: p.receiver || '-',
            sender: p.sender || '-',
            location: p.location || '-',
            trackings: p.tracking ? [p.tracking] : [],
            count: p.tracking ? 1 : 0,
            branch: p.branch || branchesData[0]?.name || 'Main',
            date: p.date || '',
            dateISO: p.dateISO || getTodayISO(),
            by: p.by || 'Staff'
          };
        }
        p.count = p.trackings.length;
        return p;
      });
      if (changed) localStorage.setItem('stock_app_province_v16', JSON.stringify(provinceShipmentsData));
    }

    window.addEventListener('DOMContentLoaded', () => {
      normalizeProvinceShipments();
      initThemeMode();
      updateVoiceButtonUI();
      applyBrandingUI();
      populateBranchDropdowns();
      populateDeliveryDropdowns();
      populateProvCompanyDropdowns();
      renderRolesOptions();
      renderTelegramSettingsUI();
      setDailyDateToday();
      checkSessionOnLoad();
      applyFilters();
      renderProvinceShipmentsTable();
      renderActiveProvinceDraft();
      renderUsersTable();
      renderPendingUsersTable();
      renderReturnsTable();
      renderCustomerIssuesTable();
      updateAnalyticsDashboard();
      lucide.createIcons();
    });

    // --- ZOOM CONTROL ENGINE (AUTO-ZOOM ~2.0X & MANUAL ZOOM) ---
    async function applyZoomAndConstraints(instance, zoomVal, torchOn = false) {
      if (!instance) return false;
      try {
        const track = instance.videoStream ? instance.videoStream.getVideoTracks()[0] : null;
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities();
          const advancedConstraints = { focusMode: "continuous", torch: !!torchOn };
          if (caps.zoom) {
            const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoomVal));
            advancedConstraints.zoom = z;
          }
          await track.applyConstraints({ advanced: [advancedConstraints] });
          return true;
        }
      } catch (e) {
        try {
          await instance.applyVideoConstraints({ advanced: [{ zoom: zoomVal, torch: !!torchOn }] });
          return true;
        } catch (err) {
          return false;
        }
      }
      return false;
    }

    async function setZoomLevel(target, val) {
      currentZoomLevels[target] = val;
      let instance = null;
      if (target === 'main') instance = scannerObj;
      else if (target === 'delivery') instance = deliveryScannerObj;
      else if (target === 'province') instance = provinceScannerObj;
      else if (target === 'audit') instance = auditScannerObj;

      await applyZoomAndConstraints(instance, val, torchStates[target] || false);

      // Update UI button highlights
      [1, 2, 3].forEach(n => {
        const btn = document.querySelector(`.zoom-btn-${target}-${n}`);
        if (btn) {
          btn.className = (n === val || (n === 2 && val === 2.0))
            ? `zoom-btn-${target}-${n} px-2 py-1 rounded bg-cyan-600 text-[10px] font-bold text-white transition`
            : `zoom-btn-${target}-${n} px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-white transition`;
        }
      });
      const slider = document.getElementById(`zoom-slider-${target}`);
      if (slider) slider.value = val;

      showToast(`Zoom: ${val}x`, 'info');
    }

    function onZoomSliderChange(target, val) {
      setZoomLevel(target, parseFloat(val));
    }

    function toggleVoiceAlert() {
      voiceAlertEnabled = !voiceAlertEnabled;
      localStorage.setItem('app_voice_alert', voiceAlertEnabled ? 'true' : 'false');
      updateVoiceButtonUI();
      showToast(voiceAlertEnabled ? 'បានបើកសំឡេង Alert ពេលស្កេន' : 'បានបិទសំឡេង Alert', 'info');
      if (voiceAlertEnabled) speakAlert('Voice alert enabled');
    }

    function updateVoiceButtonUI() {
      const btn = document.getElementById('btn-voice-toggle');
      const icon = document.getElementById('voice-toggle-icon');
      if (!btn || !icon) return;
      btn.className = voiceAlertEnabled
        ? "p-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 transition shrink-0"
        : "p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-500 border border-slate-700 transition shrink-0";
      icon.setAttribute('data-lucide', voiceAlertEnabled ? 'volume-2' : 'volume-x');
      lucide.createIcons();
    }

    function playBeep(type = 'success') {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === 'error') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(320, ctx.currentTime);
          osc.frequency.setValueAtTime(220, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 250);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1050, ctx.currentTime);
          osc.frequency.setValueAtTime(1450, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 180);
        }
      } catch (e) {}
    }

    function speakAlert(messageText) {
      if (!voiceAlertEnabled) return;
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(messageText);
          utter.rate = 1.15; utter.pitch = 1.05; utter.volume = 1.0;
          window.speechSynthesis.speak(utter);
        }
      } catch (e) {}
    }

    function triggerScanFeedbackSound(voiceMessage, isError = false) {
      playBeep(isError ? 'error' : 'success');
      speakAlert(voiceMessage);
    }

    async function toggleScannerTorch(target) {
      let instance = null, lblId = '';
      if (target === 'main') { instance = scannerObj; lblId = 'lbl-main-torch'; }
      else if (target === 'delivery') { instance = deliveryScannerObj; lblId = 'lbl-delivery-torch'; }
      else if (target === 'province') { instance = provinceScannerObj; lblId = 'lbl-province-torch'; }
      else if (target === 'audit') { instance = auditScannerObj; lblId = 'lbl-audit-torch'; }

      if (!instance) return;
      const nextState = !torchStates[target];
      const ok = await applyZoomAndConstraints(instance, currentZoomLevels[target], nextState);
      if (ok) {
        torchStates[target] = nextState;
        const lbl = document.getElementById(lblId);
        if (lbl) lbl.innerText = nextState ? 'បិទពន្លឺ' : 'ពន្លឺ';
        showToast(nextState ? 'បានបើកភ្លើង Flash' : 'បានបិទភ្លើង Flash', 'info');
      } else {
        showToast('ឧបករណ៍នេះមិនគាំទ្រ Flash ទេ!', 'warning');
      }
    }

    function showInstantItemModal(item, actionTitle) {
      if (!item) return;
      lastInstantItemCode = item.barcode;
      document.getElementById('instant-info-action-badge').innerText = actionTitle;
      document.getElementById('instant-info-code').innerText = item.barcode;
      document.getElementById('instant-info-photo').src = item.photo || 'https://placehold.co/100x100/1e293b/white?text=Item';
      document.getElementById('instant-info-branch').innerText = item.branch || 'Main';
      document.getElementById('instant-info-status').innerText = item.status === 'Opened' ? 'បើករួចរាល់ (Opened)' : (item.status || 'In Stock');

      const detailsEl = document.getElementById('instant-info-details');
      detailsEl.innerHTML = `
        <div class="flex justify-between"><span class="text-slate-400">ស្កេនចូល (Stock In):</span><span class="text-slate-200 font-medium">${item.inBy || '-'} (${item.inDate || '-'})</span></div>
        ${item.openDate ? `<div class="flex justify-between"><span class="text-slate-400">ស្កេនបើក (Opened):</span><span class="text-amber-300 font-medium">${item.openBy} (${item.openDate})</span></div>` : ''}
        ${item.delivery ? `<div class="flex justify-between"><span class="text-slate-400">ក្រុមហ៊ុនដឹកជញ្ជូន:</span><span class="text-amber-300 font-bold">${item.delivery}</span></div>` : ''}
        ${item.dispatchDate ? `<div class="flex justify-between"><span class="text-slate-400">រៀបដឹកជូនភ្ញៀវ:</span><span class="text-sky-300 font-medium">${item.dispatchBy} (${item.dispatchDate})</span></div>` : ''}
        ${item.deliveredDate ? `<div class="flex justify-between"><span class="text-slate-400">ប្រគល់ជូនភ្ញៀវរួច:</span><span class="text-emerald-400 font-bold">${item.deliveredBy} (${item.deliveredDate})</span></div>` : ''}
        ${item.provinceInfo ? `<div class="flex justify-between"><span class="text-slate-400">ផ្ញើតាមស្រុក:</span><span class="text-sky-300 font-bold">${item.provinceInfo.company} → ${item.provinceInfo.location} (${item.provinceInfo.receiver})</span></div>` : ''}
      `;
      document.getElementById('instant-item-modal').classList.remove('hidden');
      lucide.createIcons();
    }
    function closeInstantItemModal() { document.getElementById('instant-item-modal').classList.add('hidden'); }
    function reopenLastInstantInfo() {
      if (!lastInstantItemCode) return;
      const item = inventoryData.find(i => i.barcode === lastInstantItemCode);
      if (item) showInstantItemModal(item, 'ព័ត៌មានទំនិញលម្អិត');
    }

    function populateDeliveryDropdowns() {
      const delTabSel = document.getElementById('delivery-tab-carrier');
      const badgesBox = document.getElementById('deliveries-list-badges');
      if (delTabSel) {
        const prev = delTabSel.value;
        delTabSel.innerHTML = deliveryOptions.map(d => `<option value="${d}">${d}</option>`).join('');
        if (prev && deliveryOptions.includes(prev)) delTabSel.value = prev;
      }
      if (badgesBox) {
        badgesBox.innerHTML = deliveryOptions.map((d, idx) => `
          <span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-amber-300">
            <span>${d}</span>
            ${!CORE_DELIVERY.includes(d) ? `<button onclick="deleteDeliveryOption(${idx})" class="text-rose-400 ml-1">✕</button>` : ''}
          </span>
        `).join('');
      }
    }
    function openAddDeliveryModal() { document.getElementById('input-new-delivery-name').value = ''; document.getElementById('modal-add-delivery').classList.remove('hidden'); }
    function closeAddDeliveryModal() { document.getElementById('modal-add-delivery').classList.add('hidden'); }
    function saveNewDeliveryOption() {
      const name = document.getElementById('input-new-delivery-name').value.trim();
      if (!name) return;
      if (!deliveryOptions.includes(name)) {
        deliveryOptions.push(name);
        localStorage.setItem('stock_app_deliveries_v16', JSON.stringify(deliveryOptions));
        populateDeliveryDropdowns();
      }
      if (document.getElementById('delivery-tab-carrier')) document.getElementById('delivery-tab-carrier').value = name;
      closeAddDeliveryModal();
      showToast(`បានបន្ថែម Delivery [${name}] ជោគជ័យ!`, 'success');
    }
    function addDeliveryFromSettings() {
      const inp = document.getElementById('settings-new-delivery');
      const name = inp.value.trim();
      if (!name) return;
      if (!deliveryOptions.includes(name)) {
        deliveryOptions.push(name);
        localStorage.setItem('stock_app_deliveries_v16', JSON.stringify(deliveryOptions));
        populateDeliveryDropdowns();
        showToast(`បានបន្ថែម Delivery [${name}]!`, 'success');
      }
      inp.value = '';
    }
    function deleteDeliveryOption(idx) {
      if (sessionUser?.role !== 'Admin') return;
      deliveryOptions.splice(idx, 1);
      localStorage.setItem('stock_app_deliveries_v16', JSON.stringify(deliveryOptions));
      populateDeliveryDropdowns();
      showToast('បានលុបប្រភេទ Delivery រួចរាល់!', 'info');
    }

    function populateProvCompanyDropdowns() {
      const provSel = document.getElementById('prov-input-company');
      const badgesBox = document.getElementById('prov-companies-list-badges');
      if (provSel) {
        const prev = provSel.value;
        provSel.innerHTML = provinceCompanies.map(c => `<option value="${c}">${c}</option>`).join('');
        if (prev && provinceCompanies.includes(prev)) provSel.value = prev;
      }
      if (badgesBox) {
        badgesBox.innerHTML = provinceCompanies.map((c, idx) => `
          <span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-sky-300">
            <span>${c}</span>
            ${provinceCompanies.length > 1 ? `<button onclick="deleteProvCompanyByIndex(${idx})" class="text-rose-400 ml-1">✕</button>` : ''}
          </span>
        `).join('');
      }
    }
    function openAddProvCompanyModal() { document.getElementById('input-new-prov-company').value = ''; document.getElementById('modal-add-prov-company').classList.remove('hidden'); }
    function closeAddProvCompanyModal() { document.getElementById('modal-add-prov-company').classList.add('hidden'); }
    function saveNewProvCompany() {
      const name = document.getElementById('input-new-prov-company').value.trim();
      if (!name) return;
      if (!provinceCompanies.includes(name)) {
        provinceCompanies.push(name);
        localStorage.setItem('stock_app_prov_companies_v16', JSON.stringify(provinceCompanies));
        populateProvCompanyDropdowns();
      }
      document.getElementById('prov-input-company').value = name;
      syncActiveProvinceDraftMeta();
      closeAddProvCompanyModal();
      showToast(`បានបន្ថែមក្រុមហ៊ុន [${name}] ជោគជ័យ!`, 'success');
    }
    function addProvCompanyFromSettings() {
      const inp = document.getElementById('settings-new-prov-company');
      const name = inp.value.trim();
      if (!name) return;
      if (!provinceCompanies.includes(name)) {
        provinceCompanies.push(name);
        localStorage.setItem('stock_app_prov_companies_v16', JSON.stringify(provinceCompanies));
        populateProvCompanyDropdowns();
        showToast(`បានបន្ថែមក្រុមហ៊ុន [${name}]!`, 'success');
      }
      inp.value = '';
    }
    function deleteSelectedProvCompany() {
      const sel = document.getElementById('prov-input-company');
      if (!sel || provinceCompanies.length <= 1) return showToast('ត្រូវមានក្រុមហ៊ុនដឹកជញ្ជូនយ៉ាងតិច 1!', 'warning');
      const idx = provinceCompanies.indexOf(sel.value);
      if (idx > -1) deleteProvCompanyByIndex(idx);
    }
    function deleteProvCompanyByIndex(idx) {
      if (provinceCompanies.length <= 1) return showToast('ត្រូវមានក្រុមហ៊ុនដឹកជញ្ជូនយ៉ាងតិច 1!', 'warning');
      provinceCompanies.splice(idx, 1);
      localStorage.setItem('stock_app_prov_companies_v16', JSON.stringify(provinceCompanies));
      populateProvCompanyDropdowns();
      showToast('បានលុបក្រុមហ៊ុនដឹកជញ្ជូនរួចរាល់!', 'info');
    }

    function populateBranchDropdowns() {
      const headerSel = document.getElementById('header-branch-selector');
      const scanSel = document.getElementById('scan-active-branch');
      const filterSel = document.getElementById('filter-branch-select');
      const signupSel = document.getElementById('signup-branch');
      const newUserSel = document.getElementById('new-user-branch');
      const retSel = document.getElementById('ret-input-branch');
      const custSel = document.getElementById('cust-input-branch');
      const badgesBox = document.getElementById('branches-list-badges');

      const isAdmin = sessionUser?.role === 'Admin';
      const userBranch = sessionUser?.branch || branchesData[0]?.name;

      if (badgesBox) {
        badgesBox.innerHTML = branchesData.map((b, idx) => `
          <span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-cyan-300">
            <span>${b.name}</span>
            ${idx > 0 ? `<button onclick="deleteBranch(${idx})" class="text-rose-400 ml-1">✕</button>` : ''}
          </span>
        `).join('');
      }

      [headerSel, filterSel].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        if (isAdmin) {
          sel.innerHTML += `<option value="ALL">🌐 គ្រប់សាខាទាំងអស់ (All Branches)</option>`;
          branchesData.forEach(b => sel.innerHTML += `<option value="${b.name}">${b.name}</option>`);
        } else {
          sel.innerHTML += `<option value="${userBranch}">${userBranch}</option>`;
        }
      });

      [scanSel, retSel, custSel].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        if (isAdmin) branchesData.forEach(b => sel.innerHTML += `<option value="${b.name}">${b.name}</option>`);
        else sel.innerHTML += `<option value="${userBranch}">${userBranch}</option>`;
      });

      [signupSel, newUserSel].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        if (sel === newUserSel) sel.innerHTML += `<option value="ALL">គ្រប់សាខា (All Branches)</option>`;
        branchesData.forEach(b => sel.innerHTML += `<option value="${b.name}">${b.name}</option>`);
      });
    }
    function onHeaderBranchChange() {
      const val = document.getElementById('header-branch-selector').value;
      document.getElementById('filter-branch-select').value = val;
      if (val !== 'ALL') document.getElementById('scan-active-branch').value = val;
      applyFilters();
      updateAnalyticsDashboard();
    }
    function addNewBranch() {
      const input = document.getElementById('new-branch-name');
      const name = input.value.trim();
      if (!name) return;
      if (branchesData.some(b => b.name === name)) return showToast('សាខានេះមានរួចហើយ!', 'warning');
      branchesData.push({ id: 'BR-' + Date.now(), name });
      localStorage.setItem('stock_app_branches_v16', JSON.stringify(branchesData));
      populateBranchDropdowns();
      input.value = '';
      showToast(`បានបន្ថែមសាខា [${name}] ជោគជ័យ!`, 'success');
    }
    function deleteBranch(idx) {
      if (sessionUser?.role !== 'Admin') return;
      branchesData.splice(idx, 1);
      localStorage.setItem('stock_app_branches_v16', JSON.stringify(branchesData));
      populateBranchDropdowns();
      showToast('បានលុបសាខារួចរាល់!', 'info');
    }

    function switchAuthTab(mode) {
      const btnLogin = document.getElementById('auth-tab-btn-login');
      const btnSignUp = document.getElementById('auth-tab-btn-signup');
      const formLogin = document.getElementById('form-auth-login');
      const formSignUp = document.getElementById('form-auth-signup');
      document.getElementById('login-error-banner').classList.add('hidden');
      if (mode === 'login') {
        btnLogin.className = "flex-1 py-2 text-xs font-bold rounded-xl text-white bg-cyan-600 transition flex items-center justify-center space-x-1.5";
        btnSignUp.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition flex items-center justify-center space-x-1.5";
        formLogin.classList.remove('hidden'); formSignUp.classList.add('hidden');
      } else {
        btnSignUp.className = "flex-1 py-2 text-xs font-bold rounded-xl text-white bg-emerald-600 transition flex items-center justify-center space-x-1.5";
        btnLogin.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition flex items-center justify-center space-x-1.5";
        formSignUp.classList.remove('hidden'); formLogin.classList.add('hidden');
      }
    }
    function handleLoginSubmit(e) {
      e.preventDefault();
      const u = document.getElementById('input-username').value.trim();
      const p = document.getElementById('input-password').value;
      const errorBanner = document.getElementById('login-error-banner');
      let matched = null;
      if (u.toLowerCase() === 'admin' && p === systemConfig.adminPass) {
        matched = { id: '1', user: 'admin', pass: systemConfig.adminPass, role: 'Admin', branch: 'ALL', name: 'អ្នកគ្រប់គ្រង (Admin)', status: 'approved' };
      } else {
        matched = registeredUsers.find(acc => (acc.user.toLowerCase() === u.toLowerCase() || (acc.email && acc.email.toLowerCase() === u.toLowerCase())) && acc.pass === p);
      }
      if (!matched) { errorBanner.classList.remove('hidden'); document.getElementById('login-error-text').innerText = 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!'; return; }
      if (matched.status === 'pending') { errorBanner.classList.remove('hidden'); document.getElementById('login-error-text').innerText = 'គណនីរបស់អ្នកកំពុងរង់ចាំ Admin ពិនិត្យ Approve!'; return; }
      sessionUser = matched;
      sessionStorage.setItem('active_session_user', JSON.stringify(sessionUser));
      checkSessionOnLoad();
      showToast(`សូមស្វាគមន៍ ${sessionUser.name}`, 'success');
    }
    function handleSignUpSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('signup-fullname').value.trim();
      const email = document.getElementById('signup-email').value.trim().toLowerCase();
      const user = document.getElementById('signup-username').value.trim().toLowerCase();
      const branch = document.getElementById('signup-branch').value;
      const role = document.getElementById('signup-role').value;
      const pass = document.getElementById('signup-password').value.trim();
      if (registeredUsers.some(u => u.user.toLowerCase() === user || u.email === email)) return showToast('Username ឬ Email នេះមានរួចហើយ!', 'error');
      registeredUsers.push({ id: Date.now().toString(), name, email, user, branch, role, pass, status: 'pending' });
      localStorage.setItem('stock_app_users_v16', JSON.stringify(registeredUsers));
      renderPendingUsersTable();
      showToast('ចុះឈ្មោះជោគជ័យ! សូមរង់ចាំ Admin Approve។', 'success');
      e.target.reset(); switchAuthTab('login');
    }
    function checkSessionOnLoad() {
      if (!sessionUser) { document.getElementById('login-modal').classList.remove('opacity-0', 'pointer-events-none'); return; }
      document.getElementById('nav-username').innerText = sessionUser.name;
      const roleTag = document.getElementById('nav-userrole');
      roleTag.innerText = `${sessionUser.role.toUpperCase()} (${sessionUser.branch === 'ALL' ? 'ALL' : sessionUser.branch})`;
      const settingsBtn = document.getElementById('nav-btn-settings');
      if (sessionUser.role === 'Admin') { settingsBtn.classList.remove('hidden'); roleTag.className = "text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono"; }
      else { settingsBtn.classList.add('hidden'); roleTag.className = "text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-mono"; }
      populateBranchDropdowns(); applyFilters(); updateAnalyticsDashboard(); renderReturnsTable(); renderCustomerIssuesTable();
      document.getElementById('login-modal').classList.add('opacity-0', 'pointer-events-none');
    }

    function changeMode(mode) {
      scannerMode = mode;
      const btnIn = document.getElementById('btn-mode-in');
      const btnOut = document.getElementById('btn-mode-out');
      if (mode === 'IN') {
        btnIn.className = "px-4 py-1.5 rounded-lg bg-cyan-600 text-white shadow transition";
        btnOut.className = "px-4 py-1.5 rounded-lg text-slate-400 hover:text-white transition";
      } else {
        btnOut.className = "px-4 py-1.5 rounded-lg bg-emerald-600 text-white shadow transition";
        btnIn.className = "px-4 py-1.5 rounded-lg text-slate-400 hover:text-white transition";
      }
    }

    function allowContinuousFrame(key) {
      const now = Date.now();
      if (lastFrameTime[key] && (now - lastFrameTime[key]) < 350) return false;
      lastFrameTime[key] = now;
      return true;
    }

    // --- START MAIN SCANNER WITH AUTO-ZOOM ~2.0X ---
    function startScannerCamera() {
      stopAllCamerasExcept('main');
      scannerObj = new Html5Qrcode("reader", h5opts());
      scannerObj.start({ facingMode: "environment" }, { fps: 30, qrbox: getQrbox(), aspectRatio: 1.5 }, (code) => {
        if (!allowContinuousFrame('main_' + code)) return;
        scannerMode === 'IN' ? handleStockInAction(code) : handleStockOpenAction(code);
      }).then(() => {
        document.getElementById('btn-cam-start').classList.add('hidden');
        document.getElementById('btn-cam-stop').classList.remove('hidden');
        document.getElementById('camera-idle').classList.add('hidden');
        document.getElementById('laser-line').classList.remove('hidden');
        document.getElementById('scanner-overlay-controls').classList.remove('hidden');
        // Apply Auto-Zoom ~2.0x immediately upon camera start
        setZoomLevel('main', 2.0);
      }).catch(err => showToast('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err, 'error'));
    }

    function stopScannerCamera() {
      if (scannerObj) {
        scannerObj.stop().then(() => {
          scannerObj = null; torchStates.main = false;
          document.getElementById('lbl-main-torch').innerText = 'ពន្លឺ';
          document.getElementById('btn-cam-start').classList.remove('hidden');
          document.getElementById('btn-cam-stop').classList.add('hidden');
          document.getElementById('camera-idle').classList.remove('hidden');
          document.getElementById('laser-line').classList.add('hidden');
          document.getElementById('scanner-overlay-controls').classList.add('hidden');
        }).catch(() => {});
      }
    }

    function handleScanManualSubmit() {
      const input = document.getElementById('scan-manual-tracking-input');
      const code = input.value.trim();
      if (!code) return;
      scannerMode === 'IN' ? handleStockInAction(code) : handleStockOpenAction(code);
      input.value = ''; input.focus();
    }

    function showLastScanFeedback(code, metaText, photoUrl) {
      lastInstantItemCode = code;
      const box = document.getElementById('last-scan-feedback');
      document.getElementById('last-scan-code-txt').innerText = code;
      document.getElementById('last-scan-meta-txt').innerText = metaText;
      if (photoUrl) document.getElementById('last-scan-thumb').src = photoUrl;
      box.classList.remove('hidden');
    }

    function handleStockInAction(code) {
      const activeBranch = document.getElementById('scan-active-branch').value;
      const photo = grabCameraFrame("#reader video") || 'https://placehold.co/100x100/1e293b/white?text=Item';
      const now = new Date();
      const dateStr = now.toLocaleDateString('km-KH') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isoDate = getTodayISO();

      const existing = inventoryData.find(i => i.barcode === code);
      if (existing) {
        if (photo && !photo.includes('placehold.co')) existing.photo = photo;
        existing.inDate = dateStr; existing.inDateISO = isoDate; existing.inBy = sessionUser?.name || 'Staff';
        newestScannedBarcode = code;
        saveInventoryData(); applyFilters(); updateAnalyticsDashboard();
        triggerScanFeedbackSound(`Scanned ${code}`, false);
        showLastScanFeedback(code, `ស្កេនចូល & ថតរូបរួចរាល់ • ${existing.branch}`, existing.photo);
        showToast(`ស្កេនចូល [${code}] & ថតរូបជោគជ័យ!`, 'success');
        return;
      }

      const newItem = { barcode: code, branch: activeBranch, delivery: '', status: 'In Stock', photo, inDate: dateStr, inDateISO: isoDate, inBy: sessionUser?.name || 'Staff', openDate: null, openBy: null };
      inventoryData.unshift(newItem);
      newestScannedBarcode = code;
      saveInventoryData(); applyFilters(); updateAnalyticsDashboard();
      triggerScanFeedbackSound(`Stock In ${code}`, false);
      showLastScanFeedback(code, `ស្កេនចូល (Stock In) • ${activeBranch}`, photo);
      showToast(`ស្កេនចូល [${code}] ជោគជ័យ!`, 'success');

      sendTelegramNotification(
        `📦 <b>ស្កេនទំនិញចូលស្តុក (STOCK IN)</b>
` +
        `🔖 Tracking: <code>${code}</code>
` +
        `🏢 សាខា: ${activeBranch}
` +
        `👤 ដោយ: ${newItem.inBy}
` +
        `🕒 ម៉ោង: ${dateStr}`
      );
    }

    function handleStockOpenAction(code) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('km-KH') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const activeBranch = document.getElementById('scan-active-branch').value;
      const photo = grabCameraFrame("#reader video");
      let item = inventoryData.find(i => i.barcode === code);

      if (!item) {
        item = { barcode: code, branch: activeBranch, delivery: '', status: 'Opened', photo: photo || 'https://placehold.co/100x100/1e293b/white?text=Opened', inDate: dateStr, inDateISO: getTodayISO(), inBy: sessionUser?.name || 'Staff', openDate: dateStr, openDateISO: getTodayISO(), openBy: sessionUser?.name || 'Staff' };
        inventoryData.unshift(item);
      } else {
        if (sessionUser?.role !== 'Admin' && item.branch !== sessionUser?.branch) {
          triggerScanFeedbackSound('Access denied', true);
          return showToast(`ទំនិញនេះស្ថិតនៅ [${item.branch}] អ្នកគ្មានសិទ្ធិកែប្រែទេ!`, 'error');
        }
        if (photo) item.photo = photo;
        item.status = 'Opened'; item.openDate = dateStr; item.openDateISO = getTodayISO(); item.openBy = sessionUser?.name || 'Staff';
      }

      newestScannedBarcode = code;
      saveInventoryData(); applyFilters(); updateAnalyticsDashboard();
      triggerScanFeedbackSound(`Opened ${code}`, false);
      showLastScanFeedback(code, `បានស្កេនបើករួចរាល់ (Opened) • ${item.branch}`, item.photo);
      showToast(`បានស្កេនបើកទំនិញ [${code}] រួចរាល់!`, 'success');

      sendTelegramNotification(
        `📂 <b>ស្កេនបើកទំនិញ (STOCK OUT / OPENED)</b>
` +
        `🔖 Tracking: <code>${code}</code>
` +
        `🏢 សាខា: ${item.branch}
` +
        `👤 បើកដោយ: ${item.openBy}
` +
        `🕒 ម៉ោង: ${dateStr}`
      );
    }

    function grabCameraFrame(selector = "#reader video") {
      const vid = document.querySelector(selector);
      if (!vid) return null;
      const canvas = document.getElementById("snapshot-canvas");
      canvas.width = vid.videoWidth || 320; canvas.height = vid.videoHeight || 240;
      canvas.getContext("2d").drawImage(vid, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.6);
    }

    function switchDeliverySubTab(sub) {
      deliverySubTab = sub;
      const btnDisp = document.getElementById('del-subtab-btn-dispatch');
      const btnDeliv = document.getElementById('del-subtab-btn-delivered');
      const carrierBox = document.getElementById('delivery-carrier-box');
      const lblInput = document.getElementById('lbl-delivery-input-title');
      const btnSubmit = document.getElementById('btn-delivery-manual-submit');

      if (sub === 'dispatch') {
        btnDisp.className = "px-3.5 py-2 rounded-xl bg-amber-600 text-white transition flex items-center space-x-1.5";
        btnDeliv.className = "px-3.5 py-2 rounded-xl text-slate-400 hover:text-white transition flex items-center space-x-1.5";
        carrierBox.classList.remove('hidden');
        lblInput.innerText = '១. ស្កេនអីវ៉ាន់ចេញដឹកជូនភ្ញៀវ (Update ស្ថានភាព → បានរៀបដឹកជូនភ្ញៀវ)៖';
        btnSubmit.className = 'bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold';
      } else {
        btnDeliv.className = "px-3.5 py-2 rounded-xl bg-emerald-600 text-white transition flex items-center space-x-1.5";
        btnDisp.className = "px-3.5 py-2 rounded-xl text-slate-400 hover:text-white transition flex items-center space-x-1.5";
        carrierBox.classList.add('hidden');
        lblInput.innerText = '២. ស្កេនប្រគល់អីវ៉ាន់ជូនភ្ញៀវ (Update ស្ថានភាព → បានប្រគល់ជូនភ្ញៀវរួចរាល់)៖';
        btnSubmit.className = 'bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold';
      }
    }

    // --- START DELIVERY SCANNER WITH AUTO-ZOOM ~2.0X ---
    function startDeliveryScannerCamera() {
      stopAllCamerasExcept('delivery');
      deliveryScannerObj = new Html5Qrcode("delivery-reader", h5opts());
      deliveryScannerObj.start({ facingMode: "environment" }, { fps: 30, qrbox: getQrbox() }, (code) => {
        if (!allowContinuousFrame('del_' + code)) return;
        processDeliveryScan(code);
      }).then(() => {
        document.getElementById('btn-del-cam-start').classList.add('hidden');
        document.getElementById('btn-del-cam-stop').classList.remove('hidden');
        document.getElementById('delivery-camera-idle').classList.add('hidden');
        document.getElementById('delivery-laser-line').classList.remove('hidden');
        document.getElementById('delivery-overlay-controls').classList.remove('hidden');
        setZoomLevel('delivery', 2.0);
      }).catch(err => showToast('Camera Error: ' + err, 'error'));
    }

    function stopDeliveryScannerCamera() {
      if (deliveryScannerObj) {
        deliveryScannerObj.stop().then(() => {
          deliveryScannerObj = null; torchStates.delivery = false;
          document.getElementById('lbl-delivery-torch').innerText = 'ពន្លឺ';
          document.getElementById('btn-del-cam-start').classList.remove('hidden');
          document.getElementById('btn-del-cam-stop').classList.add('hidden');
          document.getElementById('delivery-camera-idle').classList.add('hidden');
          document.getElementById('delivery-laser-line').classList.add('hidden');
          document.getElementById('delivery-overlay-controls').classList.add('hidden');
        }).catch(() => {});
      }
    }

    function handleDeliveryManualSubmit() {
      const inp = document.getElementById('delivery-manual-input');
      const code = inp.value.trim();
      if (!code) return;
      processDeliveryScan(code);
      inp.value = ''; inp.focus();
    }

    function processDeliveryScan(code) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('km-KH') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isoDate = getTodayISO();
      const activeBranch = document.getElementById('scan-active-branch')?.value || branchesData[0]?.name || 'Main';
      const photo = grabCameraFrame("#delivery-reader video");
      let item = inventoryData.find(i => i.barcode === code);

      if (deliverySubTab === 'dispatch') {
        const carrier = document.getElementById('delivery-tab-carrier').value || 'Delivery';
        if (!item) {
          item = { barcode: code, branch: activeBranch, delivery: carrier, status: 'បានរៀបដឹកជូនភ្ញៀវ', photo: photo || 'https://placehold.co/100x100/1e293b/white?text=Deliv', inDate: dateStr, inDateISO: isoDate, inBy: sessionUser?.name || 'Staff', dispatchDate: dateStr, dispatchDateISO: isoDate, dispatchBy: sessionUser?.name || 'Staff' };
          inventoryData.unshift(item);
        } else {
          if (photo) item.photo = photo;
          item.status = 'បានរៀបដឹកជូនភ្ញៀវ'; item.delivery = carrier; item.dispatchDate = dateStr; item.dispatchDateISO = isoDate; item.dispatchBy = sessionUser?.name || 'Staff';
        }
        newestScannedBarcode = code;
        saveInventoryData(); applyFilters(); updateAnalyticsDashboard();
        triggerScanFeedbackSound(`Dispatched ${code}`, false);
        document.getElementById('delivery-last-updated-text').innerHTML = `✅ បាន Update <b class="text-amber-300 font-mono">${code}</b> → <b>បានរៀបដឹកជូនភ្ញៀវ</b>`;
        showToast(`[${code}] Update ស្ថានភាព៖ បានរៀបដឹកជូនភ្ញៀវ (${carrier})`, 'success');

        sendTelegramNotification(
          `🛵 <b>រៀបអីវ៉ាន់ចេញដឹកជូនភ្ញៀវ (DISPATCHED)</b>
` +
          `🔖 Tracking: <code>${code}</code>
` +
          `🚚 ដឹកតាម: ${carrier}
` +
          `🏢 សាខា: ${item.branch}
` +
          `👤 ដោយ: ${item.dispatchBy}
` +
          `🕒 ម៉ោង: ${dateStr}`
        );
      } else {
        if (!item) {
          item = { barcode: code, branch: activeBranch, delivery: 'Delivery', status: 'បានប្រគល់រួចរាល់', photo: photo || 'https://placehold.co/100x100/1e293b/white?text=Done', inDate: dateStr, inDateISO: isoDate, inBy: sessionUser?.name || 'Staff', deliveredDate: dateStr, deliveredDateISO: isoDate, deliveredBy: sessionUser?.name || 'Staff' };
          inventoryData.unshift(item);
        } else {
          if (photo) item.photo = photo;
          item.status = 'បានប្រគល់រួចរាល់'; item.deliveredDate = dateStr; item.deliveredDateISO = isoDate; item.deliveredBy = sessionUser?.name || 'Staff';
        }
        newestScannedBarcode = code;
        saveInventoryData(); applyFilters(); updateAnalyticsDashboard();
        triggerScanFeedbackSound(`Delivered ${code}`, false);
        document.getElementById('delivery-last-updated-text').innerHTML = `✅ បាន Update <b class="text-emerald-300 font-mono">${code}</b> → <b>បានប្រគល់ជូនភ្ញៀវរួចរាល់</b>`;
        showToast(`[${code}] Update ស្ថានភាព៖ បានប្រគល់ជូនភ្ញៀវរួចរាល់!`, 'success');

        sendTelegramNotification(
          `✅ <b>ប្រគល់អីវ៉ាន់ជូនភ្ញៀវរួចរាល់ (DELIVERED)</b>
` +
          `🔖 Tracking: <code>${code}</code>
` +
          `🏢 សាខា: ${item.branch}
` +
          `👤 ប្រគល់ដោយ: ${item.deliveredBy}
` +
          `🕒 ម៉ោង: ${dateStr}`
        );
      }
    }

    // --- START PROVINCE SCANNER WITH AUTO-ZOOM ~2.0X ---
    function startProvinceScannerCamera() {
      stopAllCamerasExcept('province');
      provinceScannerObj = new Html5Qrcode("province-reader", h5opts());
      provinceScannerObj.start({ facingMode: "environment" }, { fps: 30, qrbox: getQrbox() }, (code) => {
        if (!allowContinuousFrame('prov_' + code)) return;
        processProvinceTrackingScan(code);
      }).then(() => {
        document.getElementById('btn-prov-cam-start').classList.add('hidden');
        document.getElementById('btn-prov-cam-stop').classList.remove('hidden');
        document.getElementById('province-camera-idle').classList.add('hidden');
        document.getElementById('province-overlay-controls').classList.remove('hidden');
        setZoomLevel('province', 2.0);
      }).catch(err => showToast('Camera Error: ' + err, 'error'));
    }

    function stopProvinceScannerCamera() {
      if (provinceScannerObj) {
        provinceScannerObj.stop().then(() => {
          provinceScannerObj = null; torchStates.province = false;
          document.getElementById('lbl-province-torch').innerText = 'ពន្លឺ';
          document.getElementById('btn-prov-cam-start').classList.remove('hidden');
          document.getElementById('btn-prov-cam-stop').classList.add('hidden');
          document.getElementById('province-camera-idle').classList.add('hidden');
          document.getElementById('province-overlay-controls').classList.add('hidden');
        }).catch(() => {});
      }
    }

    function handleProvinceTrackingSubmit() {
      const inp = document.getElementById('prov-input-tracking');
      const tracking = inp.value.trim();
      if (!tracking) return showToast('សូមស្កេន ឬបញ្ចូលលេខ Tracking!', 'warning');
      inp.value = '';
      processProvinceTrackingScan(tracking);
      inp.focus();
    }

    function getOrCreateActiveProvinceShipment() {
      let current = activeProvinceShipmentId ? provinceShipmentsData.find(p => p.id === activeProvinceShipmentId) : null;
      if (!current) {
        const company = document.getElementById('prov-input-company').value || provinceCompanies[0] || 'VET';
        const receiver = document.getElementById('prov-input-receiver').value.trim() || '-';
        const sender = document.getElementById('prov-input-sender').value.trim() || '-';
        const location = document.getElementById('prov-input-location').value.trim() || '-';
        const activeBranch = document.getElementById('scan-active-branch')?.value || branchesData[0]?.name || 'Main';
        const now = new Date();
        const dateStr = now.toLocaleDateString('km-KH') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        current = { id: 'PRV-' + Date.now(), company, receiver, sender, location, trackings: [], count: 0, branch: activeBranch, date: dateStr, dateISO: getTodayISO(), by: sessionUser?.name || 'Staff' };
        provinceShipmentsData.unshift(current);
        activeProvinceShipmentId = current.id;
      }
      return current;
    }

    function syncActiveProvinceDraftMeta() {
      if (!activeProvinceShipmentId) return;
      const current = provinceShipmentsData.find(p => p.id === activeProvinceShipmentId);
      if (!current) return;
      current.company = document.getElementById('prov-input-company').value || current.company;
      current.receiver = document.getElementById('prov-input-receiver').value.trim() || '-';
      current.sender = document.getElementById('prov-input-sender').value.trim() || '-';
      current.location = document.getElementById('prov-input-location').value.trim() || '-';
      localStorage.setItem('stock_app_province_v16', JSON.stringify(provinceShipmentsData));
      renderProvinceShipmentsTable();
    }

    function startNewProvinceShipment() {
      activeProvinceShipmentId = null;
      document.getElementById('prov-input-receiver').value = '';
      document.getElementById('prov-input-sender').value = '';
      document.getElementById('prov-input-location').value = '';
      renderActiveProvinceDraft();
      showToast('បានចាប់ផ្តើមវិក័យបត្រផ្ញើតាមស្រុកថ្មី!', 'info');
    }

    function processProvinceTrackingScan(tracking) {
      const shipment = getOrCreateActiveProvinceShipment();
      syncActiveProvinceDraftMeta();

      const now = new Date();
      const dateStr = now.toLocaleDateString('km-KH') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isoDate = getTodayISO();
      const by = sessionUser?.name || 'Staff';
      const photo = grabCameraFrame("#province-reader video");

      if (!shipment.trackings.includes(tracking)) {
        shipment.trackings.push(tracking);
        shipment.count = shipment.trackings.length;
      }

      const provInfo = { company: shipment.company, receiver: shipment.receiver, sender: shipment.sender, location: shipment.location, date: dateStr };
      let invItem = inventoryData.find(x => x.barcode === tracking);
      if (invItem) {
        if (photo) invItem.photo = photo;
        invItem.status = 'Opened'; invItem.openDate = dateStr; invItem.openDateISO = isoDate; invItem.openBy = by; invItem.delivery = shipment.company; invItem.dispatchDate = dateStr; invItem.dispatchDateISO = isoDate; invItem.provinceInfo = provInfo;
      } else {
        inventoryData.unshift({ barcode: tracking, branch: shipment.branch, delivery: shipment.company, status: 'Opened', photo: photo || 'https://placehold.co/100x100/0369a1/white?text=Prov', inDate: dateStr, inDateISO: isoDate, inBy: by, openDate: dateStr, openDateISO: isoDate, openBy: by, dispatchDate: dateStr, dispatchDateISO: isoDate, provinceInfo: provInfo });
      }

      newestScannedBarcode = tracking;
      localStorage.setItem('stock_app_province_v16', JSON.stringify(provinceShipmentsData));
      saveInventoryData(); applyFilters(); updateAnalyticsDashboard(); renderActiveProvinceDraft(); renderProvinceShipmentsTable();

      triggerScanFeedbackSound(`Tracking ${shipment.count}`, false);
      showToast(`ផ្ញើតាមស្រុក [${tracking}] → រក្សាទុក & Update ស្ថានភាព (សរុប ${shipment.count})`, 'success');

      sendTelegramNotification(
        `🗺️ <b>ស្កេនអីវ៉ាន់ផ្ញើតាមស្រុក (PROVINCE SHIPPING)</b>
` +
        `🔖 Tracking: <code>${tracking}</code> (សរុប: <b>${shipment.count}</b>)
` +
        `🚚 ក្រុមហ៊ុន: ${shipment.company}
` +
        `📍 ទីតាំង: ${shipment.location}
` +
        `📞 អ្នកទទួល: ${shipment.receiver} | អ្នកផ្ញើ: ${shipment.sender}
` +
        `👤 ដោយ: ${by} (${dateStr})`
      );
    }

    function renderActiveProvinceDraft() {
      const current = activeProvinceShipmentId ? provinceShipmentsData.find(p => p.id === activeProvinceShipmentId) : null;
      const trackings = current ? current.trackings : [];
      document.getElementById('prov-batch-count').innerText = trackings.length;
      document.getElementById('prov-batch-chips').innerHTML = trackings.map((t, i) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-sky-700/50 text-[11px] font-mono text-sky-200">
          ${i + 1}. ${t}
          <button onclick="removeTrackingFromActiveShipment(${i})" class="text-rose-400">✕</button>
        </span>
      `).join('');
    }

    function removeTrackingFromActiveShipment(idx) {
      if (!activeProvinceShipmentId) return;
      const current = provinceShipmentsData.find(p => p.id === activeProvinceShipmentId);
      if (!current) return;
      current.trackings.splice(idx, 1);
      current.count = current.trackings.length;
      localStorage.setItem('stock_app_province_v16', JSON.stringify(provinceShipmentsData));
      renderActiveProvinceDraft(); renderProvinceShipmentsTable();
    }

    function renderProvinceShipmentsTable() {
      const tbody = document.getElementById('province-tbody');
      if (!tbody) return;
      const isAdmin = sessionUser?.role === 'Admin';
      const search = (document.getElementById('prov-search-input')?.value || '').trim().toLowerCase();

      const list = provinceShipmentsData.filter(p => {
        if (!isAdmin && p.branch !== sessionUser?.branch) return false;
        if (!search) return true;
        const trkStr = (p.trackings || []).join(' ').toLowerCase();
        return trkStr.includes(search) || (p.receiver || '').toLowerCase().includes(search) || (p.sender || '').toLowerCase().includes(search) || (p.location || '').toLowerCase().includes(search) || (p.company || '').toLowerCase().includes(search);
      });

      const totalTrackings = list.reduce((sum, item) => sum + (item.trackings ? item.trackings.length : 0), 0);
      document.getElementById('province-total-tracking-badge').innerText = totalTrackings;
      document.getElementById('prov-batch-counter').innerText = `សរុប: ${totalTrackings} Tracking (${list.length} វិក័យបត្រ)`;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">មិនទាន់មានទិន្នន័យអីវ៉ាន់ផ្ញើតាមស្រុកឡើយ</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(p => {
        const trks = p.trackings || [];
        return `
        <tr class="hover:bg-slate-800/40 ${p.id === activeProvinceShipmentId ? 'bg-sky-950/30' : ''}">
          <td class="px-3.5 py-2.5">
            <span class="inline-block text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold mb-1">${p.company}</span>
            <div class="flex flex-wrap gap-1 max-w-[220px]">
              ${trks.map(t => `<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">${t}</span>`).join('')}
            </div>
          </td>
          <td class="px-3.5 py-2.5 text-[11px]">
            <p class="text-emerald-300 font-semibold">ទទួល៖ ${p.receiver}</p>
            <p class="text-slate-400">ផ្ញើ៖ ${p.sender}</p>
          </td>
          <td class="px-3.5 py-2.5">
            <p class="text-white font-semibold">${p.location}</p>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">ចំនួន Tracking: ${trks.length}</span>
            <p class="text-[10px] text-slate-400 mt-0.5">${p.date}</p>
          </td>
          <td class="px-3.5 py-2.5 text-right space-x-1 whitespace-nowrap">
            <button onclick="openProvinceReceiptModal('${p.id}')" title="Print វិក័យបត្រ" class="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] inline-flex items-center gap-1">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i><span>Print វិក័យបត្រ</span>
            </button>
            ${isAdmin ? `<button onclick="triggerDeleteModal({type:'PROVINCE', id:'${p.id}'})" class="p-1.5 rounded-lg bg-rose-500/20 text-rose-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
          </td>
        </tr>
      `}).join('');
      lucide.createIcons();
    }

    function openProvinceReceiptModal(shipmentId) {
      const p = provinceShipmentsData.find(x => x.id === shipmentId);
      if (!p) return;
      const trks = p.trackings || [];
      document.getElementById('rcp-appname').innerText = systemConfig.title;
      document.getElementById('rcp-date').innerText = `Date: ${p.date || new Date().toLocaleString()}`;
      document.getElementById('rcp-company').innerText = p.company || '-';
      document.getElementById('rcp-receiver').innerText = p.receiver || '-';
      document.getElementById('rcp-sender').innerText = p.sender || '-';
      document.getElementById('rcp-location').innerText = p.location || '-';
      document.getElementById('rcp-count').innerText = `${trks.length} Tracking`;
      document.getElementById('rcp-batch-id').innerText = `Receipt ID: ${p.id}`;

      const listEl = document.getElementById('rcp-trackings-list');
      listEl.innerHTML = trks.length > 0 ? trks.map((t, i) => `<div>${i + 1}. ${t}</div>`).join('') : '<div>-</div>';
      try { JsBarcode("#rcp-barcode-canvas", trks[0] || p.id, { format: "CODE128", width: 1.5, height: 36, displayValue: false }); } catch (e) {}
      document.getElementById('province-receipt-modal').classList.remove('hidden');
      lucide.createIcons();
    }
    function closeProvinceReceiptModal() { document.getElementById('province-receipt-modal').classList.add('hidden'); }

    function setDailyDateToday() {
      const today = getTodayISO();
      const dailyInp = document.getElementById('daily-summary-date');
      if (dailyInp) { dailyInp.value = today; updateDailySummaryStats(); }
    }

    function updateDailySummaryStats() {
      const targetDate = document.getElementById('daily-summary-date')?.value || getTodayISO();
      const isAdmin = sessionUser?.role === 'Admin';
      const selectedBranch = document.getElementById('filter-branch-select')?.value || 'ALL';

      const visible = inventoryData.filter(item => {
        if (!isAdmin && item.branch !== sessionUser?.branch) return false;
        if (isAdmin && selectedBranch !== 'ALL' && item.branch !== selectedBranch) return false;
        return true;
      });

      const inCount = visible.filter(i => (i.inDateISO || '') === targetDate).length;
      const outCount = visible.filter(i => (i.openDateISO || '') === targetDate).length;
      const delCount = visible.filter(i => (i.dispatchDateISO || '') === targetDate || (i.deliveredDateISO || '') === targetDate).length;

      document.getElementById('daily-stat-in').innerText = inCount;
      document.getElementById('daily-stat-out').innerText = outCount;
      document.getElementById('daily-stat-delivery').innerText = delCount;
    }

    function applyFilters() {
      const search = document.getElementById('filter-search-input').value.trim().toLowerCase();
      const dateFilter = document.getElementById('filter-date-input').value;
      const status = document.getElementById('filter-status-select').value;
      const selectedBranch = document.getElementById('filter-branch-select').value;
      const isAdmin = sessionUser?.role === 'Admin';
      const userBranch = sessionUser?.branch;

      currentFilteredList = inventoryData.filter(item => {
        if (!isAdmin && item.branch !== userBranch) return false;
        if (isAdmin && selectedBranch !== 'ALL' && item.branch !== selectedBranch) return false;

        const matchSearch = !search || item.barcode.toLowerCase().includes(search) || (item.delivery && item.delivery.toLowerCase().includes(search));
        const matchDate = !dateFilter || item.inDateISO === dateFilter || item.openDateISO === dateFilter || item.dispatchDateISO === dateFilter || item.deliveredDateISO === dateFilter;

        let matchStatus = true;
        if (status === 'IN_STOCK') matchStatus = item.status === 'In Stock';
        else if (status === 'OPENED') matchStatus = item.status === 'Opened';
        else if (status === 'DELIVERY_ALL') matchStatus = item.status === 'បានរៀបដឹកជូនភ្ញៀវ' || item.status === 'បានប្រគល់រួចរាល់' || !!item.provinceInfo;
        else if (status === 'DISPATCHED') matchStatus = item.status === 'បានរៀបដឹកជូនភ្ញៀវ';
        else if (status === 'DELIVERED') matchStatus = item.status === 'បានប្រគល់រួចរាល់';
        else if (status === 'PROVINCE') matchStatus = !!item.provinceInfo || (item.status && item.status.startsWith('ផ្ញើតាមស្រុក'));

        return matchSearch && matchDate && matchStatus;
      });

      renderInventoryTable(currentFilteredList);
      updateDailySummaryStats();
    }

    function updateAnalyticsDashboard() {
      const isAdmin = sessionUser?.role === 'Admin';
      const selectedBranch = document.getElementById('filter-branch-select')?.value || 'ALL';
      const visibleItems = inventoryData.filter(item => {
        if (!isAdmin) return item.branch === sessionUser?.branch;
        if (selectedBranch !== 'ALL') return item.branch === selectedBranch;
        return true;
      });
      document.getElementById('nav-records-count').innerText = visibleItems.length;
      updateDailySummaryStats();
    }

    function renderInventoryTable(list) {
      const tbody = document.getElementById('inventory-tbody');
      const emptyBox = document.getElementById('table-empty-box');
      document.getElementById('inventory-count-badge').innerText = `${list.length} មុខ`;
      tbody.innerHTML = '';

      if (list.length === 0) { emptyBox.classList.remove('hidden'); return; }
      emptyBox.classList.add('hidden');
      const isAdmin = sessionUser?.role === 'Admin';

      list.forEach(item => {
        const isOpened = item.status === 'Opened';
        const isDispatched = item.status === 'បានរៀបដឹកជូនភ្ញៀវ';
        const isDelivered = item.status === 'បានប្រគល់រួចរាល់';
        const isProvince = !!item.provinceInfo;

        let badgeClass = 'bg-emerald-500/20 text-emerald-400';
        let statusLabel = item.status || 'ក្នុងស្តុក';
        if (item.status === 'In Stock') statusLabel = 'ក្នុងស្តុក (Stock In)';
        else if (isOpened) { badgeClass = 'bg-amber-500/20 text-amber-400'; statusLabel = isProvince ? 'បើករួចរាល់ (ផ្ញើតាមស្រុក)' : 'បើករួចរាល់ (Opened)'; }
        else if (isDispatched) { badgeClass = 'bg-orange-500/20 text-orange-300'; statusLabel = 'បានរៀបដឹកជូនភ្ញៀវ'; }
        else if (isDelivered) { badgeClass = 'bg-teal-500/20 text-teal-300'; statusLabel = 'បានប្រគល់ជូនភ្ញៀវរួចរាល់'; }

        const tr = document.createElement('tr');
        tr.className = `hover:bg-slate-800/40 transition-colors ${newestScannedBarcode === item.barcode ? 'new-scan-pulse' : ''}`;
        tr.innerHTML = `
          <td class="px-4 py-3"><img src="${item.photo}" class="w-11 h-11 rounded-xl object-cover border border-slate-700"></td>
          <td class="px-4 py-3">
            <div class="font-mono font-bold text-slate-200">${item.barcode}</div>
            <span class="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">${item.branch || 'Main'}</span>
          </td>
          <td class="px-4 py-3">
            ${item.delivery ? `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border font-semibold text-[11px]"><i data-lucide="truck" class="w-3 h-3"></i><span>${item.delivery}</span></span>` : `<span class="text-slate-500 text-[11px]">—</span>`}
          </td>
          <td class="px-4 py-3"><span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}">${statusLabel}</span></td>
          <td class="px-4 py-3 text-[11px] space-y-0.5">
            <p class="text-slate-300">ចូល៖ ${item.inBy} (${item.inDate})</p>
            ${item.openDate ? `<p class="text-amber-400">បើករួច៖ ${item.openBy} (${item.openDate})</p>` : ''}
            ${item.dispatchDate && !isProvince ? `<p class="text-orange-300">រៀបដឹក៖ ${item.dispatchBy || ''} (${item.dispatchDate})</p>` : ''}
            ${item.deliveredDate ? `<p class="text-emerald-400">ប្រគល់រួច៖ ${item.deliveredBy || ''} (${item.deliveredDate})</p>` : ''}
            ${isProvince ? `<p class="text-sky-300">ផ្ញើស្រុក៖ ${item.provinceInfo.location} (${item.provinceInfo.receiver})</p>` : ''}
          </td>
          <td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end space-x-1.5">
              <button onclick="openPrintModal('${item.barcode}', '${item.branch}', '${item.delivery || ''}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400"><i data-lucide="printer" class="w-3.5 h-3.5"></i></button>
              ${item.status === 'In Stock' ? `<button onclick="handleStockOpenAction('${item.barcode}')" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white px-2.5 py-1 rounded-lg text-[11px]">Scan បើក</button>` : ''}
              ${isAdmin ? `<button onclick="triggerDeleteModal({ type: 'STOCK', barcode: '${item.barcode}' })" class="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
      lucide.createIcons();
    }

    function renderTelegramSettingsUI() {
      const enabledCb = document.getElementById('tg-enabled-checkbox');
      const tokenInp = document.getElementById('tg-bot-token');
      const listEl = document.getElementById('tg-groups-list');
      if (!enabledCb || !tokenInp || !listEl) return;
      enabledCb.checked = !!telegramConfig.enabled;
      tokenInp.value = telegramConfig.botToken || '';
      const groups = telegramConfig.groups || [];
      if (groups.length === 0) { listEl.innerHTML = `<p class="text-[11px] text-slate-500 py-1">មិនទាន់មាន Telegram Group នៅឡើយទេ។</p>`; return; }
      listEl.innerHTML = groups.map((g, idx) => `
        <div class="flex items-center justify-between bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs">
          <div class="flex items-center space-x-2.5">
            <input type="checkbox" ${g.active !== false ? 'checked' : ''} onchange="toggleTelegramGroup(${idx})" class="w-4 h-4 accent-sky-500">
            <div><span class="font-bold text-white">${g.name}</span><span class="ml-2 font-mono text-[11px] text-sky-400">${g.chatId}</span></div>
          </div>
          <button type="button" onclick="removeTelegramGroup(${idx})" class="text-rose-400 text-xs px-2 py-0.5 rounded bg-rose-500/10">លុប</button>
        </div>
      `).join('');
    }

    function saveTelegramSettings() {
      telegramConfig.enabled = document.getElementById('tg-enabled-checkbox').checked;
      telegramConfig.botToken = document.getElementById('tg-bot-token').value.trim();
      localStorage.setItem('stock_app_telegram_v16', JSON.stringify(telegramConfig));
      showToast('បានរក្សាទុកការកំណត់ Telegram Bot!', 'success');
    }
    function addTelegramGroup() {
      const name = document.getElementById('tg-new-group-name').value.trim();
      const chatId = document.getElementById('tg-new-group-chatid').value.trim();
      if (!name || !chatId) return showToast('សូមបំពេញឱ្យគ្រប់!', 'warning');
      if (!telegramConfig.groups) telegramConfig.groups = [];
      telegramConfig.groups.push({ id: 'TG-' + Date.now(), name, chatId, active: true });
      localStorage.setItem('stock_app_telegram_v16', JSON.stringify(telegramConfig));
      document.getElementById('tg-new-group-name').value = ''; document.getElementById('tg-new-group-chatid').value = '';
      renderTelegramSettingsUI();
      showToast('បានបន្ថែម Telegram Group!', 'success');
    }
    function toggleTelegramGroup(idx) {
      if (!telegramConfig.groups[idx]) return;
      telegramConfig.groups[idx].active = telegramConfig.groups[idx].active === false ? true : false;
      localStorage.setItem('stock_app_telegram_v16', JSON.stringify(telegramConfig));
    }
    function removeTelegramGroup(idx) {
      telegramConfig.groups.splice(idx, 1);
      localStorage.setItem('stock_app_telegram_v16', JSON.stringify(telegramConfig));
      renderTelegramSettingsUI();
      showToast('បានលុប Telegram Group!', 'info');
    }

    async function sendTelegramNotification(htmlMessage) {
      if (!telegramConfig.enabled || !telegramConfig.botToken) return;
      const activeGroups = (telegramConfig.groups || []).filter(g => g.active !== false && g.chatId);
      if (activeGroups.length === 0) return;
      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
      for (const grp of activeGroups) {
        try {
          await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: grp.chatId, text: htmlMessage, parse_mode: 'HTML' }) });
        } catch (e) {}
      }
    }

    async function testTelegramNotification() {
      const token = document.getElementById('tg-bot-token').value.trim();
      if (!token) return showToast('សូមបញ្ចូល Bot Token!', 'warning');
      telegramConfig.enabled = true; telegramConfig.botToken = token;
      localStorage.setItem('stock_app_telegram_v16', JSON.stringify(telegramConfig));
      await sendTelegramNotification(`🔔 <b>TEST NOTIFICATION - Stock Inventory Ultimate Pro</b>
✅ Connected Successfully!`);
      showToast('បានផ្ញើសារសាកល្បងទៅ Telegram ជោគជ័យ!', 'success');
    }

    // --- START AUDIT SCANNER WITH AUTO-ZOOM ~2.0X ---
    function startAuditScannerCamera() {
      stopAllCamerasExcept('audit');
      auditScannerObj = new Html5Qrcode("audit-reader", h5opts());
      auditScannerObj.start({ facingMode: "environment" }, { fps: 25, qrbox: { width: 260, height: 150 } }, (code) => {
        if (!allowContinuousFrame('aud_' + code)) return;
        handleAuditCheck(code);
      }).then(() => {
        document.getElementById('btn-audit-cam-start').classList.add('hidden');
        document.getElementById('btn-audit-cam-stop').classList.remove('hidden');
        document.getElementById('audit-camera-idle').classList.add('hidden');
        document.getElementById('audit-overlay-controls').classList.remove('hidden');
        setZoomLevel('audit', 2.0);
      }).catch(err => showToast('Camera Error: ' + err, 'error'));
    }

    function stopAuditScannerCamera() {
      if (auditScannerObj) auditScannerObj.stop().then(() => {
        auditScannerObj = null;
        document.getElementById('btn-audit-cam-start').classList.remove('hidden');
        document.getElementById('btn-audit-cam-stop').classList.add('hidden');
        document.getElementById('audit-camera-idle').classList.remove('hidden');
        document.getElementById('audit-overlay-controls').classList.add('hidden');
      }).catch(() => {});
    }

    function handleAuditManualSubmit() {
      const inp = document.getElementById('audit-manual-barcode');
      if (!inp.value.trim()) return;
      handleAuditCheck(inp.value.trim());
      inp.value = '';
    }

    function handleAuditCheck(code) {
      const matched = inventoryData.find(i => i.barcode.toLowerCase() === code.toLowerCase());
      triggerScanFeedbackSound(matched ? `Verified ${code}` : `Not in system ${code}`, !matched);
      const badge = matched ? (matched.status === 'In Stock' ? '<span class="text-emerald-400 font-bold">✓ ត្រឹមត្រូវ</span>' : `<span class="text-amber-400">⚠ ${matched.status}</span>`) : '<span class="text-rose-400 font-bold">✕ មិនមានក្នុងប្រព័ន្ធ</span>';
      auditScannedList.unshift({ barcode: code, meta: matched ? `${matched.branch} (${matched.delivery || '-'})` : '-', badge, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
      document.getElementById('audit-count-badge').innerText = `រាប់បាន ${auditScannedList.length} មុខ`;
      document.getElementById('audit-log-tbody').innerHTML = auditScannedList.map(i => `<tr><td class="px-4 py-2 font-mono text-cyan-400">${i.barcode}</td><td class="px-4 py-2 text-slate-300">${i.meta}</td><td class="px-4 py-2">${i.badge}</td><td class="px-4 py-2 text-right text-slate-500">${i.time}</td></tr>`).join('');
    }
    function clearAuditLog() { auditScannedList = []; document.getElementById('audit-log-tbody').innerHTML = ''; document.getElementById('audit-count-badge').innerText = 'រាប់បាន 0 មុខ'; }

    function openReturnModal() { document.getElementById('modal-return-item').classList.remove('hidden'); }
    function closeReturnModal() { document.getElementById('modal-return-item').classList.add('hidden'); }
    function saveReturnRecord(e) {
      e.preventDefault();
      const branch = document.getElementById('ret-input-branch').value;
      const barcode = document.getElementById('ret-input-barcode').value.trim();
      const reason = document.getElementById('ret-input-reason').value.trim();
      const location = document.getElementById('ret-input-location').value.trim();
      const file = document.getElementById('ret-input-photo').files[0];
      const save = (img) => {
        returnsData.unshift({ branch, barcode, reason, location, photo: img || 'https://placehold.co/80x80/1e293b/white?text=Ret', date: new Date().toLocaleDateString('km-KH') });
        localStorage.setItem('stock_app_returns_v16', JSON.stringify(returnsData));
        renderReturnsTable(); closeReturnModal(); e.target.reset();
        showToast('បានកត់ត្រា Return ជោគជ័យ!', 'success');
      };
      if (file) { const r = new FileReader(); r.onload = ev => save(ev.target.result); r.readAsDataURL(file); } else save(null);
    }
    function renderReturnsTable() {
      const isAdmin = sessionUser?.role === 'Admin';
      const list = returnsData.filter(i => isAdmin || i.branch === sessionUser?.branch);
      document.getElementById('returns-tbody').innerHTML = list.map((item, idx) => `
        <tr>
          <td class="px-3 py-2"><img src="${item.photo}" class="w-9 h-9 rounded-lg object-cover"></td>
          <td class="px-3 py-2"><div class="font-mono text-cyan-400">${item.barcode}</div><div class="text-[10px] text-slate-400">${item.branch || ''}</div></td>
          <td class="px-3 py-2 text-rose-300">${item.reason} (${item.location})</td>
          <td class="px-3 py-2 text-right">${isAdmin ? `<button onclick="triggerDeleteModal({type:'RETURN', index:${idx}})" class="text-rose-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}</td>
        </tr>
      `).join('');
      lucide.createIcons();
    }

    function openCustomerIssueModal() { document.getElementById('modal-customer-issue').classList.remove('hidden'); }
    function closeCustomerIssueModal() { document.getElementById('modal-customer-issue').classList.add('hidden'); }
    function saveCustomerIssueRecord(e) {
      e.preventDefault();
      const branch = document.getElementById('cust-input-branch').value;
      const barcode = document.getElementById('cust-input-barcode').value.trim();
      const category = document.getElementById('cust-input-category').value;
      const note = document.getElementById('cust-input-note').value.trim();
      const file = document.getElementById('cust-input-photo').files[0];
      const save = (img) => {
        customerIssuesData.unshift({ branch, barcode, category, note, photo: img || 'https://placehold.co/80x80/1e293b/white?text=Issue', date: new Date().toLocaleDateString('km-KH') });
        localStorage.setItem('stock_app_cust_issues_v16', JSON.stringify(customerIssuesData));
        renderCustomerIssuesTable(); closeCustomerIssueModal(); e.target.reset();
        showToast('បានកត់ត្រាបញ្ហាទំនិញជោគជ័យ!', 'success');
      };
      if (file) { const r = new FileReader(); r.onload = ev => save(ev.target.result); r.readAsDataURL(file); } else save(null);
    }
    function renderCustomerIssuesTable() {
      const isAdmin = sessionUser?.role === 'Admin';
      const list = customerIssuesData.filter(i => isAdmin || i.branch === sessionUser?.branch);
      document.getElementById('customer-issues-tbody').innerHTML = list.map((item, idx) => `
        <tr>
          <td class="px-3 py-2"><img src="${item.photo}" class="w-9 h-9 rounded-lg object-cover"></td>
          <td class="px-3 py-2"><div class="font-mono text-cyan-400">${item.barcode}</div><div class="text-[10px] text-slate-400">${item.branch || ''}</div></td>
          <td class="px-3 py-2 text-amber-300">${item.category} - ${item.note}</td>
          <td class="px-3 py-2 text-right">${isAdmin ? `<button onclick="triggerDeleteModal({type:'ISSUE', index:${idx}})" class="text-rose-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}</td>
        </tr>
      `).join('');
      lucide.createIcons();
    }

    function renderRolesOptions() {
      ['new-user-role', 'signup-role'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = availableRoles.filter(r => id === 'new-user-role' || r !== 'Admin').map(r => `<option value="${r}">${r}</option>`).join('');
      });
    }
    function renderPendingUsersTable() {
      const pending = registeredUsers.filter(u => u.status === 'pending');
      document.getElementById('lbl-pending-badge-text').innerText = `${pending.length} រង់ចាំ`;
      const navBadge = document.getElementById('badge-pending-count');
      if (pending.length > 0) { navBadge.innerText = pending.length; navBadge.classList.remove('hidden'); } else navBadge.classList.add('hidden');
      document.getElementById('pending-users-tbody').innerHTML = pending.length === 0 ? `<tr><td colspan="5" class="px-3 py-3 text-center text-slate-500">មិនមានគណនីរង់ចាំ</td></tr>` : pending.map(u => `
        <tr>
          <td class="px-3 py-2">${u.name} <span class="text-slate-400 text-[10px]">(${u.email})</span></td>
          <td class="px-3 py-2 font-mono text-cyan-400">${u.user}</td>
          <td class="px-3 py-2 text-amber-300">${u.branch}</td>
          <td class="px-3 py-2">${u.role}</td>
          <td class="px-3 py-2 text-right space-x-1">
            <button onclick="approveUser('${u.id}')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[11px]">✓ Approve</button>
            <button onclick="rejectUser('${u.id}')" class="bg-rose-600 text-white px-2 py-1 rounded text-[11px]">✕</button>
          </td>
        </tr>
      `).join('');
    }
    function approveUser(id) {
      const u = registeredUsers.find(x => x.id === id);
      if (u) { u.status = 'approved'; localStorage.setItem('stock_app_users_v16', JSON.stringify(registeredUsers)); renderPendingUsersTable(); renderUsersTable(); showToast('Approve ជោគជ័យ!', 'success'); }
    }
    function rejectUser(id) {
      registeredUsers = registeredUsers.filter(x => x.id !== id);
      localStorage.setItem('stock_app_users_v16', JSON.stringify(registeredUsers)); renderPendingUsersTable(); renderUsersTable();
    }
    function addNewUser() {
      const name = document.getElementById('new-user-fullname').value.trim();
      const user = document.getElementById('new-user-username').value.trim();
      const pass = document.getElementById('new-user-pass').value.trim();
      const branch = document.getElementById('new-user-branch').value;
      const role = document.getElementById('new-user-role').value;
      if (!name || !user || !pass) return showToast('សូមបំពេញព័ត៌មានឱ្យគ្រប់!', 'warning');
      registeredUsers.push({ id: Date.now().toString(), name, user, pass, branch, role, status: 'approved' });
      localStorage.setItem('stock_app_users_v16', JSON.stringify(registeredUsers));
      renderUsersTable();
      document.getElementById('new-user-fullname').value = ''; document.getElementById('new-user-username').value = ''; document.getElementById('new-user-pass').value = '';
      showToast('បានបន្ថែមបុគ្គលិកជោគជ័យ!', 'success');
    }
    function renderUsersTable() {
      document.getElementById('users-tbody').innerHTML = registeredUsers.filter(u => u.status === 'approved').map(u => `
        <tr>
          <td class="px-3 py-2 font-medium">${u.name}</td>
          <td class="px-3 py-2 font-mono text-slate-400">${u.user}</td>
          <td class="px-3 py-2 text-cyan-300">${u.branch === 'ALL' ? 'គ្រប់សាខា' : u.branch}</td>
          <td class="px-3 py-2">${u.role}</td>
          <td class="px-3 py-2 text-right">${u.user !== 'admin' ? `<button onclick="triggerDeleteModal({type:'USER', id:'${u.id}'})" class="text-rose-400">លុប</button>` : 'Master'}</td>
        </tr>
      `).join('');
    }

    function stopAllCamerasExcept(keep) {
      if (keep !== 'main') stopScannerCamera();
      if (keep !== 'delivery') stopDeliveryScannerCamera();
      if (keep !== 'province') stopProvinceScannerCamera();
      if (keep !== 'audit') stopAuditScannerCamera();
    }

    function switchNavTab(tab) {
      if (tab === 'settings' && sessionUser?.role !== 'Admin') return showToast('មានតែ Admin ទើបអាចចូលបាន!', 'error');
      ['scanner', 'records', 'delivery', 'province', 'audit', 'returns', 'settings'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) {
          btn.className = t === tab
            ? "px-2.5 sm:px-3 py-1.5 rounded-lg bg-cyan-600 text-white transition flex items-center space-x-1 whitespace-nowrap relative"
            : "px-2.5 sm:px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition flex items-center space-x-1 whitespace-nowrap relative";
        }
      });
      if (tab === 'records') applyFilters();
      if (tab === 'province') renderProvinceShipmentsTable();
      localStorage.setItem('app_active_tab', tab);
    }

    function triggerDeleteModal(ctx) { pendingDeleteContext = ctx; document.getElementById('confirm-delete-modal').classList.remove('hidden'); }
    function closeDeleteModal() { pendingDeleteContext = null; document.getElementById('confirm-delete-modal').classList.add('hidden'); }
    document.getElementById('btn-confirm-delete-action').onclick = () => {
      if (!pendingDeleteContext) return;
      const { type, barcode, index, id } = pendingDeleteContext;
      if (type === 'STOCK') { inventoryData = inventoryData.filter(i => i.barcode !== barcode); saveInventoryData(); applyFilters(); updateAnalyticsDashboard(); }
      else if (type === 'PROVINCE') {
        if (activeProvinceShipmentId === id) activeProvinceShipmentId = null;
        provinceShipmentsData = provinceShipmentsData.filter(p => p.id !== id);
        localStorage.setItem('stock_app_province_v16', JSON.stringify(provinceShipmentsData));
        renderActiveProvinceDraft(); renderProvinceShipmentsTable();
      }
      else if (type === 'RETURN') { returnsData.splice(index, 1); localStorage.setItem('stock_app_returns_v16', JSON.stringify(returnsData)); renderReturnsTable(); }
      else if (type === 'ISSUE') { customerIssuesData.splice(index, 1); localStorage.setItem('stock_app_cust_issues_v16', JSON.stringify(customerIssuesData)); renderCustomerIssuesTable(); }
      else if (type === 'USER') { registeredUsers = registeredUsers.filter(u => u.id !== id); localStorage.setItem('stock_app_users_v16', JSON.stringify(registeredUsers)); renderUsersTable(); }
      closeDeleteModal(); showToast('បានលុបទិន្នន័យរួចរាល់!', 'info');
    };

    function exportFilteredToExcel() {
      if (!currentFilteredList.length) return showToast('មិនមានទិន្នន័យเพื่อ Export ទេ!', 'warning');
      const rows = currentFilteredList.map((i, idx) => ({
        "No": idx + 1, "Barcode": i.barcode, "Branch": i.branch, "Delivery": i.delivery || '-', "Status": i.status, "Stock-In Date": i.inDate, "Recorded By": i.inBy, "Opened Date": i.openDate || '-'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock_Report");
      XLSX.writeFile(wb, `Stock_Report_${getTodayISO()}.xlsx`);
    }

    function openPrintModal(code, branch, delivery) {
      document.getElementById('lbl-sticker-appname').innerText = systemConfig.title;
      document.getElementById('lbl-sticker-branch').innerText = `Branch: ${branch || 'Main'}`;
      document.getElementById('lbl-sticker-delivery').innerText = `Delivery: ${delivery || '-'}`;
      document.getElementById('lbl-sticker-code').innerText = code;
      document.getElementById('lbl-sticker-date').innerText = `Date: ${new Date().toLocaleDateString()}`;
      try { JsBarcode("#barcode-canvas", code, { format: "CODE128", width: 1.8, height: 45, displayValue: false }); } catch(e) {}
      const qrBox = document.getElementById('qrcode-box'); qrBox.innerHTML = '';
      new QRCode(qrBox, { text: code, width: 70, height: 70 });
      document.getElementById('print-modal-container').classList.remove('hidden');
    }
    function closePrintModal() { document.getElementById('print-modal-container').classList.add('hidden'); }

    function startEvidenceScanner(targetId) {
      document.getElementById('evidence-scanner-modal').classList.remove('hidden');
      evidenceScannerObj = new Html5Qrcode("evidence-reader", h5opts());
      evidenceScannerObj.start({ facingMode: "environment" }, { fps: 25, qrbox: { width: 250, height: 150 } }, code => {
        document.getElementById(targetId).value = code; triggerScanFeedbackSound(code, false); stopEvidenceScanner();
      }).catch(() => {});
    }
    function stopEvidenceScanner() {
      if (evidenceScannerObj) evidenceScannerObj.stop().then(() => document.getElementById('evidence-scanner-modal').classList.add('hidden')).catch(() => {});
      else document.getElementById('evidence-scanner-modal').classList.add('hidden');
    }

    function applyBrandingUI() {
      document.getElementById('app-title-display').innerText = systemConfig.title;
      document.getElementById('login-app-title').innerText = systemConfig.title;
      if (document.getElementById('cfg-app-title')) document.getElementById('cfg-app-title').value = systemConfig.title;
    }
    function saveSystemSettings() {
      const title = document.getElementById('cfg-app-title').value.trim();
      const newPass = document.getElementById('cfg-new-admin-pass').value.trim();
      if (title) systemConfig.title = title;
      if (newPass) systemConfig.adminPass = newPass;
      localStorage.setItem('stock_app_config_v16', JSON.stringify(systemConfig));
      applyBrandingUI();
      showToast('បានរក្សាទុកការកំណត់!', 'success');
    }
    function initThemeMode() {
      document.documentElement.classList.toggle('dark', appTheme === 'dark');
      document.documentElement.classList.toggle('light', appTheme !== 'dark');
    }
    function toggleThemeMode() { appTheme = appTheme === 'dark' ? 'light' : 'dark'; localStorage.setItem('app_theme_pref', appTheme); initThemeMode(); }
    function clearFilters() {
      document.getElementById('filter-search-input').value = '';
      document.getElementById('filter-date-input').value = '';
      document.getElementById('filter-status-select').value = 'ALL';
      applyFilters();
    }
    function saveInventoryData() { localStorage.setItem('stock_app_items_v16', JSON.stringify(inventoryData)); }
    function triggerLogoutModal() { document.getElementById('confirm-logout-modal').classList.remove('hidden'); }
    function closeLogoutModal() { document.getElementById('confirm-logout-modal').classList.add('hidden'); }
    function executeLogout() { closeLogoutModal(); stopAllCamerasExcept('none'); sessionUser = null; sessionStorage.removeItem('active_session_user'); document.getElementById('login-modal').classList.remove('opacity-0', 'pointer-events-none'); }
    function showToast(msg, type = 'info') {
      const wrap = document.getElementById('toast-wrapper');
      const div = document.createElement('div');
      const colors = { success: 'bg-emerald-950 border-emerald-500 text-emerald-300', error: 'bg-rose-950 border-rose-500 text-rose-300', warning: 'bg-amber-950 border-amber-500 text-amber-300', info: 'bg-cyan-950 border-cyan-500 text-cyan-300' };
      div.className = `p-3 rounded-2xl border text-xs shadow-xl ${colors[type] || colors.info} modal-pop`;
      div.innerText = msg;
      wrap.appendChild(div);
      setTimeout(() => div.remove(), 2600);
    }
