require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const carsRouter = require('./routes/cars');
const staffRouter = require('./routes/staff');
const loansRouter = require('./routes/loans');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/cars', carsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/loans', loansRouter);
app.use('/api/admin', adminRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Vehicle Loan System running on port ${PORT}`);
});
