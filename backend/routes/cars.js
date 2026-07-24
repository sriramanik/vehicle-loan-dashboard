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

module.exports = router;
