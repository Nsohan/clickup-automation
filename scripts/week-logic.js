/**
 * Pure date logic — no API calls. Sunday-to-Thursday work weeks,
 * clipped to calendar month boundaries.
 *
 * Rules:
 * - A "normal" week runs Sunday -> Thursday (5 days).
 * - The first week of a month starts on the 1st (even if not a Sunday)
 *   and ends on the following Thursday, or the month's last day,
 *   whichever comes first.
 * - The last week of a month ends on the month's last day (even if
 *   not a Thursday) if the natural Thursday would fall in the next month.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function fmt(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function monthLabel(date) {
  return `Task Reports - ${MONTH_NAMES[date.getMonth()]}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Given any date, returns the Sun-Thu week window that contains it,
 * clipped so it never crosses into the previous/next month.
 */
function getWeekRange(date) {
  const day = date.getDay(); // 0 = Sunday ... 4 = Thursday ... 6 = Saturday
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  // Natural (un-clipped) Sunday of this week:
  // If today is Fri/Sat, that's a "gap" (not a work day) — snap forward
  // to the NEXT Sunday, since Fri/Sat belong to no work-week.
  let naturalSunday;
  if (day === 5 || day === 6) {
    // Friday or Saturday: belongs to the upcoming week
    const daysUntilSunday = (7 - day) % 7 || 7;
    naturalSunday = addDays(date, day === 6 ? 1 : 2);
  } else {
    naturalSunday = addDays(date, -day); // back up to this week's Sunday
  }

  let naturalThursday = addDays(naturalSunday, 4);

  const start = naturalSunday < monthStart ? monthStart : naturalSunday;
  const end = naturalThursday > monthEnd ? monthEnd : naturalThursday;

  return { start, end };
}

function weekTaskName(date) {
  const { start, end } = getWeekRange(date);
  return `Weekly ${fmt(start)} <to> ${fmt(end)}`;
}

module.exports = { monthLabel, getWeekRange, weekTaskName, fmt };

// ── Self-test when run directly ──
if (require.main === module) {
  const testDates = [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03", // partial first week
    "2026-09-04",
    "2026-09-05", // Fri/Sat gap
    "2026-09-06",
    "2026-09-08",
    "2026-09-10", // full week
    "2026-09-11", // Friday
    "2026-09-13",
    "2026-09-17",
    "2026-09-27",
    "2026-09-29",
    "2026-09-30", // partial last week
    "2026-10-01", // rolls into October
  ];

  for (const ds of testDates) {
    const d = new Date(ds + "T00:00:00");
    console.log(
      `${ds} (${d.toLocaleDateString("en-US", { weekday: "long" })}) -> ${monthLabel(d)} / ${weekTaskName(d)}`,
    );
  }
}
