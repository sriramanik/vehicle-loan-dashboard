const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all cars with active loan info if loaned
router.get('/', (req, res) => {
  const cars = db.prepare(`
    SELECT c.*,
      l.id as active_loan_id, l.staff_number as loaned_to_staff_number,
      l.staff_name as loaned_to_name, l.issued_at as loaned_at, l.shift as loan_shift
    FROM cars c
    LEFT JOIN loans l ON l.car_id = c.id AND l.status = 'active'
    ORDER BY c.car_number
  `).all();
  res.json(cars);
});

// GET only available cars (for loan dropdown)
router.get('/available', (req, res) => {
  const cars = db.prepare(`SELECT * FROM cars WHERE status = 'available' ORDER BY car_number`).all();
  res.json(cars);
});

// Add or replace a remark on a car (open to anyone using the dashboard - matches the paper
// process where any staff member could flag an issue on the sheet)
router.put('/:id/remark', (req, res) => {
  const { staff_number, staff_name, remark_text } = req.body;
  if (!remark_text || !remark_text.trim()) {
    return res.status(400).json({ error: 'remark_text is required' });
  }
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  db.prepare(`
    UPDATE cars SET remark_text = ?, remark_by_staff_number = ?, remark_by_name = ?, remark_at = ?
    WHERE id = ?
  `).run(remark_text.trim(), staff_number || null, staff_name || null, new Date().toISOString(), car.id);

  res.json({ success: true });
});

// Clear a remark from a car
router.delete('/:id/remark', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });

  db.prepare(`
    UPDATE cars SET remark_text = NULL, remark_by_staff_number = NULL, remark_by_name = NULL, remark_at = NULL
    WHERE id = ?
  `).run(car.id);

  res.json({ success: true });
});

module.exports = router;
