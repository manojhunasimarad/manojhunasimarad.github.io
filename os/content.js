/* Manoj OS: everything about Manoj that the app runs on. Edit this file on GitHub to change the defaults.
   Times are 24-hour, India time. Your own edits made inside the app are saved separately and win over these. */
window.OS_ME = {
  name: "Manoj",
  wake: "06:00",
  bed: "22:30",
  sleepTarget: 7.5,           // hours
  proteinTarget: 110,         // g a day
  kcalTarget: 2200,
  phoneTarget: 180,           // minutes of phone a day before the roasts start
  washMin: 75,                // washing machine cycle, minutes
  capital: 100000,            // paper-trading capital, ₹
  riskPct: 1,                 // % of capital at risk per paper trade
  roast: "savage",
  officeDays: [1, 2, 4],      // Mon, Tue, Thu at Philips; Wed and Fri from home
  fastDay: 2,                 // Tuesday: fasting through the day, dinner at night
  links: {
    llm: "https://manojhunasimarad.github.io/llm-from-zero/",
    kitchen: "https://manojhunasimarad.github.io/Kitchen/",
    desk: "https://manojhunasimarad.github.io/dalal-dojo/",
    lessons: "https://manojhunasimarad.github.io/dalal-dojo-lessons/",
    algo: "https://github.com/manojhunasimarad/nse-algo-trading-bot",
    fl: "https://github.com/manojhunasimarad/automotive-fl",
    varsity: "https://zerodha.com/varsity/"
  }
};

/* ------------------------------------------------------------------ the week
   [start, end, kind, what, [small things inside it]]
   Sleep before your wake time and after your bedtime is added automatically. */
(function () {
  const wake = [["06:00", "06:10", "wake", "Up · glass of water · no phone for 10 min", ["Glass of water", "Make the bed"]],
                ["06:10", "06:20", "fresh", "Brush · freshen up"]];
  const nightPrep = ["21:45", "22:00", "prep", "Tomorrow prep", ["Set curd", "Lay out tomorrow's clothes", "Charge phone, laptop, earphones", "Trash out if full"]];
  const read = ["22:00", "22:30", "read", "Non-technical book, 20 min (paper or Kindle, not the phone)", ["Tap “Going to sleep” in the app", "Phone on charge, away from the bed"]];
  const office = [
    ...wake,
    ["06:20", "07:00", "workout", "Strength at home", ["Warm-up 5 min", "3 rounds: push-ups, squats, rows, plank", "Stretch 5 min"]],
    ["07:00", "07:30", "cook", "Morning cook, 30 min: breakfast + lunch box", ["Breakfast", "Lunch box packed piping hot"]],
    ["07:30", "07:50", "eat", "Breakfast (protein first)"],
    ["07:50", "08:00", "dishes", "Wash utensils"],
    ["08:00", "08:30", "bath", "Bath · get ready", ["Office bag: laptop, charger, ID card", "Lunch box + water bottle", "Helmet"]],
    ["08:30", "08:50", "recall", "Python recall: 5 cards (phone is fine)"],
    ["08:50", "09:00", "prep", "Out the door: bag, helmet, lunch box, gas off"],
    ["09:00", "09:40", "ride", "Ride to Philips"],
    ["09:40", "17:50", "work", "Philips (office)", ["Stand and walk 3 min every hour", "20-20-20 eye breaks", "2 bottles of water"]],
    ["17:50", "18:30", "ride", "Ride home", ["Milk / curd / veg on the way if needed"]],
    ["18:30", "19:00", "free", "Shower · decompress (not reels)"],
    ["19:00", "19:25", "cook", "Evening cook, 25 min"],
    ["19:25", "19:45", "eat", "Dinner"],
    ["19:45", "19:55", "dishes", "Wash utensils"],
    ["19:55", "20:05", "walk", "10-min walk after dinner"],
    ["20:05", "21:00", "learn", "Python: one exercise (laptop)"],
    ["21:00", "21:20", "trade", "Paper trades: journal + 1 lesson"],
    ["21:20", "21:45", "people", "Call home or a friend · then free time"],
    nightPrep, read
  ];
  const tue = [
    ...wake,
    ["06:20", "06:50", "walk", "Easy walk + stretch (fasting day, go easy)"],
    ["06:50", "07:50", "learn", "Python: one exercise. No cooking today, so use the hour"],
    ["07:50", "08:00", "clean", "Quick tidy: desk and floor"],
    ["08:00", "08:30", "bath", "Bath · get ready", ["Office bag: laptop, charger, ID card", "Helmet"]],
    ["08:30", "09:00", "recall", "Python recall: 5 cards"],
    ["09:00", "09:40", "ride", "Ride to Philips"],
    ["09:40", "17:50", "work", "Philips (office) · fasting", ["Stand and walk 3 min every hour", "20-20-20 eye breaks"]],
    ["17:50", "18:30", "ride", "Ride home", ["Buy what tonight's dinner needs"]],
    ["18:30", "19:00", "cook", "Cook to break the fast, 30 min"],
    ["19:00", "19:30", "eat", "Break the fast: dinner", ["Start light, then the protein main", "Aim for 40 g+ protein tonight"]],
    ["19:30", "19:40", "dishes", "Wash utensils"],
    ["19:40", "19:55", "walk", "Gentle 15-min walk"],
    ["19:55", "20:15", "trade", "Paper trades: journal + 1 lesson"],
    ["20:15", "20:35", "people", "Call home"],
    ["20:35", "21:45", "free", "Free time"],
    nightPrep, read
  ];
  const wed = [
    ...wake,
    ["06:20", "07:00", "run", "Run: easy 3–5 km", ["Log it under Life → Fitness"]],
    ["07:00", "07:05", "laundry", "Load the washing machine", ["Whites and darks separate", "Start the cycle timer in the app"]],
    ["07:05", "07:35", "cook", "Cook breakfast (+ lunch), 30 min"],
    ["07:35", "07:55", "eat", "Breakfast"],
    ["07:55", "08:05", "dishes", "Wash utensils"],
    ["08:05", "08:20", "clean", "Quick tidy: desk, bed, floor"],
    ["08:20", "08:30", "laundry", "Hang clothes to dry"],
    ["08:30", "08:55", "bath", "Bath"],
    ["08:55", "09:15", "trade", "Pre-market: pick 3 stocks to watch (paper)"],
    ["09:15", "13:00", "work", "Philips (WFH)", ["Stand and walk 3 min every hour", "20-20-20 eye breaks"]],
    ["13:00", "13:40", "eat", "Lunch · 10-min market check (paper)"],
    ["13:40", "13:50", "dishes", "Wash lunch plates"],
    ["13:50", "18:00", "work", "Philips (WFH)"],
    ["18:00", "18:20", "clean", "Mop the room"],
    ["18:20", "18:40", "walk", "Step outside: walk + daylight (screen break)"],
    ["18:40", "19:05", "cook", "Evening cook, 25 min"],
    ["19:05", "19:25", "eat", "Dinner"],
    ["19:25", "19:35", "dishes", "Wash utensils"],
    ["19:35", "20:30", "learn", "Python: deep block (laptop)"],
    ["20:30", "20:45", "laundry", "Fold + put away clothes"],
    ["20:45", "21:05", "trade", "Paper trades: journal + 1 lesson"],
    ["21:05", "21:45", "book", "Technical book: 15–20 pages"],
    nightPrep, read
  ];
  const fri = [
    ...wake,
    ["06:20", "07:00", "run", "Run: 6 × (1 min fast, 2 min easy)"],
    ["07:00", "07:30", "cook", "Cook breakfast (+ lunch), 30 min"],
    ["07:30", "07:50", "eat", "Breakfast"],
    ["07:50", "08:00", "dishes", "Wash utensils"],
    ["08:00", "08:25", "bath", "Bath"],
    ["08:25", "09:15", "learn", "Python: one exercise before work (laptop)"],
    ["09:15", "13:00", "work", "Philips (WFH)", ["Stand and walk 3 min every hour", "20-20-20 eye breaks"]],
    ["13:00", "13:40", "eat", "Lunch · 10-min market check (paper)"],
    ["13:40", "13:50", "dishes", "Wash lunch plates"],
    ["13:50", "18:00", "work", "Philips (WFH)"],
    ["18:00", "18:30", "errand", "Weekend groceries + walk"],
    ["18:30", "18:55", "cook", "Evening cook, 25 min"],
    ["18:55", "19:10", "eat", "Dinner"],
    ["19:10", "19:20", "dishes", "Wash utensils"],
    ["19:20", "20:00", "research", "Research: federated learning / MTech (one section)"],
    ["20:00", "20:05", "prep", "Set curd · devices on charge"],
    ["20:05", "22:15", "movie", "Movie night (Friday is the movie night)"],
    ["22:15", "22:30", "wind", "Lights out", ["Tap “Going to sleep” in the app"]]
  ];
  const sat = [
    ...wake,
    ["06:20", "07:20", "run", "Long run or long walk, 45–60 min"],
    ["07:20", "07:25", "laundry", "Load the washing machine (towels, bedsheets)"],
    ["07:25", "07:55", "cook", "Cook breakfast, 30 min"],
    ["07:55", "08:15", "eat", "Breakfast"],
    ["08:15", "08:25", "dishes", "Wash utensils"],
    ["08:25", "08:40", "free", "Slow coffee"],
    ["08:40", "08:50", "laundry", "Hang clothes to dry"],
    ["08:50", "10:50", "learn", "Python deep block: 2 exercises + 1 lesson (laptop)"],
    ["10:50", "11:50", "errand", "Pantry check + groceries", ["Check the Pantry list in Cook first", "Order or bring what's out"]],
    ["11:50", "12:30", "fix", "Fix-it slot: one household thing", ["Pick one from Life → Home"]],
    ["12:30", "13:00", "bath", "Bath"],
    ["13:00", "13:45", "cook", "Cook lunch (cap: 45 min)"],
    ["13:45", "14:05", "eat", "Lunch"],
    ["14:05", "14:15", "dishes", "Wash utensils"],
    ["14:15", "16:00", "free", "Free · nap 20 min max"],
    ["16:00", "17:00", "trade", "Dalal Dojo desk: one practice session"],
    ["17:00", "19:00", "people", "Friends: go out, play, eat together", ["Plan it by Friday"]],
    ["19:00", "19:25", "cook", "Evening cook, 25 min"],
    ["19:25", "19:45", "eat", "Dinner"],
    ["19:45", "19:55", "dishes", "Wash utensils"],
    ["19:55", "20:10", "laundry", "Fold + put away clothes"],
    ["20:10", "21:45", "free", "Free time"],
    ["21:45", "22:00", "prep", "Set curd · charge devices"], read
  ];
  const sun = [
    ...wake,
    ["06:20", "07:00", "workout", "Mobility + core (rest day from running)"],
    ["07:00", "07:30", "cook", "Cook breakfast, 30 min"],
    ["07:30", "07:50", "eat", "Breakfast"],
    ["07:50", "08:00", "dishes", "Wash utensils"],
    ["08:00", "09:00", "research", "Research: one paper section (federated learning)"],
    ["09:00", "09:30", "clean", "Clean the bathroom", ["Toilet and basin", "Scrub the floor", "Restock soap and cleaner"]],
    ["09:30", "09:50", "clean", "Mop the room"],
    ["09:50", "10:20", "bath", "Bath"],
    ["10:20", "11:50", "learn", "Python: weekly catch-up (laptop)"],
    ["11:50", "12:30", "people", "Video call with family"],
    ["12:30", "13:30", "cook", "Sunday special (cap: 60 min)"],
    ["13:30", "13:50", "eat", "Lunch"],
    ["13:50", "14:05", "dishes", "Wash utensils"],
    ["14:05", "16:00", "free", "Free · nap 20 min max"],
    ["16:00", "16:45", "review", "Weekly review", ["Sleep and screen time (Life)", "Trade journal stats (Trade)", "Python: what's next (Learn)", "Plan this week's dinners (Cook)"]],
    ["16:45", "19:00", "free", "Free · outside"],
    ["19:00", "19:25", "cook", "Evening cook, 25 min"],
    ["19:25", "19:45", "eat", "Dinner"],
    ["19:45", "19:55", "dishes", "Wash utensils"],
    ["19:55", "20:30", "book", "Technical book: one chapter"],
    ["20:30", "21:00", "free", "Free time"],
    ["21:00", "21:15", "prep", "Office week prep", ["Lay out Monday's clothes (iron if needed)", "Office bag ready", "Charge everything"]],
    ["21:15", "21:45", "free", "Free"],
    ["21:45", "22:00", "prep", "Set curd · tidy"], read
  ];
  const travel = [
    ["06:00", "06:10", "wake", "Up · water (keep the wake time even away from home)"],
    ["06:30", "07:00", "walk", "Walk 20–30 min wherever you are"],
    ["09:00", "09:20", "recall", "Python recall: 5 cards (works offline)"],
    ["13:00", "13:30", "eat", "Lunch: protein first"],
    ["18:00", "18:10", "trade", "One trading lesson (3 min)"],
    ["22:00", "22:30", "read", "Read · tap “Going to sleep”"]
  ];
  window.OS_WEEK = { 0: sun, 1: office, 2: tue, 3: wed, 4: office, 5: fri, 6: sat, travel };
})();

/* What each kind of block means for the app: icon, label, and the screen rules the roasts enforce. */
window.OS_KINDS = {
  wake: ["🌅", "Wake"], fresh: ["🪥", "Freshen up"], workout: ["🏋️", "Workout"], run: ["🏃", "Run"], walk: ["🚶", "Walk"],
  cook: ["🍳", "Cook"], eat: ["🍽️", "Eat"], dishes: ["🧽", "Utensils"], laundry: ["🧺", "Laundry"], clean: ["🧹", "Clean"],
  bath: ["🚿", "Bath"], recall: ["🧠", "Recall"], learn: ["🐍", "Python"], research: ["📚", "Research"], ride: ["🏍️", "Ride"],
  work: ["💼", "Philips"], trade: ["📈", "Trade"], free: ["🎮", "Free"], movie: ["🎬", "Movie"], read: ["📖", "Read"],
  errand: ["🛒", "Errand"], fix: ["🔧", "Fix-it"], prep: ["📝", "Prep"], wind: ["🌙", "Wind down"], sleep: ["😴", "Sleep"],
  review: ["🗓️", "Review"], people: ["👥", "People"], book: ["📘", "Tech book"]
};

/* How the week is balanced: each kind of block counts towards one part of life. */
window.OS_BALANCE = {
  "Health": ["workout", "run", "walk"], "Learning": ["learn", "recall", "research", "book"], "Philips": ["work"],
  "Commute": ["ride"], "Cooking": ["cook"], "Meals": ["eat"], "Home + chores": ["dishes", "laundry", "clean", "errand", "fix", "prep"],
  "People": ["people"], "Fun": ["free", "movie"], "Reading for fun": ["read", "wind"], "Trading": ["trade"],
  "Self-care": ["wake", "fresh", "bath"], "Sleep": ["sleep"]
};

/* Bookshelf: one technical and one non-technical book at a time. The suggestions are a starting point; change them in Life → Books. */
window.OS_BOOKS = [
  { id: "pda", t: "Python for Data Analysis, 3rd ed. (Wes McKinney)", kind: "tech", pages: 550, note: "Free online at wesmckinney.com/book. Fits Stage 0–1: Python, then NumPy and pandas.", url: "https://wesmckinney.com/book/" },
  { id: "homl", t: "Hands-On Machine Learning, PyTorch edition (Aurélien Géron)", kind: "tech", pages: 850, note: "Next, from Stage 1: about a chapter a week.", next: true },
  { id: "pom", t: "The Psychology of Money (Morgan Housel)", kind: "fun", pages: 250, note: "Short chapters; good company for paper trading." },
  { id: "atomic", t: "Atomic Habits (James Clear)", kind: "fun", pages: 320, note: "This whole app is basically chapter 1 applied.", next: true },
  { id: "deepwork", t: "Deep Work (Cal Newport)", kind: "fun", pages: 300, note: "For the study blocks.", next: true }
];

/* ------------------------------------------------------------------ trips */
window.OS_TRIP = {
  before: ["Don't buy chicken, paneer or fresh veg for the days you're away", "Use up milk and curd; don't set curd tonight",
           "Finish laundry so nothing sits wet", "Wash every utensil; nothing left in the sink", "Trash out",
           "Gas knob and regulator off", "Switches off; unplug the air fryer, sandwich maker and chargers", "Taps off · windows locked",
           "Pack: phone + laptop chargers, power bank, ID, helmet if riding, medicines", "Put trip dates in the app so the schedule switches"],
  back: ["Groceries for two days (milk, curd, eggs, veg)", "Set curd tonight", "Trip clothes into the washing machine",
         "Back to 22:30 bedtime tonight, even if you're wired"]
};

/* ------------------------------------------------------------------ rules, kit, recovery */
window.OS_RULES = {
  do: ["Wake at 6:00 on weekends too; one fixed wake time does more for sleep than anything else",
       "Protein at every meal: 110 g a day", "Weekday cooking: 30 minutes or less",
       "Type every line of exercise code yourself; ask about concepts, never for the code",
       "One stage at a time: Python first, nothing else until it's done",
       "Every paper trade gets a stop-loss and a written reason before you enter",
       "Phone in the bag while riding", "Eat cooked food within 2 hours (no fridge)", "Set curd every night",
       "Walk 10 minutes after dinner"],
  dont: ["Phone in bed", "Cooked rice kept overnight", "Real money or F&O before 50 journalled paper trades with positive expectancy",
         "AI-written code inside the exercises", "Trading on less than 6 hours of sleep",
         "Reels after 21:30", "Skipping protein on Tuesday night"]
};
window.OS_KIT = {
  daily: ["This app: morning (Now) and night (Going to sleep)", "Calendar reminders for the routine", "Laptop for Python (LLM From Zero)",
          "Iron tawa, pressure cooker, air fryer", "Two-wheeler + helmet", "Water bottle", "Kite: only in the market-check slots, for paper trades"],
  weekly: ["Washing machine (Wed, Sat)", "Mop (Wed, Sun) · bathroom kit (Sun)", "Dalal Dojo desk (Sat)",
           "ActivityWatch report (Sun review)", "GitHub: commit your Python solutions"],
  ignore: ["Stock tips on WhatsApp and Telegram, F&O ads", "Reels and shorts after 21:30", "Shopping-app notifications",
           "LinkedIn scrolling during study blocks", "The urge to redesign the plan instead of doing today's item",
           "455-problem lists until Python is done", "Comparing your progress with other people's"]
};
window.OS_RECOVER = [
  { k: "sleep", t: "After a bad night (under 6 h)", why: "You can't repay the debt in one go; you can stop it from ruining today and tonight.",
    do: ["Keep the 6:00 wake time; don't sleep in", "Daylight for 10 minutes within an hour of waking", "Caffeine only before 1 PM",
         "Nap 20 minutes max, and not after 3 PM", "Protein-heavy breakfast; skip the sugar crash", "No paper trades today",
         "Go to bed 30 minutes early tonight, not 3 hours early"] },
  { k: "eyes", t: "After a long screen day", why: "Eye strain comes from focusing close for hours and blinking less.",
    do: ["20-20-20: every 20 min, look 20 feet away for 20 seconds", "Screen at arm's length, top edge at eye level",
         "Blink deliberately 10 times", "Night: lowest brightness, warm colours", "No screens in the last 30 minutes before bed"] },
  { k: "sit", t: "After a long sitting day", why: "Long unbroken sitting stiffens the hips and back and dulls your blood sugar response.",
    do: ["Stand and walk 3–5 minutes every hour", "10–15 minute walk after dinner", "Evening: hip-flexor and hamstring stretch, 1 min each side",
         "Take a call standing up"] },
  { k: "food", t: "After a heavy or junk meal", why: "One meal doesn't undo anything. Overcorrecting does.",
    do: ["Walk 10–15 minutes", "Water, not a soft drink", "Next meal: normal size, protein and vegetables", "Don't skip the next meal to compensate"] },
  { k: "fast", t: "Breaking the Tuesday fast", why: "A big fried meal on an empty stomach feels terrible and sleeps worse.",
    do: ["Start light: fruit, curd or soup", "Then the protein main (40 g+)", "Eat slowly; stop at comfortably full",
         "Finish eating 2 hours before bed"] },
  { k: "scroll", t: "After a doomscroll binge", why: "The fix is distance, not willpower.",
    do: ["Phone in another room for an hour", "Walk outside for 10 minutes", "Do the next block on the schedule, however small",
         "Turn off the notification that pulled you in"] },
  { k: "heat", t: "After a sweaty ride or run", why: "Bengaluru afternoons plus a helmet add up.",
    do: ["2.5–3 litres of water across the day", "Lemon water with a pinch of salt and sugar after a heavy sweat",
         "Shower and change before you sit down to work"] },
  { k: "trip", t: "After a trip", why: "The first night back sets the next week.",
    do: ["Same bedtime the first night back", "Groceries and curd first", "Laundry from the trip", "Python recall to restart the streak"] }
];

/* ------------------------------------------------------------------ lab tests
   Typical adult ranges. Your report's own reference range and your doctor come first. */
window.OS_LABS = [
  { k: "hb", n: "Haemoglobin", u: "g/dL", r: [13, 17], every: 12 },
  { k: "ferritin", n: "Ferritin", u: "ng/mL", r: [30, 400], every: 12 },
  { k: "vitd", n: "Vitamin D (25-OH)", u: "ng/mL", r: [30, 100], every: 12 },
  { k: "b12", n: "Vitamin B12", u: "pg/mL", r: [200, 900], every: 12 },
  { k: "fbs", n: "Fasting glucose", u: "mg/dL", r: [70, 99], every: 12, fast: true },
  { k: "hba1c", n: "HbA1c", u: "%", r: [0, 5.6], every: 12 },
  { k: "tc", n: "Total cholesterol", u: "mg/dL", r: [0, 199], every: 12, fast: true },
  { k: "ldl", n: "LDL cholesterol", u: "mg/dL", r: [0, 99], every: 12, fast: true },
  { k: "hdl", n: "HDL cholesterol", u: "mg/dL", r: [40, 999], every: 12, fast: true },
  { k: "tg", n: "Triglycerides", u: "mg/dL", r: [0, 149], every: 12, fast: true },
  { k: "tsh", n: "TSH (thyroid)", u: "mIU/L", r: [0.4, 4.0], every: 12 },
  { k: "ua", n: "Uric acid", u: "mg/dL", r: [3.4, 7.0], every: 12 },
  { k: "creat", n: "Creatinine", u: "mg/dL", r: [0.7, 1.3], every: 12 },
  { k: "zinc", n: "Zinc (serum)", u: "µg/dL", r: [70, 120], every: 12 }
];
window.OS_LAB_ADV = {
  iron: { t: "Low iron (haemoglobin or ferritin)", tips: ["An iron-rich food at two meals a day: soya chunks, rajma, chole, dals, palak, eggs, chicken or fish.", "Vitamin C in the same meal (lemon, tomato, capsicum, amla): it helps absorb plant iron.", "Tea and coffee at least an hour away from meals.", "Your iron tawa adds a little iron.", "Don't start iron tablets on your own: a doctor should find out why it's low and set the dose."] },
  vitd: { t: "Low vitamin D", tips: ["Midday sun on arms and legs for 15–30 minutes on most days.", "Food has little vitamin D: egg yolks, fatty fish, fortified milk help a bit.", "A deficiency usually needs a supplement: ask your doctor for the dose and a re-test after 2–3 months."] },
  b12: { t: "Low vitamin B12", tips: ["A B12 food every day: eggs, milk, curd, paneer, chicken or fish.", "Long-term antacids lower B12 absorption; tell your doctor if you take them.", "Low B12 often needs tablets or injections; your doctor decides."] },
  sugar: { t: "Blood sugar above range", tips: ["Plates: half vegetables, a quarter protein, a quarter rice or rotis.", "Dals, chana, rajma, ragi and whole grains over white rice and maida.", "Cut sugar, sweets, juices and soft drinks.", "Walk 10–15 minutes after meals."] },
  lipids: { t: "Cholesterol above range", tips: ["Cut ghee, butter, cream and fried snacks; measure your oil.", "Soluble fibre daily: oats, rajma, chana, dals, vegetables.", "A small handful of nuts or peanuts most days."] },
  hdl: { t: "Low HDL (good cholesterol)", tips: ["Regular cardio raises HDL: your Wed, Fri and Sat runs count.", "Swap fried snacks for nuts and seeds."] },
  tg: { t: "Triglycerides above range", tips: ["Sugar, sweets, juices, refined carbs and alcohol raise triglycerides most: cut them first.", "Walk daily and lose waist fat."] },
  tsh: { t: "Thyroid (TSH) out of range", tips: ["See a doctor: thyroid problems are treated with medicine, not diet.", "Use iodised salt.", "No biotin supplements before a thyroid test; they distort the result."] },
  ua: { t: "Uric acid above range", tips: ["Limit organ meats, prawns and big portions of mutton.", "Avoid beer and sugary drinks.", "2.5–3 litres of water a day."] },
  creat: { t: "Creatinine above range", tips: ["See a doctor before a very high-protein diet; they may check kidney function (eGFR).", "Stay hydrated; avoid creatine supplements and painkillers like ibuprofen unless your doctor agrees."] },
  zinc: { t: "Low zinc", tips: ["Zinc foods: chicken, eggs, chana, dals, peanuts, sesame and pumpkin seeds.", "Soaking and sprouting dals helps absorption."] },
  other: { t: "Out of range", tips: ["Ask your doctor what this means for you; it isn't something to change with food alone."] }
};
window.OS_LAB_PREP = {
  do: ["Book fasting tests (glucose, lipids) for a Wednesday morning: you're home, and the overnight gap after Tuesday dinner works",
       "Fast 10–12 hours before glucose and lipid tests; plain water is fine", "Go early: sample before 9 AM",
       "Take your usual medicines unless the doctor or lab says otherwise", "Drink a glass or two of water before the sample",
       "Bring your last report so the doctor can compare", "Enter the lab's own reference ranges if they differ from the app's"],
  dont: ["Biotin or hair-skin-nail supplements for 2–3 days before a thyroid test", "A long run or heavy workout the day before (creatinine, CK)",
         "Alcohol or a very heavy meal the night before", "Fasting tests after a Tuesday-night feast at midnight: eat by 20:00",
         "Diagnosing yourself from one number"]
};

/* ------------------------------------------------------------------ the roasts
   {vars} are filled in by the app. "savage" is the default; "mild" is used for the gentler settings. */
window.OS_ROASTS = {
  late_phone: {
    title: "Bedtime violation", icon: "🌚",
    savage: ["It's {time}. Your bedtime was {bed}. The only thing you're optimising right now is your dark circles.",
             "{late} past bedtime. You cut an AWS build from 24 hours to 3. Cut this scrolling session to 0.",
             "A QNX scheduler would have pre-empted you into sleep {late} ago. Real-time OS, real-time bedtime.",
             "The alarm goes at {wake}. It's {time}. Do the maths, MTech.",
             "Phone at {time}? Bold of you to assume tomorrow-you will forgive this.",
             "Your phone has a sleep mode. So do you. Use one of them.",
             "Nothing good was ever decided at {time}. Except going to sleep. Decide that.",
             "You're {late} into overtime and nobody is paying you for it."],
    mild: ["It's {time}, {late} past your {bed} bedtime. Tap “Going to sleep” and put it down.",
           "Late one. Your {wake} alarm will feel this. Off you go."] },
  late_windows: {
    title: "Laptop after bedtime", icon: "🪟",
    savage: ["Laptop open at {time}. On Windows. Two bad decisions in one session.",
             "{time}, Windows and you. Somewhere a Linux kernel is crying.",
             "If this is Philips work, log off. If it isn't Philips work, definitely log off.",
             "You brought up a Qualcomm SA8295 from scratch. You can find the power button.",
             "Windows Update will restart this thing at a random time anyway. Beat it to it. Sleep.",
             "{late} past bedtime on a laptop. Karpathy sleeps. That's how he trains models and not his anxiety."],
    mild: ["Laptop at {time}, {late} past bedtime. Save your work and shut it."] },
  windows_hello: {
    title: "Windows detected", icon: "🪟",
    savage: ["Ah, Windows. The OS you'd never have shipped on an automotive SoC.",
             "Welcome back to Windows, where “Updating 23%” is a lifestyle.",
             "Windows. The QNX hypervisor in your past is disappointed but not surprised.",
             "Windows detected. Good: this is where Python actually gets written. Go write some.",
             "Windows, at least, isn't your phone. Make it count: today's exercise, then out."],
    mild: ["On the laptop: good place for today's Python exercise."] },
  phone_study: {
    title: "Wrong device", icon: "📱",
    savage: ["{block}, and you're on your phone. Python isn't typed with thumbs.",
             "This is a 6-inch screen. Your exercise needs a keyboard. Laptop. Now.",
             "Karpathy did not write nanoGPT on Android.",
             "{left} left in this block. Spend them on the laptop, not here.",
             "Studying on the phone is just scrolling with extra steps."],
    mild: ["This block wants the laptop. {left} left: open LLM From Zero there."] },
  phone_ride: {
    title: "You should be riding", icon: "🏍️",
    savage: ["You're supposed to be riding. If you're riding: phone away. If you've stopped: still phone away.",
             "Two-wheeler plus phone is the one bug with no hotfix. Close this.",
             "Nothing in this app is worth a crash. Pocket. Now."],
    mild: ["Ride time. Put the phone away until you're parked."] },
  phone_work: {
    title: "Office hours", icon: "💼",
    savage: ["Philips is paying for this minute. Make it look like segmentation, not scrolling.",
             "The cardiac MRI pipeline won't segment itself. Phone down.",
             "Office hours. Your phone has no Dice score. Put it away."],
    mild: ["Work block. Phone can wait {left}."] },
  phone_wind: {
    title: "Screens off", icon: "📖",
    savage: ["Wind-down block. That's a book, not a phone. The two are easy to tell apart: one doesn't buzz.",
             "{left} till lights out and you chose the most stimulating rectangle in the house."],
    mild: ["Wind-down time: book or Kindle, not the phone."] },
  screen_high: {
    title: "Screen time", icon: "📊",
    savage: ["{phone} of phone today. That's {pct}% of your waking day handed to an algorithm that doesn't pay your rent.",
             "{phone} on the phone. That's {ex} Python exercises' worth of time. You did {done}.",
             "Digital Wellbeing says {phone}. Digital Wellbeing is being polite. I'm not.",
             "{phone}. Your thumbs did more cardio than you did today."],
    mild: ["{phone} of phone today, over your {target} limit. Let's make tomorrow lighter."] },
  sleep_short: {
    title: "Short night", icon: "🥱",
    savage: ["You slept {slept}. Your {goal} target is filing a complaint with HR.",
             "{slept} of sleep and a full day ahead. Brave. Stupid, but brave.",
             "{slept}. Zerodha charges less interest than your body does on sleep debt.",
             "{slept} of sleep. No paper trades today; you'd lose money you don't even have."],
    mild: ["Only {slept} last night. Recovery plan: daylight, caffeine before 1 PM, bed 30 min early."] },
  woke_late: {
    title: "Alarm ignored", icon: "⏰",
    savage: ["Up at {woke}. The {wake} alarm is now a decorative feature.",
             "{woke}. The workout block has left the chat.",
             "Snooze is not a workout, Manoj."],
    mild: ["Up at {woke}. Shift today's workout to a 10-min version and carry on."] },
  woke_good: {
    title: "On time", icon: "🌅",
    savage: ["Up at {woke}. Who are you and what have you done with Manoj?", "{woke} and up. Suspiciously disciplined. Keep it up."],
    mild: ["Up on time. Nice."] },
  laundry_wet: {
    title: "Laundry", icon: "🧺",
    savage: ["Your clothes finished washing {ago} ago. They're not marinating. Hang them.",
             "Wet clothes in a drum for {ago}. That smell is coming, and it's coming for you."],
    mild: ["The wash finished {ago} ago. Time to hang it."] },
  dishes: {
    title: "The sink", icon: "🧽",
    savage: ["Last night's utensils are still in the sink, judging you.", "No fridge, and still you found a way to grow something. Wash the utensils."],
    mild: ["Utensils from last night are still waiting."] },
  protein_low: {
    title: "Protein check", icon: "🥚",
    savage: ["{p} g protein by {time}. Target is {target}. Muscles aren't built on poha alone.",
             "Protein: {p} of {target} g. Boil three eggs. That's not a recipe, that's a rescue.",
             "{p} g. Your soya chunks are sitting in the pantry, unemployed."],
    mild: ["{p} of {target} g protein so far. A protein dinner closes the gap."] },
  fast_cook: {
    title: "It's Tuesday", icon: "🙏",
    savage: ["It's Tuesday and you're fasting. Stop window-shopping recipes like it's Swiggy.",
             "Fasting and browsing food. That's not discipline, that's ASMR."],
    mild: ["Fast day: here's tonight's dinner pick, for later."] },
  long_cook: {
    title: "That's a long one", icon: "⏳",
    savage: ["{mins} minutes of cooking on a weekday. You literally asked to cut cooking time.",
             "{mins} minutes? That's a Sunday dish. It's {day}."],
    mild: ["{mins} minutes is long for a {day}. Maybe save it for Sunday."] },
  away: {
    title: "Welcome back", icon: "👀",
    savage: ["Gone {away}. Instagram, YouTube or “just checking one thing”? Pick one, I'll wait.",
             "Back after {away}. The schedule didn't pause just because you did."],
    mild: ["Back after {away}. Here's where the day is."] },
  movie_late: {
    title: "Weeknight movie", icon: "🎬",
    savage: ["A movie at {time} on a {day}? Movie night is Friday. This is a Friday-shaped mistake.",
             "Credits roll after your bedtime. So does your productivity tomorrow."],
    mild: ["Save the movie for Friday night."] },
  market_closed: {
    title: "Market closed", icon: "📉",
    savage: ["The market's closed. Staring at it anyway is called investing in anxiety.",
             "NSE opens 9:15 on weekdays. Until then: one lesson, three questions."],
    mild: ["Market's closed. Good time for a lesson."] },
  streak: {
    title: "Streak broken", icon: "💔",
    savage: ["Python streak: back to zero. Your {n}-day streak is now a story you tell people.",
             "You broke the streak. The streak didn't break you. One exercise fixes it."],
    mild: ["Streak reset. One exercise or 5 recall cards starts it again."] }
};
