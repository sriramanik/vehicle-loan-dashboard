// Determines shift name + shift "date" (the calendar date the shift started)
// Day shift: 06:00 - 17:59:59
// Night shift: 18:00 - 05:59:59 (next day) -> shift_date is the date it started

function getShiftInfo(date = new Date()) {
  const hour = date.getHours();
  const isDay = hour >= 6 && hour < 18;

  let shiftDate = new Date(date);
  if (!isDay && hour < 6) {
    // it's between midnight and 6am -> belongs to the night shift that STARTED the previous day
    shiftDate.setDate(shiftDate.getDate() - 1);
  }

  const yyyy = shiftDate.getFullYear();
  const mm = String(shiftDate.getMonth() + 1).padStart(2, '0');
  const dd = String(shiftDate.getDate()).padStart(2, '0');

  return {
    shift: isDay ? 'Day (06:00-18:00)' : 'Night (18:00-06:00)',
    shift_date: `${yyyy}-${mm}-${dd}`
  };
}

module.exports = { getShiftInfo };
