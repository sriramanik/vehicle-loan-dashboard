let cars = [];
let loanTargetCarId = null;
let returnTargetCarId = null;
let verifiedStaff = null; // for loan flow
let verifiedReturnStaff = null; // for return flow

const ALLOCATIONS = [
  'LSM / LMM',
  'B1 ENGINEER / TECHNICIAN',
  'B2 ENGINEER',
  'CAT A TECHNICIAN',
  'CABIN TEAM'
];

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' GST';
}

function updateDateLabel() {
  const now = new Date();
  document.getElementById('dateLabel').textContent = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' (Dubai)';
}

async function updateDutyPill() {
  try {
    const res = await fetch('/api/loans/duty/current');
    const duty = await res.json();
    const pill = document.getElementById('dutyPill');
    pill.classList.toggle('night', !duty.isDay);
    const range = duty.isDay ? '06:00–18:00' : '18:00–06:00';
    document.getElementById('dutyLabel').innerHTML = duty.team
      ? `<strong>Team ${duty.team}</strong> · ${duty.isDay ? 'Day' : 'Night'} shift · ${range}`
      : '--';
  } catch (e) {
    // silently ignore - dashboard still works without the duty pill
  }
}

updateDateLabel();
updateDutyPill();
setInterval(updateDateLabel, 30000);
setInterval(updateDutyPill, 30000);

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  resetLoanModal();
  resetReturnModal();
}

async function loadCars() {
  const res = await fetch('/api/cars');
  cars = await res.json();
  renderCars();
}

function renderCars() {
  const grid = document.getElementById('carGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  if (cars.length === 0) {
    empty.style.display = 'block';
    document.getElementById('countAvailable').textContent = 0;
    document.getElementById('countLoaned').textContent = 0;
    document.getElementById('countMaintenance').textContent = 0;
    return;
  }
  empty.style.display = 'none';

  let available = 0, loaned = 0, maintenance = 0;
  cars.forEach(car => {
    if (car.status === 'available') available++;
    else if (car.status === 'loaned') loaned++;
    else maintenance++;
  });
  document.getElementById('countAvailable').textContent = available;
  document.getElementById('countLoaned').textContent = loaned;
  document.getElementById('countMaintenance').textContent = maintenance;

  // Group cars by fixed allocation categories, with an "Unassigned" bucket for anything else
  const groups = {};
  ALLOCATIONS.forEach(a => { groups[a] = []; });
  groups['Unassigned'] = [];

  cars.forEach(car => {
    const key = ALLOCATIONS.includes(car.allocation) ? car.allocation : 'Unassigned';
    groups[key].push(car);
  });

  const orderedKeys = [...ALLOCATIONS, 'Unassigned'];

  orderedKeys.forEach(key => {
    const carsInGroup = groups[key];
    if (carsInGroup.length === 0) return;

    const section = document.createElement('div');
    section.className = 'allocation-section';

    const header = document.createElement('div');
    header.className = 'allocation-header';
    header.innerHTML = `<span>${escapeHtml(key)}</span><span class="badge-count">${carsInGroup.length}</span>`;
    section.appendChild(header);

    const sectionGrid = document.createElement('div');
    sectionGrid.className = 'car-grid';

    carsInGroup.forEach(car => sectionGrid.appendChild(buildCarCard(car)));

    section.appendChild(sectionGrid);
    grid.appendChild(section);
  });
}

function buildCarCard(car) {
  const card = document.createElement('div');
  card.className = 'car-card';

  let badgeHtml = `<span class="status-badge ${car.status}">${car.status === 'available' ? 'Available' : car.status === 'loaned' ? 'Loaned Out' : 'Out of Service'}</span>`;

  let loanInfoHtml = '';
  let actionHtml = '';

  if (car.status === 'loaned' && car.loaned_to_staff_number) {
    loanInfoHtml = `<div class="loan-info">
      Loaned to <strong>${car.loaned_to_staff_number} · ${escapeHtml(car.loaned_to_name)}</strong><br>
      Since ${fmtTime(car.loaned_at)} &middot; ${car.loan_shift || ''}
    </div>`;
    actionHtml = `<button class="btn btn-danger btn-block" onclick="openReturnModal(${car.id})">Return this car</button>`;
  } else if (car.status === 'available') {
    actionHtml = `<button class="btn btn-primary btn-block" onclick="openLoanModal(${car.id})">Loan this car</button>`;
  } else {
    loanInfoHtml = `<div class="loan-info">Not available for loan</div>`;
  }

  card.innerHTML = `
    <div class="row1">
      <div>
        <div class="car-num">Car #${escapeHtml(car.car_number)}</div>
        <div class="reg-num">${escapeHtml(car.reg_number)}</div>
      </div>
      ${badgeHtml}
    </div>
    ${loanInfoHtml}
    ${actionHtml}
  `;
  return card;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------------- LOAN FLOW ----------------

function openLoanModal(carId) {
  loanTargetCarId = carId || null;
  const select = document.getElementById('loanCarSelect');
  const field = document.getElementById('carSelectField');

  const availableCars = cars.filter(c => c.status === 'available');

  if (carId) {
    const car = cars.find(c => c.id === carId);
    field.style.display = 'none';
    document.getElementById('loanCarSub').textContent = `Car ${car.reg_number} (#${car.car_number})`;
  } else {
    field.style.display = 'block';
    document.getElementById('loanCarSub').textContent = 'Select a car and enter your staff number';
    select.innerHTML = availableCars.map(c => `<option value="${c.id}">#${c.car_number} · ${c.reg_number} (${c.allocation || ''})</option>`).join('');
  }

  document.getElementById('loanModalOverlay').classList.add('open');
}

function resetLoanModal() {
  loanTargetCarId = null;
  verifiedStaff = null;
  document.getElementById('loanStaffNumber').value = '';
  document.getElementById('loanStaffConfirm').innerHTML = '';
  document.getElementById('newStaffNameField').style.display = 'none';
  document.getElementById('newStaffName').value = '';
  document.getElementById('loanError').style.display = 'none';
}

let staffCheckTimeout;
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loanStaffNumber').addEventListener('input', (e) => {
    clearTimeout(staffCheckTimeout);
    const val = e.target.value.trim();
    verifiedStaff = null;
    document.getElementById('loanStaffConfirm').innerHTML = '';
    document.getElementById('newStaffNameField').style.display = 'none';
    if (!val) return;
    staffCheckTimeout = setTimeout(() => checkStaff(val), 400);
  });

  document.getElementById('returnStaffNumber').addEventListener('input', (e) => {
    clearTimeout(staffCheckTimeout);
    const val = e.target.value.trim();
    verifiedReturnStaff = null;
    document.getElementById('returnStaffConfirm').innerHTML = '';
    if (!val) return;
    staffCheckTimeout = setTimeout(() => checkReturnStaff(val), 400);
  });
});

async function checkStaff(staffNumber) {
  const res = await fetch(`/api/staff/verify/${encodeURIComponent(staffNumber)}`);
  const data = await res.json();
  const confirmDiv = document.getElementById('loanStaffConfirm');
  const newField = document.getElementById('newStaffNameField');

  if (data.found) {
    verifiedStaff = data.staff;
    newField.style.display = 'none';
    confirmDiv.innerHTML = `<div class="staff-confirm">&#10003; ${escapeHtml(data.staff.name)}</div>`;
  } else {
    verifiedStaff = null;
    confirmDiv.innerHTML = `<div class="staff-confirm new">Staff number not found. Enter name below to register it.</div>`;
    newField.style.display = 'block';
  }
}

async function checkReturnStaff(staffNumber) {
  const res = await fetch(`/api/staff/verify/${encodeURIComponent(staffNumber)}`);
  const data = await res.json();
  const confirmDiv = document.getElementById('returnStaffConfirm');
  if (data.found) {
    verifiedReturnStaff = data.staff;
    confirmDiv.innerHTML = `<div class="staff-confirm">&#10003; ${escapeHtml(data.staff.name)}</div>`;
  } else {
    verifiedReturnStaff = null;
    confirmDiv.innerHTML = `<div class="staff-confirm new">Staff number not found. You can still return the car, but consider adding this staff number in Admin.</div>`;
  }
}

async function submitLoan() {
  const errDiv = document.getElementById('loanError');
  errDiv.style.display = 'none';

  const carId = loanTargetCarId || parseInt(document.getElementById('loanCarSelect').value, 10);
  const staffNumber = document.getElementById('loanStaffNumber').value.trim();

  if (!carId) { errDiv.textContent = 'No available cars to loan.'; errDiv.style.display = 'block'; return; }
  if (!staffNumber) { errDiv.textContent = 'Enter your staff number.'; errDiv.style.display = 'block'; return; }

  let staffName;
  if (verifiedStaff) {
    staffName = verifiedStaff.name;
  } else {
    staffName = document.getElementById('newStaffName').value.trim();
    if (!staffName) { errDiv.textContent = 'Staff number not found. Please enter your name to register it.'; errDiv.style.display = 'block'; return; }
    // register new staff first
    const addRes = await fetch('/api/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_number: staffNumber, name: staffName })
    });
    if (!addRes.ok) {
      const err = await addRes.json();
      errDiv.textContent = err.error || 'Could not register staff number.';
      errDiv.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('loanSubmitBtn');
  btn.disabled = true; btn.textContent = 'Processing...';

  const res = await fetch('/api/loans/issue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ car_id: carId, staff_number: staffNumber, staff_name: staffName })
  });

  btn.disabled = false; btn.textContent = 'Confirm loan';

  if (res.ok) {
    closeModal('loanModalOverlay');
    showToast('Car loaned successfully', 'success');
    loadCars();
  } else {
    const err = await res.json();
    errDiv.textContent = err.error || 'Something went wrong.';
    errDiv.style.display = 'block';
  }
}

// ---------------- RETURN FLOW ----------------

function openReturnModal(carId) {
  returnTargetCarId = carId;
  const car = cars.find(c => c.id === carId);
  document.getElementById('returnCarSub').textContent = `Car ${car.reg_number} (#${car.car_number})`;
  document.getElementById('returnLoanInfo').innerHTML = `Currently loaned to <strong>${car.loaned_to_staff_number} · ${escapeHtml(car.loaned_to_name)}</strong><br>Since ${fmtTime(car.loaned_at)}`;
  document.getElementById('returnStaffNumber').value = car.loaned_to_staff_number || '';
  if (car.loaned_to_staff_number) checkReturnStaff(car.loaned_to_staff_number);
  document.getElementById('returnModalOverlay').classList.add('open');
}

function resetReturnModal() {
  returnTargetCarId = null;
  verifiedReturnStaff = null;
  document.getElementById('returnStaffNumber').value = '';
  document.getElementById('returnStaffConfirm').innerHTML = '';
  document.getElementById('returnError').style.display = 'none';
}

async function submitReturn() {
  const errDiv = document.getElementById('returnError');
  errDiv.style.display = 'none';

  const staffNumber = document.getElementById('returnStaffNumber').value.trim();
  if (!staffNumber) { errDiv.textContent = 'Enter the returning staff number.'; errDiv.style.display = 'block'; return; }

  const btn = document.getElementById('returnSubmitBtn');
  btn.disabled = true; btn.textContent = 'Processing...';

  const res = await fetch('/api/loans/return', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      car_id: returnTargetCarId,
      returned_by_staff_number: staffNumber,
      returned_by_name: verifiedReturnStaff ? verifiedReturnStaff.name : undefined
    })
  });

  btn.disabled = false; btn.textContent = 'Confirm return';

  if (res.ok) {
    closeModal('returnModalOverlay');
    showToast('Car returned successfully', 'success');
    loadCars();
  } else {
    const err = await res.json();
    errDiv.textContent = err.error || 'Something went wrong.';
    errDiv.style.display = 'block';
  }
}

loadCars();
setInterval(loadCars, 20000);
