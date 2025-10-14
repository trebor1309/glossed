const LS_KEYS = { BOOKINGS: "glossed.bookings", MISSIONS: "glossed.missions" };

export function getAllBookings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.BOOKINGS)) || [];
  } catch {
    return [];
  }
}

export function saveBooking(b) {
  const all = getAllBookings();
  all.push(b);
  localStorage.setItem(LS_KEYS.BOOKINGS, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent("glossed:new-booking", { detail: b }));
}

export function getAllMissions() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.MISSIONS)) || [];
  } catch {
    return [];
  }
}

export function upsertMission(m) {
  const all = getAllMissions();
  const i = all.findIndex((x) => x.id === m.id);
  if (i >= 0) all[i] = m;
  else all.push(m);
  localStorage.setItem(LS_KEYS.MISSIONS, JSON.stringify(all));
}
export function updateBookingStatus(id, newStatus) {
  const all = getAllBookings();
  const idx = all.findIndex((b) => b.id === id);
  if (idx !== -1) {
    all[idx].status = newStatus;
    localStorage.setItem(LS_KEYS.BOOKINGS, JSON.stringify(all));
    window.dispatchEvent(
      new CustomEvent("glossed:booking-updated", { detail: all[idx] })
    );
  }
}
