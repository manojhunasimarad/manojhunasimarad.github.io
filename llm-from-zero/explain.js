// "Explain" button for every code block on the site. Works offline: it reads the code line by line
// and says what each line does in plain words, using a small built-in glossary (Python, PySpark, SQL,
// shell, Docker, Airflow). Nothing is sent anywhere. "Copy question" copies a ready prompt to paste
// into Claude when the built-in notes are not enough.
(function () {
  var MIN_LINES = 1, MIN_CHARS = 12;

  // [pattern, explanation]. First match wins per line, so specific rules come before general ones.
  var RULES = [
    // --- comments / blank
    [/^\s*(#|--|\/\/)/, function (l) { return "A comment. Ignored when the code runs; it is a note for the reader: " + q(l.replace(/^\s*(#|--|\/\/)\s?/, "")); }],
    // --- shell / docker
    [/^\s*\$?\s*pip install\s+(.+)/, function (l, m) { return "Installs the Python package(s) " + q(m[1]) + " from PyPI."; }],
    [/^\s*\$?\s*docker compose up/, "Starts every service listed in docker-compose.yml (add -d to run in the background)."],
    [/^\s*\$?\s*docker compose down/, "Stops and removes the containers that docker compose started."],
    [/^\s*\$?\s*docker run\b/, "Starts a new container from an image. -p maps ports host:container, -v mounts a folder, -e sets an environment variable."],
    [/^\s*\$?\s*docker build\b/, "Builds an image from the Dockerfile in the given folder (-t gives it a name)."],
    [/^\s*FROM\s+(\S+)/, function (l, m) { return "Dockerfile: start from the base image " + q(m[1]) + "."; }],
    [/^\s*RUN\s+/, "Dockerfile: run this command while building the image (its result is saved in a layer)."],
    [/^\s*COPY\s+/, "Dockerfile: copy files from your folder into the image."],
    [/^\s*WORKDIR\s+/, "Dockerfile: set the folder that later commands run in."],
    [/^\s*(CMD|ENTRYPOINT)\s+/, "Dockerfile: the command the container runs when it starts."],
    [/^\s*\$?\s*git\s+(\w+)/, function (l, m) { return "Git: " + ({ clone: "download a repository", add: "stage changes for the next commit", commit: "save the staged changes as a commit", push: "send your commits to GitHub", pull: "fetch and merge the latest commits", status: "show what has changed", checkout: "switch branch or restore files", log: "show commit history" }[m[1]] || "the " + m[1] + " command") + "."; }],
    [/^\s*\$?\s*(cd|ls|mkdir|cat|cp|mv|rm|python3?|node|export|echo|curl|wget)\b/, function (l, m) { return "Shell: " + ({ cd: "change folder", ls: "list files", mkdir: "make a folder", cat: "print a file", cp: "copy", mv: "move or rename", rm: "delete", python: "run a Python script", python3: "run a Python script", node: "run a JavaScript file", export: "set an environment variable for later commands", echo: "print text", curl: "fetch a URL", wget: "download a URL" }[m[1]]) + "."; }],
    // --- SQL
    [/^\s*WITH\s+(\w+)\s+AS/i, function (l, m) { return "SQL: defines a temporary named result " + q(m[1]) + " (a CTE) that the query below can use like a table."; }],
    [/^\s*SELECT\b/i, function (l) { return "SQL: choose which columns (or calculations) to return." + (/DISTINCT/i.test(l) ? " DISTINCT removes duplicate rows." : "") + (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(l) ? " Uses an aggregate function, which summarises many rows into one value." : "") + (/OVER\s*\(/i.test(l) ? " OVER(...) makes it a window function: computed per row, looking at related rows, without collapsing them." : ""); }],
    [/^\s*FROM\b/i, "SQL: the table(s) the rows come from."],
    [/^\s*(LEFT|RIGHT|INNER|FULL|CROSS)?\s*(OUTER\s+)?JOIN\b/i, function (l, m) { return "SQL: combine rows with another table. " + ({ LEFT: "LEFT keeps every row from the left table even with no match (NULLs fill the gaps).", RIGHT: "RIGHT keeps every row from the right table.", FULL: "FULL keeps unmatched rows from both sides.", CROSS: "CROSS pairs every row with every row." }[(m[1] || "").toUpperCase()] || "INNER keeps only rows that match on both sides.") + " ON says which columns must match."; }],
    [/^\s*WHERE\b/i, "SQL: keep only the rows that meet this condition (applied before grouping)."],
    [/^\s*GROUP BY\b/i, "SQL: put rows with the same values here into one group, so aggregates are computed per group."],
    [/^\s*HAVING\b/i, "SQL: filter groups after GROUP BY (WHERE filters rows, HAVING filters groups)."],
    [/^\s*ORDER BY\b/i, "SQL: sort the result (ASC is smallest first, DESC is largest first)."],
    [/^\s*LIMIT\b/i, "SQL: return only the first N rows."],
    [/^\s*CREATE\s+(TABLE|VIEW|INDEX)/i, function (l, m) { return "SQL: create a new " + m[1].toLowerCase() + "."; }],
    [/^\s*INSERT\s+INTO\b/i, "SQL: add new rows to a table."],
    [/^\s*UPDATE\b/i, "SQL: change values in existing rows (SET says what, WHERE says which rows)."],
    [/^\s*DELETE\s+FROM\b/i, "SQL: remove rows (always check the WHERE, or every row goes)."],
    // --- Airflow
    [/\bDAG\s*\(/, "Airflow: defines a DAG, the workflow — a set of tasks and the order they run in, plus its schedule."],
    [/(PythonOperator|BashOperator|@task)\b/, "Airflow: defines one task in the DAG (a step that Airflow schedules, runs and retries)."],
    [/\w+\s*>>\s*\w+/, "Airflow: sets the order — the task on the left must finish before the one on the right starts."],
    // --- PySpark
    [/SparkSession\.builder/, "PySpark: creates (or reuses) the SparkSession, your entry point to Spark."],
    [/spark\.read/, function (l) { return "PySpark: reads a file into a DataFrame" + (/csv/.test(l) ? " from CSV" : /parquet/.test(l) ? " from Parquet (a fast, column-based format)" : /json/.test(l) ? " from JSON" : "") + ". Spark is lazy: nothing is actually read until an action like show() or count()."; }],
    [/\.write\b/, "PySpark: writes the DataFrame out (mode('overwrite') replaces existing data, partitionBy splits it into folders by a column)."],
    [/\.withColumn\(/, "PySpark: adds a column (or replaces one with the same name) using the expression given."],
    [/\.groupBy\(/, "PySpark: groups rows by these columns; follow with .agg(...) to compute per-group values."],
    [/\.filter\(|\.where\(/, "PySpark: keeps only rows matching the condition."],
    [/\.join\(/, "PySpark: joins with another DataFrame on the given key(s); how= sets inner/left/etc."],
    [/\.(show|count|collect|toPandas)\(/, "PySpark: an action — this is the moment Spark actually runs the plan and produces results."],
    [/readStream|writeStream/, "Spark Structured Streaming: treats arriving data as an endless table and processes it in small batches."],
    // --- pandas
    [/pd\.read_(\w+)\(/, function (l, m) { return "pandas: loads a " + m[1] + " file into a DataFrame (a table in memory)."; }],
    [/\.groupby\(/, "pandas: groups rows by these columns, then a function like .sum() or .agg() runs per group."],
    [/\.merge\(/, "pandas: joins two DataFrames on matching columns (like SQL JOIN)."],
    // --- Python structure
    [/^\s*(from\s+(\S+)\s+)?import\s+(.+)/, function (l, m) { return "Loads code from " + (m[2] ? "the module " + q(m[2]) + ": " + q(m[3]) : q(m[3])) + " so you can use it below." + (/\bas\b/.test(l) ? " 'as' gives it a shorter name." : ""); }],
    [/^\s*@(\w[\w.]*)/, function (l, m) { return "A decorator: wraps the function below with " + q(m[1]) + ", adding behaviour without changing its code."; }],
    [/^\s*(async\s+)?def\s+(\w+)\s*\((.*)\)/, function (l, m) { return "Defines a function named " + q(m[2]) + (m[3].trim() ? " that takes " + q(m[3]) : " with no inputs") + ". The indented lines below are its body; it runs only when called."; }],
    [/^\s*class\s+(\w+)/, function (l, m) { return "Defines a class " + q(m[1]) + " — a blueprint for objects with their own data and methods."; }],
    [/^\s*return\b(.*)/, function (l, m) { return "Ends the function and hands back " + (m[1].trim() ? q(m[1].trim()) : "nothing (None)") + " to whoever called it."; }],
    [/^\s*yield\b/, "Hands back one value and pauses; the function becomes a generator that resumes on the next request."],
    [/^\s*for\s+(.+?)\s+in\s+(.+):/, function (l, m) { return "A loop: for each item in " + q(m[2]) + ", call it " + q(m[1]) + " and run the indented lines."; }],
    [/^\s*while\s+(.+):/, function (l, m) { return "A loop that repeats the indented lines as long as " + q(m[1]) + " is true."; }],
    [/^\s*if\s+__name__\s*==/, "Runs the code below only when this file is run directly, not when it is imported."],
    [/^\s*if\s+(.+):/, function (l, m) { return "Checks whether " + q(m[1]) + " is true; if so, runs the indented lines."; }],
    [/^\s*elif\s+(.+):/, function (l, m) { return "Otherwise, if " + q(m[1]) + " is true, runs these lines instead."; }],
    [/^\s*else\s*:/, "Otherwise (none of the conditions above were true), runs these lines."],
    [/^\s*try\s*:/, "Tries the indented code; if it raises an error, the matching except block handles it instead of crashing."],
    [/^\s*except\b\s*(\w*)/, function (l, m) { return "Handles " + (m[1] ? "a " + q(m[1]) + " error" : "any error") + " raised in the try block."; }],
    [/^\s*finally\s*:/, "Always runs at the end, error or not — good for cleanup."],
    [/^\s*with\s+(.+?)\s+as\s+(\w+)/, function (l, m) { return "Opens " + q(m[1]) + " as " + q(m[2]) + " and closes/cleans it up automatically when the block ends."; }],
    [/^\s*raise\b/, "Raises an error on purpose, stopping normal flow."],
    [/^\s*assert\b/, "Checks something must be true; if not, stops with an AssertionError (common in tests)."],
    [/^\s*print\(/, "Prints the value(s) to the output."],
    [/^\s*(\w+)\s*=\s*\[.*\bfor\b.*\bin\b.*\]/, function (l, m) { return "A list comprehension: builds the list " + q(m[1]) + " by looping and transforming items in one line."; }],
    [/^\s*(\w+)\s*=\s*lambda\b/, function (l, m) { return "Stores a tiny unnamed function (lambda) in " + q(m[1]) + "."; }],
    [/^\s*([\w.\[\]'"]+)\s*(\+|-|\*|\/)=/, function (l, m) { return "Updates " + q(m[1]) + " in place (" + m[2] + "= means " + m[1] + " = " + m[1] + " " + m[2] + " ...)."; }],
    [/^\s*([\w.,\s]+?)\s*=\s*(.+)/, function (l, m) { return "Stores the result of " + q(m[2]) + " in " + q(m[1].trim()) + "."; }],
    [/^\s*\w[\w.]*\(.*\)\s*$/, "Calls a function/method (runs it with the inputs in brackets)."]
  ];

  function q(s) { s = String(s).trim(); if (s.length > 60) s = s.slice(0, 57) + "…"; return "“" + s + "”"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function explainLine(line) {
    for (var i = 0; i < RULES.length; i++) {
      var m = line.match(RULES[i][0]);
      if (m) return typeof RULES[i][1] === "function" ? RULES[i][1](line, m) : RULES[i][1];
    }
    return "";
  }

  function looksLikeOutput(pre) {
    var fig = pre.closest("figure");
    return fig && fig.classList.contains("out");
  }

  function buildPanel(code) {
    var rows = [], lines = code.replace(/\s+$/, "").split("\n"), known = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l.trim()) continue;
      if (/^\s*[)\]}]+[,;]?\s*$/.test(l)) continue; // closing brackets
      var e = explainLine(l);
      if (e) known++;
      rows.push('<li><code>' + esc(l.trim()) + "</code><span>" + esc(e || "Continues the statement above, or a line the quick guide does not cover — ask Claude below.") + "</span></li>");
    }
    var head = '<p class="lfz-ex-head"><strong>Line by line</strong> · quick offline notes' + (known < rows.length ? " (" + (rows.length - known) + " line" + (rows.length - known === 1 ? "" : "s") + " not covered)" : "") + "</p>";
    return head + '<ol class="lfz-ex-list">' + rows.join("") + '</ol><p class="lfz-ex-foot"><button type="button" class="lfz-ex-ask">Copy question for Claude</button><span class="lfz-ex-msg" aria-live="polite"></span></p>';
  }

  function enhance(pre) {
    if (pre.dataset.lfzEx || looksLikeOutput(pre) || pre.closest(".kv") || pre.closest(".lfz-ex")) return;
    var code = pre.innerText || pre.textContent || "";
    if (code.trim().length < MIN_CHARS || code.trim().split("\n").length < MIN_LINES) return;
    pre.dataset.lfzEx = "1";
    var bar = document.createElement("div");
    bar.className = "lfz-ex-bar";
    bar.innerHTML = '<button type="button" class="lfz-ex-btn" aria-expanded="false">💡 Explain</button>';
    var panel = document.createElement("div");
    panel.className = "lfz-ex";
    panel.hidden = true;
    pre.insertAdjacentElement("afterend", bar);
    bar.insertAdjacentElement("afterend", panel);
    bar.firstChild.addEventListener("click", function () {
      var open = panel.hidden;
      if (open && !panel.innerHTML) {
        panel.innerHTML = buildPanel(pre.innerText || pre.textContent || "");
        panel.querySelector(".lfz-ex-ask").addEventListener("click", function () {
          var prompt = "I'm learning. Explain this code line by line for a beginner: what each line does, why it's needed, and one common mistake.\n\n```\n" + (pre.innerText || pre.textContent).trim() + "\n```";
          var msg = panel.querySelector(".lfz-ex-msg");
          (navigator.clipboard ? navigator.clipboard.writeText(prompt) : Promise.reject()).then(
            function () { msg.textContent = " Copied — paste it into Claude."; },
            function () { msg.textContent = " Could not copy on this device."; });
        });
      }
      panel.hidden = !open;
      this.setAttribute("aria-expanded", String(open));
      this.textContent = open ? "Hide explanation" : "💡 Explain";
    });
  }

  function scan(root) {
    if (!root.querySelectorAll) return;
    if (root.tagName === "PRE") enhance(root);
    var list = root.querySelectorAll("pre");
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  var css = ".lfz-ex-bar{margin:.25rem 0 .5rem}.lfz-ex-btn,.lfz-ex-ask{font:inherit;font-size:.85rem;padding:.3rem .7rem;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;opacity:.85}.lfz-ex-btn:hover,.lfz-ex-ask:hover{opacity:1}"
    + ".lfz-ex{border-left:3px solid #2a9d8f;padding:.5rem .9rem;margin:0 0 1rem;font-size:.92rem;background:rgba(42,157,143,.07);border-radius:0 8px 8px 0}"
    + ".lfz-ex-head{margin:.2rem 0 .5rem;opacity:.85}.lfz-ex-list{margin:0;padding-left:1.4rem}.lfz-ex-list li{margin:.45rem 0}.lfz-ex-list code{display:block;font-size:.82rem;opacity:.75;white-space:pre-wrap;word-break:break-word}.lfz-ex-list span{display:block;line-height:1.45}.lfz-ex-foot{margin:.6rem 0 .2rem}";
  function start() {
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    scan(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) scan(muts[i].addedNodes[j]);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.lfzExplain = { line: explainLine };
})();
