"""Builds data.js for Manoj OS from the three older apps.

Sources (paths are arguments so this runs from anywhere):
  --kitchen  the Kitchen repo (data/data.json and tools/nutrition.py)
  --llm      the llm-from-zero folder of manojhunasimarad.github.io (content/*.json)
  --dalal    build/dalal_modules.json and build/dalal_missions.json (made by the two extract_*.js tools)

Run:
  node tools/extract_dalal.js    ../dalal-dojo-lessons/index.html build/dalal_modules.json
  node tools/extract_missions.js ../dalal-dojo/index.html         build/dalal_missions.json
  python3 tools/build_data.py --kitchen ../../Kitchen --llm ../llm-from-zero --dalal build --out data.js
"""
import argparse
import json
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--kitchen", required=True)
ap.add_argument("--llm", required=True)
ap.add_argument("--dalal", required=True)
ap.add_argument("--out", default="data.js")
a = ap.parse_args()

sys.path.insert(0, os.path.join(a.kitchen, "tools"))
import nutrition as N  # noqa: E402  (Kitchen's per-100 g table)

K = json.load(open(os.path.join(a.kitchen, "data", "data.json")))

# ---------------------------------------------------------------- recipes
KEEP_NUTR = ["kcal", "p", "c", "f", "fib"]


def slim(r):
    return {
        "id": r["id"], "title": r["title"], "sub": r.get("sub", ""),
        "cuisine": r.get("cuisine"), "course": r.get("course"), "diet": r.get("diet"),
        "min": r.get("minutes"), "uses": r.get("uses", ""), "needs": r.get("needs", []),
        "serving": r.get("servingLabel") or r.get("serving", ""), "keeps": r.get("keeps") or "",
        "serve": r.get("serve") or "", "tags": r.get("tags", []),
        "hold": bool(r.get("holds")) or "lunchbox" in r.get("tags", []),
        "n": {k: round(r["nutr"].get(k, 0), 1) for k in KEEP_NUTR},
        "ing": [{"g": g.get("group", ""), "i": [[it.get("name", ""), it.get("q", ""), it.get("note", "")]
                                               for it in g.get("items", [])]} for g in r.get("ingredients", [])],
        "steps": r.get("steps", []),
        "tips": [[t.get("title", ""), t.get("text", "")] for t in (r.get("tips") or [])[:3]],
        "src": ("Book %d p. %s" % (r["book"], r["page"])) if r.get("book") else "Kitchen From Zero",
    }


recipes = [slim(r) for r in K["recipes"]]


# Dishes Manoj asked Claude about in October that the Kitchen app didn't have.
# Each ingredient: (nutrition key or None, name, display quantity, grams for 1 serving, note)
def mine(id, title, sub, course, diet, minutes, uses, needs, serving, ing, steps, tips=(), keeps="", serve=""):
    tot = {k: 0.0 for k in N.FIELDS}
    groups = []
    for gname, items in ing:
        rows = []
        for key, name, q, g, note in items:
            if key and key in N.NUTR:
                for f in N.FIELDS:
                    tot[f] += N.NUTR[key][f] * g / 100.0
            rows.append([name, q, note])
        groups.append({"g": gname, "i": rows})
    return {
        "id": id, "title": title, "sub": sub, "cuisine": "Indian", "course": course, "diet": diet, "min": minutes,
        "uses": uses, "needs": needs, "serving": serving, "keeps": keeps or "Eat within 2 hours", "serve": serve,
        "tags": ["mine"] + (["quick"] if minutes <= 20 else []), "hold": False,
        "n": {k: round(tot[k], 1) for k in KEEP_NUTR}, "ing": groups, "steps": steps,
        "tips": [list(t) for t in tips], "src": "Added for you (you asked about it in October)",
    }


MINE = [
    mine("besan-bread-toast", "Besan bread toast", "Savoury besan batter on bread, crisp on the tawa",
         "breakfast", "veg", 15, "Tawa", ["bread", "besan", "onion", "tomato", "greenchilli", "oil"], "4 slices",
         [("Batter", [("besan", "Besan", "40 g (about 5 tbsp)", 40, ""),
                      ("onion", "Onion, very finely chopped", "½ small", 40, ""),
                      ("tomato", "Tomato, seeded and chopped", "¼", 25, ""),
                      ("greenchilli", "Green chilli, minced", "1", 3, ""),
                      ("coriander", "Coriander leaves, chopped", "1 tbsp", 3, "optional"),
                      (None, "Salt, turmeric, ajwain", "a pinch each", 0, ""),
                      (None, "Water", "about 60 ml", 0, "to a thick, pourable batter")]),
          ("Toast", [("bread", "Bread slices", "4", 100, ""), ("oil", "Oil", "2 tsp", 9, "")])],
         ["Mix the besan, salt, turmeric and ajwain. Whisk in the water a little at a time until the batter coats "
          "a spoon thickly, like dosa batter. Stir in the onion, tomato, chilli and coriander.",
          "Heat the tawa on medium. Spread 2 tbsp batter over one side of a slice with the back of a spoon.",
          "Lay it batter-side down on the oiled tawa. Spread batter on the top side while the first side cooks.",
          "Cook 2 minutes a side until the batter is golden and no longer raw in the middle. Repeat."],
         [("More protein", "Whisk 2 eggs into the batter (+12 g protein) and skip the water."),
          ("Sandwich maker", "Batter both sides and close in the preheated sandwich maker for 3 to 4 minutes.")],
         serve="With a glass of milk (+8 g protein) or green chutney."),

    mine("egg-rice-indian", "Egg rice (Indian style)", "Masala egg scramble tossed through fresh rice",
         "main", "egg", 20, "Tawa or kadai + cooker for rice", ["eggs", "rice", "onion", "tomato", "greenchilli", "oil"],
         "1 plate",
         [("Rice", [("rice", "Sona masoori rice", "75 g raw (cooked fresh)", 75, "")]),
          ("Masala", [("oil", "Oil", "2 tsp", 9, ""), ("onion", "Onion, sliced", "1 small", 70, ""),
                      ("greenchilli", "Green chilli, slit", "1", 3, ""),
                      ("garlic", "Ginger-garlic paste", "1 tsp", 5, ""),
                      ("tomato", "Tomato, chopped", "½", 50, ""),
                      (None, "Turmeric, chilli powder, garam masala, pepper", "¼ tsp each", 0, ""),
                      ("eggs", "Eggs", "3", 150, ""),
                      ("coriander", "Coriander leaves", "1 tbsp", 3, "")])],
         ["Cook the rice fresh in the cooker (1 : 2 water, 3 whistles) and spread it on a plate to steam off.",
          "Heat the oil, fry the onion and chilli until soft and edged brown, about 4 minutes. Add the "
          "ginger-garlic paste for 30 seconds, then the tomato and spices; cook until the tomato is soft.",
          "Push the masala aside, crack in the eggs, scramble until just set, then mix with the masala.",
          "Add the rice and salt, toss on high for 2 minutes, finish with pepper and coriander."],
         [("No fridge", "Use rice cooked the same session. Never keep cooked rice overnight.")]),

    mine("rava-upma-peanuts", "Rava upma with peanuts", "Ten-minute South Indian breakfast",
         "breakfast", "veg", 15, "Kadai", ["rava", "peanuts", "onion", "oil", "mustard"], "1 big bowl",
         [("Tempering", [("oil", "Oil or ghee", "2 tsp", 9, ""), ("mustard", "Mustard seeds", "½ tsp", 2, ""),
                         ("uraddal", "Urad dal", "1 tsp", 5, "optional"), ("peanuts", "Raw peanuts", "15 g", 15, ""),
                         ("curryleaves", "Curry leaves", "6", 1, ""), ("greenchilli", "Green chilli", "1", 3, ""),
                         ("ginger", "Ginger, grated", "½ tsp", 3, "")]),
          ("Upma", [("onion", "Onion, chopped", "½", 50, ""), ("carrot", "Carrot, diced", "¼", 25, "optional"),
                    ("peas", "Green peas", "2 tbsp", 20, "optional"), ("rava", "Rava, dry-roasted", "60 g", 60, ""),
                    (None, "Hot water", "180 ml (1 : 3)", 0, ""), ("lemon", "Lemon juice", "1 tsp", 5, "")])],
         ["Dry-roast the rava on low for 3 to 4 minutes until it smells toasty; tip it out. (Roast a week's worth "
          "at once; it keeps in a jar.)",
          "Heat the oil, add mustard, urad dal and peanuts; when the peanuts turn golden add curry leaves, chilli "
          "and ginger.",
          "Add the onion, carrot and peas and cook 2 to 3 minutes. Pour in the hot water with salt and bring to a boil.",
          "Lower the heat and rain in the rava with one hand while stirring with the other, so it doesn't lump. "
          "Cover for 2 minutes, then fluff with lemon juice."],
         [("Protein", "Upma alone is about 14 g. Add 2 boiled eggs or a glass of milk to reach 25 g or more.")]),

    mine("curd-rice", "Curd rice", "Cooling, quick and easy on the stomach",
         "main", "veg", 25, "Cooker + small tadka pan", ["rice", "curd", "milk", "mustard"], "1 bowl",
         [("Rice", [("rice", "Sona masoori rice", "70 g raw", 70, "cooked soft: 1 : 3 water")]),
          ("Curd", [("curd", "Thick curd", "200 g", 200, ""), ("milk", "Milk, boiled and cooled", "50 ml", 50,
                                                                 "keeps it from turning sour")]),
          ("Tadka", [("oil", "Oil", "1 tsp", 4.5, ""), ("mustard", "Mustard seeds", "½ tsp", 2, ""),
                     ("uraddal", "Urad dal", "½ tsp", 3, ""), ("curryleaves", "Curry leaves", "6", 1, ""),
                     ("greenchilli", "Green chilli, chopped", "1", 3, ""), ("ginger", "Ginger, grated", "½ tsp", 3, ""),
                     ("cucumber", "Cucumber or carrot, grated", "¼ cup", 30, "optional")])],
         ["Cook the rice soft (1 : 3 water, 4 whistles). Mash it lightly while hot and let it cool until just warm.",
          "Mix in the milk first, then the curd and salt.",
          "Heat the oil, splutter the mustard, add urad dal until golden, then curry leaves, chilli and ginger. "
          "Pour over the rice and stir in the cucumber."],
         [("No fridge", "Mix and eat within 2 hours; don't pack it for the whole day and don't keep it overnight.")],
         serve="With a pickle and roasted peanuts (+8 g protein)."),

    mine("pav-bhaji-cooker", "Pav bhaji (pressure cooker)", "Mumbai street classic in one cooker",
         "main", "veg", 35, "Pressure cooker + tawa", ["potato", "tomato", "onion", "capsicum", "peas", "butter",
                                                       "bread", "pbmasala"], "1 plate (2 pav)",
         [("Bhaji", [("potato", "Potato, peeled and cubed", "1 large", 150, ""),
                     ("peas", "Green peas", "¼ cup", 30, ""), ("capsicum", "Capsicum, chopped", "¼", 40, ""),
                     ("onion", "Onion, finely chopped", "½", 60, ""), ("tomato", "Tomatoes, chopped", "1", 100, ""),
                     ("garlic", "Ginger-garlic paste", "1 tsp", 5, ""),
                     ("butter", "Butter", "1 tbsp", 14, "plus more to serve"),
                     (None, "Pav bhaji masala", "1 tbsp", 0, ""), ("chilli", "Kashmiri chilli powder", "½ tsp", 1, ""),
                     ("lemon", "Lemon", "¼", 10, "")]),
          ("Pav", [("bread", "Pav", "2", 80, ""), ("butter", "Butter", "1 tsp", 5, "")])],
         ["Pressure-cook the potato, peas and capsicum with ½ cup water: 3 whistles. Mash in the cooker.",
          "On the tawa or in a kadai, melt the butter, fry the onion 3 minutes, add the ginger-garlic paste, then "
          "the tomato, masala, chilli powder and salt. Cook, mashing, until the tomato breaks down, about 5 minutes.",
          "Add the mashed vegetables and ½ cup water; mash and simmer 5 minutes until thick and glossy.",
          "Slit the pav, butter it and toast 1 minute a side on the tawa. Serve with lemon and chopped onion."],
         [("More protein", "Stir 50 g crumbled paneer into the bhaji at the end (+9 g protein)."),
          ("Cooking for 4 or 5", "Scale with the servings control; the cooker step stays the same, use the big cooker.")]),

    mine("soya-chunk-curry", "Soya chunk curry", "The cheapest 20+ g protein curry in your pantry",
         "main", "veg", 25, "Pressure cooker or kadai", ["soya", "onion", "tomato", "oil"], "1 bowl",
         [("Soya", [("soya", "Soya chunks", "40 g dry", 40, "")]),
          ("Masala", [("oil", "Oil", "2 tsp", 9, ""), ("cumin", "Cumin seeds", "½ tsp", 1, ""),
                      ("onion", "Onion, chopped", "1 small", 70, ""), ("garlic", "Ginger-garlic paste", "1 tsp", 5, ""),
                      ("tomato", "Tomato, chopped", "1", 100, ""),
                      (None, "Turmeric, chilli, coriander powder, garam masala", "½ tsp each", 0, ""),
                      ("curd", "Curd, whisked", "2 tbsp", 30, "optional, off the heat")])],
         ["Boil 2 cups water, add the soya chunks and salt, rest 5 minutes. Drain, cool and squeeze them dry "
          "(this removes the beany smell).",
          "Heat the oil, add cumin, then the onion until golden, ginger-garlic for 30 seconds, then the tomato and "
          "powders until oil separates.",
          "Add the soya and 1 cup water. Pressure-cook 2 whistles, or simmer covered 8 minutes.",
          "Off the heat, stir in the curd and garam masala."],
         [("With chapati", "Two phulkas take this plate past 30 g protein.")]),
]
recipes += MINE

# ---------------------------------------------------------------- pantry
# What Manoj said he has (Oct 2026). 0 = have, 2 = out. Fresh protein is bought on the day.
HAVE = {"atta", "rice", "besan", "poha", "rava", "oats", "ragi", "moongdal", "toor", "chanadal", "soya", "peanuts",
        "cashews", "sugar", "jaggery", "peanutbutter", "honey", "butter", "ghee", "onion", "tomato", "potato", "milk",
        "curd", "eggs", "oil", "turmeric", "chilli", "kashmiri", "coriander_p", "cumin", "garam", "mustard", "hing",
        "pepper", "salt", "ginger", "garlic", "greenchilli", "wholespice", "redchilli", "tamarind", "sambarpowder",
        "chaat", "cumin_p", "kasuri", "fennel", "methi_s", "rchana", "lemon"}
pantry = []
for p in K["pantry"]:
    pantry.append({"k": p["key"], "l": p["label"], "g": p["group"], "d": 0 if p["key"] in HAVE else 2,
                   "b": p.get("buy", p["label"])})
pantry.append({"k": "pbmasala", "l": "Pav bhaji masala", "g": "Spices and masalas", "d": 2, "b": "pav bhaji masala"})
SOFT = K["soft"]  # optional garnishes that never block a dish

extras = [{"id": e["id"], "t": e["title"], "p": e["nutr"]["p"], "kcal": e["nutr"]["kcal"]} for e in K["extras"]]

# ---------------------------------------------------------------- learning (Stage 0 Python)
E = json.load(open(os.path.join(a.llm, "content", "exercises.json")))
Q = json.load(open(os.path.join(a.llm, "content", "quiz.json")))
L = json.load(open(os.path.join(a.llm, "content", "lessons.json")))
py = sorted([e for e in E["exercises"] if e.get("set") == "python"], key=lambda e: e.get("step", 0))
exercises = [{"id": e["id"], "unit": e.get("unit", ""), "lesson": e.get("lesson", ""), "t": e["title"],
              "d": e.get("difficulty", ""), "st": e["statement"], "start": e.get("starter", ""),
              "tests": [[t["test"], t["expected_output"]] for t in e.get("tests", [])][:4],
              "hints": e.get("hints", []), "sol": e.get("solution", ""), "why": e.get("explanation", "")} for e in py]
lessons = [{"id": l["id"], "t": l["title"]} for l in L["lessons"] if l["id"].startswith("py-")]
nextStages = [{"id": l["id"], "t": l["title"]} for l in L["lessons"] if l["id"][:2] in ("s1", "s2", "s3", "s4", "s5")]
quiz = [{"id": q["id"], "topic": q["topic"], "q": q["q"], "code": q.get("code", ""), "o": q["options"],
         "a": q["answer"], "e": q.get("explain", "")} for q in Q["questions"] if q["topic"] in ("py", "cx")]

# ---------------------------------------------------------------- trading
modules = json.load(open(os.path.join(a.dalal, "dalal_modules.json")))
missions = json.load(open(os.path.join(a.dalal, "dalal_missions.json")))
dlessons = []
for m in modules:
    for l in m["lessons"]:
        dlessons.append({"id": l["id"], "mod": m["title"], "t": l["title"], "mins": l.get("mins", 3),
                         "body": l["body"], "take": l.get("takeaway", ""), "quiz": l.get("quiz", [])})
concepts = [{"lvl": lv["n"], "id": m["id"], "t": m["t"], "c": m["c"]} for lv in missions for m in lv["m"]]

DATA = {
    "built": "2026-11-01",
    "recipes": recipes, "pantry": pantry, "soft": SOFT, "extras": extras, "apps": K["apps"],
    "py": {"ex": exercises, "lessons": lessons, "next": nextStages, "quiz": quiz},
    "trade": {"lessons": dlessons, "concepts": concepts},
}
js = "/* Generated by tools/build_data.py from Kitchen, LLM From Zero and Dalal Dojo. Do not edit by hand. */\n" \
     "window.OS_DATA = " + json.dumps(DATA, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(a.out, "w").write(js)
print("wrote", a.out, len(js) // 1024, "KB:", len(recipes), "recipes,", len(pantry), "pantry,", len(exercises),
      "exercises,", len(quiz), "quiz,", len(dlessons), "trade lessons,", len(concepts), "concepts")
for r in MINE:
    print("  ", r["title"], r["n"])
