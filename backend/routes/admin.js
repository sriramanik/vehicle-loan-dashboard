const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const adminAuth = require('../adminAuth');

const upload = multer({ storage: multer.memoryStorage() });

function formatUAE(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' GST';
}

// Login (just validates password against env var)
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

// Everything below requires the admin header
router.use(adminAuth);

// ---- CARS ----
router.get('/cars', (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY car_number').all());
});

router.post('/cars', (req, res) => {
  const { car_number, reg_number, allocation, status } = req.body;
  if (!car_number || !reg_number) return res.status(400).json({ error: 'car_number and reg_number required' });
  const result = db.prepare(`
    INSERT INTO cars (car_number, reg_number, allocation, status) VALUES (?, ?, ?, ?)
  `).run(car_number.trim(), reg_number.trim(), allocation || null, status || 'available');
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/cars/:id', (req, res) => {
  const { car_number, reg_number, allocation, status } = req.body;
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  // If forcing status to maintenance while there's an active loan, block it
  if (status === 'maintenance' && car.status === 'loaned') {
    const activeLoan = db.prepare(`SELECT * FROM loans WHERE car_id = ? AND status='active'`).get(car.id);
    if (activeLoan) return res.status(409).json({ error: 'Car currently on loan. Return it before setting to maintenance.' });
  }

  db.prepare(`
    UPDATE cars SET car_number = ?, reg_number = ?, allocation = ?, status = ? WHERE id = ?
  `).run(
    car_number ?? car.car_number,
    reg_number ?? car.reg_number,
    allocation ?? car.allocation,
    status ?? car.status,
    req.params.id
  );
  res.json({ success: true });
});

router.delete('/cars/:id', (req, res) => {
  const activeLoan = db.prepare(`SELECT * FROM loans WHERE car_id = ? AND status='active'`).get(req.params.id);
  if (activeLoan) return res.status(409).json({ error: 'Cannot delete a car that is currently on loan' });
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---- STAFF ----
router.get('/staff', (req, res) => {
  res.json(db.prepare('SELECT * FROM staff ORDER BY name').all());
});

router.post('/staff', (req, res) => {
  const { staff_number, name } = req.body;
  if (!staff_number || !name) return res.status(400).json({ error: 'staff_number and name required' });
  try {
    db.prepare('INSERT INTO staff (staff_number, name) VALUES (?, ?)').run(String(staff_number).trim(), String(name).trim());
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Staff number already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/staff/:staffNumber', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE staff SET name = ? WHERE staff_number = ?').run(name, req.params.staffNumber);
  res.json({ success: true });
});

router.delete('/staff/:staffNumber', (req, res) => {
  db.prepare('DELETE FROM staff WHERE staff_number = ?').run(req.params.staffNumber);
  res.json({ success: true });
});

// CSV import: column A = staff_number, column B = name. No header assumed, but skips a row if it looks like a header.
router.post('/staff/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let records;
  try {
    records = parse(req.file.buffer, { skip_empty_lines: true });
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + err.message });
  }

  const insert = db.prepare('INSERT INTO staff (staff_number, name) VALUES (?, ?) ON CONFLICT(staff_number) DO UPDATE SET name = excluded.name');
  let imported = 0;
  let skipped = 0;

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const staffNumber = (row[0] || '').toString().trim();
      const name = (row[1] || '').toString().trim();
      if (!staffNumber || !name) { skipped++; continue; }
      // skip a probable header row
      if (imported === 0 && skipped === 0 && /staff.*number/i.test(staffNumber)) { skipped++; continue; }
      insert.run(staffNumber, name);
      imported++;
    }
  });
  tx(records);

  res.json({ success: true, imported, skipped });
});

// ---- LOANS (history / manual correction) ----
router.get('/loans', (req, res) => {
  const { date, shift, staff_number, car_number, status, team } = req.query;
  let query = 'SELECT * FROM loans WHERE 1=1';
  const params = [];
  if (date) { query += ' AND shift_date = ?'; params.push(date); }
  if (shift) { query += ' AND shift LIKE ?'; params.push(`%${shift}%`); }
  if (staff_number) { query += ' AND staff_number = ?'; params.push(staff_number); }
  if (car_number) { query += ' AND car_number = ?'; params.push(car_number); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (team) { query += ' AND duty_team = ?'; params.push(team); }
  query += ' ORDER BY issued_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Manual force-return (admin correction, e.g. staff forgot to return in system)
router.post('/loans/:id/force-return', (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const returnedAt = new Date().toISOString();
  db.prepare(`
    UPDATE loans SET status='returned', returned_at=?, returned_by_staff_number=?, returned_by_name=?
    WHERE id = ?
  `).run(returnedAt, loan.staff_number, loan.staff_name, loan.id);
  db.prepare(`UPDATE cars SET status='available' WHERE id = ?`).run(loan.car_id);
  res.json({ success: true });
});

// Export CSV
router.get('/loans/export', (req, res) => {
  const { date, shift, team } = req.query;
  let query = 'SELECT * FROM loans WHERE 1=1';
  const params = [];
  if (date) { query += ' AND shift_date = ?'; params.push(date); }
  if (shift) { query += ' AND shift LIKE ?'; params.push(`%${shift}%`); }
  if (team) { query += ' AND duty_team = ?'; params.push(team); }
  query += ' ORDER BY issued_at DESC';
  const loans = db.prepare(query).all(...params);

  const header = ['Shift Date','Shift','Team','Car #','Reg #','Issued To (Staff #)','Issued To (Name)','Issued At (UAE)','Returned At (UAE)','Returned By (Staff #)','Returned By (Name)','Status'];
  const rows = loans.map(l => [
    l.shift_date, l.shift, l.duty_team || '', l.car_number, l.reg_number,
    l.staff_number, l.staff_name, formatUAE(l.issued_at), formatUAE(l.returned_at), l.returned_by_staff_number || '', l.returned_by_name || '', l.status
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="vehicle_loans_export.csv"`);
  res.send(csv);
});

module.exports = router;
