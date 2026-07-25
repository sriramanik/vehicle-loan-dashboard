let adminPassword = sessionStorage.getItem('adminPassword') || '';

const ALLOCATIONS = [
  'LSM / LMM',
  'B1 ENGINEER / TECHNICIAN',
  'B2 ENGINEER',
  'CAT A TECHNICIAN',
  'CABIN TEAM'
];

let editingCarId = null;
let editingStaffNumber = null;

function closeAdminModal(id) {
  document.getElementById(id).classList.remove('open');
}

function populateAllocationSelects() {
  const opts = ALLOCATIONS.map(a => `<option value="${a}">${a}</option>`).join('');
  document.getElementById('newAllocation').innerHTML = opts;
  document.getElementById('editAllocation').innerHTML = opts;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' GST';
}

async function adminFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['x-admin-password'] = adminPassword;
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem('adminPassword');
    showLogin();
    throw new Error('Unauthorized');
  }
  return res;
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  populateAllocationSelects();
  loadCars();
  loadStaff();
  loadRecords();
}

async function login() {
  const pw = document.getElementById('passwordInput').value;
  const errDiv = document.getElementById('loginError');
  errDiv.style.display = 'none';

  const res = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  });

  if (res.ok) {
    adminPassword = pw;
    sessionStorage.setItem('adminPassword', pw);
    showApp();
  } else {
    errDiv.textContent = 'Incorrect password.';
    errDiv.style.display = 'block';
  }
}

function logout() {
  sessionStorage.removeItem('adminPassword');
  adminPassword = '';
  showLogin();
}

// Check existing session on load
if (adminPassword) {
  adminFetch('/api/admin/cars').then(res => { if (res.ok) showApp(); else showLogin(); }).catch(() => showLogin());
} else {
  showLogin();
}

// Tabs
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
});

// ---------------- CARS ----------------
function openAddCarForm() {
  document.getElementById('addCarForm').style.display = 'block';
}

async function submitAddCar() {
  const car_number = document.getElementById('newCarNumber').value.trim();
  const reg_number = document.getElementById('newRegNumber').value.trim();
  const allocation = document.getElementById('newAllocation').value.trim();
  if (!car_number || !reg_number) return showToast('Car # and Reg # are required', 'error');

  const res = await adminFetch('/api/admin/cars', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ car_number, reg_number, allocation })
  });

  if (res.ok) {
    showToast('Car added');
    document.getElementById('newCarNumber').value = '';
    document.getElementById('newRegNumber').value = '';
    document.getElementById('newAllocation').value = '';
    document.getElementById('addCarForm').style.display = 'none';
    loadCars();
  } else {
    const err = await res.json();
    showToast(err.error || 'Failed to add car', 'error');
  }
}

let allCarsCache = [];

async function loadCars() {
  const res = await adminFetch('/api/admin/cars');
  const cars = await res.json();
  allCarsCache = cars;

  // also need loan info for "loaned to" column -> fetch public cars endpoint which joins active loan
  const carsRes = await fetch('/api/cars');
  const carsWithLoans = await carsRes.json();
  const loanMap = {};
  carsWithLoans.forEach(c => { loanMap[c.id] = c; });

  const tbody = document.getElementById('carsTableBody');
  tbody.innerHTML = cars.map(car => {
    const withLoan = loanMap[car.id] || {};
    const loanedTo = car.status === 'loaned' && withLoan.loaned_to_staff_number
      ? `${escapeHtml(withLoan.loaned_to_staff_number)} · ${escapeHtml(withLoan.loaned_to_name)}` : '—';
    return `
      <tr>
        <td>${escapeHtml(car.car_number)}</td>
        <td>${escapeHtml(car.reg_number)}</td>
        <td>${escapeHtml(car.allocation || '')}</td>
        <td>
          <select class="filter-input" onchange="updateCarStatus(${car.id}, this.value)" ${car.status === 'loaned' ? 'disabled' : ''}>
            <option value="available" ${car.status === 'available' ? 'selected' : ''}>Available</option>
            <option value="maintenance" ${car.status === 'maintenance' ? 'selected' : ''}>Out of Service</option>
            <option value="loaned" ${car.status === 'loaned' ? 'selected' : ''}>Loaned Out</option>
          </select>
        </td>
        <td>${loanedTo}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="openEditCarModal(${car.id})">Edit</button>
          <button class="btn btn-outline btn-sm" onclick="deleteCar(${car.id})">Delete</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No cars yet</td></tr>`;
}

function openEditCarModal(carId) {
  const car = allCarsCache.find(c => c.id === carId);
  if (!car) return;
  editingCarId = car.id;
  document.getElementById('editCarNumber').value = car.car_number;
  document.getElementById('editRegNumber').value = car.reg_number;
  document.getElementById('editAllocation').value = car.allocation || ALLOCATIONS[0];
  document.getElementById('editCarError').style.display = 'none';
  document.getElementById('editCarModalOverlay').classList.add('open');
}

async function submitEditCar() {
  const errDiv = document.getElementById('editCarError');
  errDiv.style.display = 'none';
  const car_number = document.getElementById('editCarNumber').value.trim();
  const reg_number = document.getElementById('editRegNumber').value.trim();
  const allocation = document.getElementById('editAllocation').value;
  if (!car_number || !reg_number) { errDiv.textContent = 'Car # and Reg # are required'; errDiv.style.display = 'block'; return; }

  const res = await adminFetch(`/api/admin/cars/${editingCarId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ car_number, reg_number, allocation })
  });
  if (res.ok) {
    showToast('Car updated');
    closeAdminModal('editCarModalOverlay');
    loadCars();
  } else {
    const err = await res.json();
    errDiv.textContent = err.error || 'Update failed';
    errDiv.style.display = 'block';
  }
}

async function updateCarStatus(id, status) {
  const res = await adminFetch(`/api/admin/cars/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (res.ok) {
    showToast('Status updated');
  } else {
    const err = await res.json();
    showToast(err.error || 'Update failed', 'error');
  }
  loadCars();
}

async function deleteCar(id) {
  if (!confirm('Delete this car? This cannot be undone.')) return;
  const res = await adminFetch(`/api/admin/cars/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Car deleted'); loadCars(); }
  else { const err = await res.json(); showToast(err.error || 'Delete failed', 'error'); }
}

// ---------------- STAFF ----------------
let allStaffCache = [];

async function loadStaff() {
  const res = await adminFetch('/api/admin/staff');
  const staff = await res.json();
  allStaffCache = staff;
  const tbody = document.getElementById('staffTableBody');
  tbody.innerHTML = staff.map(s => `
    <tr>
      <td>${escapeHtml(s.staff_number)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="openEditStaffModal('${escapeHtml(s.staff_number)}')">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="deleteStaff('${escapeHtml(s.staff_number)}')">Delete</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="3" style="text-align:center; color:var(--text-dim);">No staff yet</td></tr>`;
}

function openEditStaffModal(staffNumber) {
  const staff = allStaffCache.find(s => s.staff_number === staffNumber);
  if (!staff) return;
  editingStaffNumber = staffNumber;
  document.getElementById('editStaffSub').textContent = `Staff #${staffNumber}`;
  document.getElementById('editStaffName').value = staff.name;
  document.getElementById('editStaffError').style.display = 'none';
  document.getElementById('editStaffModalOverlay').classList.add('open');
}

async function submitEditStaff() {
  const errDiv = document.getElementById('editStaffError');
  errDiv.style.display = 'none';
  const name = document.getElementById('editStaffName').value.trim();
  if (!name) { errDiv.textContent = 'Name is required'; errDiv.style.display = 'block'; return; }

  const res = await adminFetch(`/api/admin/staff/${encodeURIComponent(editingStaffNumber)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    showToast('Staff updated');
    closeAdminModal('editStaffModalOverlay');
    loadStaff();
  } else {
    const err = await res.json();
    errDiv.textContent = err.error || 'Update failed';
    errDiv.style.display = 'block';
  }
}

async function submitAddStaff() {
  const staff_number = document.getElementById('newStaffNumber').value.trim();
  const name = document.getElementById('newStaffNameInput').value.trim();
  if (!staff_number || !name) return showToast('Staff number and name required', 'error');

  const res = await adminFetch('/api/admin/staff', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staff_number, name })
  });
  if (res.ok) {
    showToast('Staff added');
    document.getElementById('newStaffNumber').value = '';
    document.getElementById('newStaffNameInput').value = '';
    loadStaff();
  } else {
    const err = await res.json();
    showToast(err.error || 'Failed to add staff', 'error');
  }
}

async function deleteStaff(staffNumber) {
  if (!confirm('Delete this staff member?')) return;
  const res = await adminFetch(`/api/admin/staff/${encodeURIComponent(staffNumber)}`, { method: 'DELETE' });
  if (res.ok) { showToast('Staff deleted'); loadStaff(); }
}

async function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);

  const res = await adminFetch('/api/admin/staff/import', { method: 'POST', body: formData });
  if (res.ok) {
    const data = await res.json();
    showToast(`Imported ${data.imported} staff (${data.skipped} skipped)`);
    loadStaff();
  } else {
    const err = await res.json();
    showToast(err.error || 'Import failed', 'error');
  }
  event.target.value = '';
}

// ---------------- RECORDS ----------------
async function loadRecords() {
  const date = document.getElementById('filterDate').value;
  const team = document.getElementById('filterTeam').value;
  const staff = document.getElementById('filterStaff').value.trim();
  const car = document.getElementById('filterCar').value.trim();

  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (team) params.set('team', team);
  if (staff) params.set('staff_number', staff);
  if (car) params.set('car_number', car);

  const res = await adminFetch(`/api/admin/loans?${params.toString()}`);
  const loans = await res.json();

  const tbody = document.getElementById('recordsTableBody');
  tbody.innerHTML = loans.map(l => `
    <tr>
      <td>${l.shift_date}</td>
      <td>${l.shift}</td>
      <td>${l.duty_team ? 'Team ' + escapeHtml(l.duty_team) : '—'}</td>
      <td>#${escapeHtml(l.car_number)} · ${escapeHtml(l.reg_number)}</td>
      <td>${escapeHtml(l.staff_number)} · ${escapeHtml(l.staff_name)}</td>
      <td>${fmtTime(l.issued_at)}</td>
      <td>${fmtTime(l.returned_at)}</td>
      <td>${l.returned_by_staff_number ? escapeHtml(l.returned_by_staff_number) + ' · ' + escapeHtml(l.returned_by_name) : '—'}</td>
      <td><span class="status-badge ${l.status === 'active' ? 'loaned' : 'available'}">${l.status === 'active' ? 'Loaned Out' : 'Returned'}</span></td>
      <td>${l.status === 'active' ? `<button class="btn btn-outline btn-sm" onclick="forceReturn(${l.id})">Force return</button>` : '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="10" style="text-align:center; color:var(--text-dim);">No records found</td></tr>`;
}

async function forceReturn(loanId) {
  if (!confirm('Mark this loan as returned? Use this only to correct a record.')) return;
  const res = await adminFetch(`/api/admin/loans/${loanId}/force-return`, { method: 'POST' });
  if (res.ok) { showToast('Marked as returned'); loadRecords(); loadCars(); }
}

function exportCsv() {
  const date = document.getElementById('filterDate').value;
  const team = document.getElementById('filterTeam').value;
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (team) params.set('team', team);
  const url = `/api/admin/loans/export?${params.toString()}`;

  // fetch with auth header then trigger download
  adminFetch(url).then(async res => {
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'vehicle_loans_export.csv';
    link.click();
  });
}
