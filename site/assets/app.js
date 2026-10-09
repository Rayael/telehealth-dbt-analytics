(function () {
  "use strict";

  var root = document.documentElement;
  var nf = new Intl.NumberFormat("en-US");
  var charts = {};
  var data = null;

  // ---------- helpers
  function css(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }
  function pct(x, digits) {
    return (x * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }
  function monthLabel(ym) {
    var names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var p = ym.split("-");
    return names[parseInt(p[1], 10) - 1] + " " + p[0].slice(2);
  }
  function words(s) {
    s = s.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function tableHtml(head, rows) {
    var h = "<table><thead><tr>" + head.map(function (c, i) {
      return "<th" + (i > 0 ? ' class="num"' : "") + ">" + c + "</th>";
    }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr>" + r.map(function (c, i) {
        return "<td" + (i > 0 ? ' class="num"' : "") + ">" + c + "</td>";
      }).join("") + "</tr>";
    });
    return h + "</tbody></table>";
  }

  // ---------- links that depend on where the site is hosted
  (function repoLinks() {
    var host = location.hostname;
    var user = null, repo = null;
    if (/\.github\.io$/.test(host)) {
      user = host.split(".")[0];
      repo = location.pathname.split("/")[1] || null;
    }
    var base = user && repo ? "https://github.com/" + user + "/" + repo : null;
    var link = document.getElementById("repo-link");
    if (base) {
      link.href = base;
    } else {
      link.style.display = "none";
    }
    document.querySelectorAll(".repo-doc").forEach(function (a) {
      if (base) a.href = base + "/" + a.getAttribute("data-path");
      else a.removeAttribute("href");
    });
    if (user) document.querySelectorAll(".gh-user").forEach(function (s) { s.textContent = user; });
  })();

  // ---------- theme
  var themeBtn = document.getElementById("theme");
  function currentTheme() {
    return root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncThemeButton() {
    themeBtn.textContent = currentTheme() === "dark" ? "Light mode" : "Dark mode";
  }
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage can be blocked, the page still works */ }
  syncThemeButton();
  themeBtn.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    syncThemeButton();
    if (data) drawCharts();
  });

  // ---------- menu highlight
  (function scrollSpy() {
    var links = {};
    document.querySelectorAll(".menu a[href^='#']").forEach(function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && links[e.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
          links[e.target.id].setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-25% 0px -65% 0px" });
    document.querySelectorAll("main section").forEach(function (s) { io.observe(s); });
  })();

  // ---------- copy buttons
  document.querySelectorAll(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.parentNode.querySelector("pre").innerText;
      var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  // ---------- table toggles
  document.querySelectorAll(".chart-card").forEach(function (card) {
    var btn = card.querySelector(".tbl-btn");
    var plot = card.querySelector(".plot");
    var wrap = card.querySelector(".table-wrap");
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "Chart" : "Table";
      plot.hidden = on;
      wrap.hidden = !on;
    });
  });

  // ---------- chart plumbing
  var valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.format) return;
      var ctx = chart.ctx;
      var horizontal = chart.options.indexAxis === "y";
      ctx.save();
      ctx.fillStyle = css("--ink");
      ctx.font = "13px " + css("--font");
      chart.getDatasetMeta(0).data.forEach(function (bar, i) {
        var text = opts.format(chart.data.datasets[0].data[i], i);
        if (horizontal) {
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(text, bar.x + 6, bar.y);
        } else {
          ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText(text, bar.x, bar.y - 4);
        }
      });
      ctx.restore();
    }
  };

  function baseOptions(extra) {
    var ink2 = css("--ink-2");
    var line = css("--line");
    var o = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 6, right: 6 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css("--surface"),
          titleColor: css("--ink"),
          bodyColor: css("--ink-2"),
          footerColor: css("--ink"),
          borderColor: line,
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          cornerRadius: 6,
          usePointStyle: true
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: line }, ticks: { color: ink2, maxRotation: 0 } },
        y: { grid: { color: line }, border: { display: false }, ticks: { color: ink2 }, beginAtZero: true }
      }
    };
    return deepMerge(o, extra || {});
  }
  function deepMerge(a, b) {
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") {
        deepMerge(a[k], b[k]);
      } else {
        a[k] = b[k];
      }
    });
    return a;
  }
  function legendOn() {
    return {
      display: true, position: "top", align: "start",
      labels: {
        color: css("--ink-2"), usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16,
        sort: function (a, b) { return a.datasetIndex - b.datasetIndex; }
      }
    };
  }
  function mount(id, config) {
    var canvas = document.querySelector("#" + id + " canvas");
    if (charts[id]) charts[id].destroy();
    config.data.datasets.forEach(function (d) {
      if (typeof d.backgroundColor === "string" && !d.hoverBackgroundColor) d.hoverBackgroundColor = d.backgroundColor;
      if (typeof d.borderColor === "string" && !d.hoverBorderColor) d.hoverBorderColor = d.borderColor;
    });
    charts[id] = new Chart(canvas, config);
  }
  function setTable(id, head, rows) {
    document.querySelector("#" + id + " .table-wrap").innerHTML = tableHtml(head, rows);
  }

  // ---------- static (non chart) parts
  function renderStatic(m) {
    var byLayer = { bronze: [], silver: [], gold: [] };
    m.tables.forEach(function (t) { byLayer[t.schema].push(t); });
    var bronzeRows = byLayer.bronze.reduce(function (s, t) { return s + t.rows; }, 0);

    document.getElementById("flow").innerHTML =
      '<div class="stage" data-layer="bronze"><b>Bronze</b><span>' + nf.format(bronzeRows) + " raw rows in " + byLayer.bronze.length + " tables</span></div>" +
      '<div class="arrow" aria-hidden="true">&rarr;</div>' +
      '<div class="stage" data-layer="silver"><b>Silver</b><span>' + byLayer.silver.length + " tables and views, with quality checks</span></div>" +
      '<div class="arrow" aria-hidden="true">&rarr;</div>' +
      '<div class="stage" data-layer="gold"><b>Gold</b><span>' + nf.format(m.summary.consultations) + " consultations in a star schema</span></div>";

    var text = {
      bronze: "Files as delivered. Every column is text, with the load time and file name added. Nothing is cleaned here.",
      silver: "Types, trimming and casing, two date formats, duplicates removed. Rows that break a rule are flagged and set aside.",
      gold: "Five dimensions, one fact table with surrogate keys and unknown members, and two reporting marts."
    };
    var layers = document.getElementById("layers");
    layers.innerHTML = "";
    ["bronze", "silver", "gold"].forEach(function (l) {
      var items = byLayer[l].map(function (t) {
        return "<li><code>" + t.name + "</code><span>" + nf.format(t.rows) + (t.rows === 1 ? " row" : " rows") + "</span></li>";
      }).join("");
      layers.appendChild(el('<div class="layer" data-layer="' + l + '"><h3>' + words(l) + "</h3><p>" + text[l] + "</p><ul>" + items + "</ul></div>"));
    });

    // data quality ledger
    var r = m.reconciliation;
    var parts = [
      { label: "In the fact table", n: r.fact_rows, color: "var(--s1)" },
      { label: "Rejected, in quarantine", n: r.rejected_rows, color: "var(--s2)" },
      { label: "Duplicates removed", n: r.duplicates_removed, color: "var(--muted-fill)" }
    ];
    var ledger = document.getElementById("ledger");
    var key = document.getElementById("ledger-key");
    ledger.innerHTML = ""; key.innerHTML = "";
    parts.forEach(function (p) {
      ledger.appendChild(el('<i style="flex:' + p.n + ';background:' + p.color + '" title="' + p.label + ": " + nf.format(p.n) + '"></i>'));
      key.appendChild(el('<li><b>' + nf.format(p.n) + '</b><span class="sw" style="background:' + p.color + '"></span>' + p.label + " (" + pct(p.n / r.bronze_rows) + ")</li>"));
    });
    key.insertAdjacentHTML("afterbegin", "<li><b>" + nf.format(r.bronze_rows) + "</b>Consultation rows delivered</li>");
    document.getElementById("ledger-note").textContent =
      "Unexplained rows: " + nf.format(r.unexplained_rows) + ". A test fails the build if this number is not 0.";

    var rej = {};
    m.rejected.forEach(function (x) { rej[x.reason] = x.n; });
    var patientsBronze = (byLayer.bronze.filter(function (t) { return t.name === "raw_patients"; })[0] || {}).rows || 0;
    var rules = [
      ["The same consultation delivered twice", "Keeps one row per consultation id", r.duplicates_removed],
      ["Consultation ends before it starts", "Flagged and moved to quarantine", rej.end_before_start || 0],
      ["Consultation starts before it was requested", "Flagged and moved to quarantine", rej.start_before_request || 0],
      ["Patient missing from the patient file", "Kept, linked to the unknown patient", m.unknown_links.unknown_patient],
      ["Triage code missing", "Kept, linked to the not triaged member", m.unknown_links.not_triaged],
      ["Patient delivered more than once", "The latest version wins", Math.max(patientsBronze - m.summary.patients, 0)],
      ["Mixed casing, extra spaces, gender written many ways", "Trimmed and mapped to one value per category", ""],
      ["Dates as 2025-03-15 or 15.03.1985, a few impossible", "Both formats read, impossible dates become null", ""],
      ["Satisfaction score outside 1 to 5", "Set to null", ""]
    ];
    document.querySelector("#rules tbody").innerHTML = rules.map(function (x) {
      return "<tr><td>" + x[0] + "</td><td>" + x[1] + '</td><td class="num">' + (x[2] === "" ? "" : nf.format(x[2])) + "</td></tr>";
    }).join("");

    // specialties
    document.querySelector("#specialty tbody").innerHTML = m.specialties.map(function (s) {
      return "<tr><td>" + s.specialty + '</td><td class="num">' + nf.format(s.n) + '</td><td class="num">' + s.avg_duration.toFixed(1) +
        '</td><td class="num">' + s.avg_satisfaction.toFixed(2) + '</td><td class="num">' + pct(s.referral_rate) + "</td></tr>";
    }).join("");

    // tests
    var t = m.tests;
    if (t) {
      var items = [
        [t.models, "models"], [t.data_tests, "data tests"], [t.unit_tests, "unit tests"],
        [t.passed, "checks passed"], [t.warned, t.warned === 1 ? "warning" : "warnings"], [t.failed, "failed"]
      ];
      document.getElementById("counts").innerHTML = items.map(function (i) {
        return "<li><b>" + i[0] + "</b>" + i[1] + "</li>";
      }).join("");
      if (t.warnings && t.warnings.length && t.warnings[0].rows) {
        document.getElementById("warn-note").textContent =
          "The source test on duplicate consultation ids is set to warn and finds " + nf.format(t.warnings[0].rows) +
          " rows. The duplicates are in the raw data by design, and silver removes them.";
      }
    }
  }

  // ---------- charts
  function drawCharts() {
    var m = data;
    var s1 = css("--s1"), s2 = css("--s2"), s3 = css("--s3");
    var surface = css("--surface"), ink = css("--ink");
    var series = { "Phone call": s1, "In-app chat": s2, "Video call": s3 };
    var order = ["Phone call", "In-app chat", "Video call"];

    // consultations per month by channel
    var months = [];
    m.monthly_channel.forEach(function (r) { if (months.indexOf(r.month) < 0) months.push(r.month); });
    var counts = {};
    m.monthly_channel.forEach(function (r) { counts[r.month + "|" + r.channel] = r.n; });
    mount("c-month", {
      type: "bar",
      data: {
        labels: months.map(monthLabel),
        datasets: order.map(function (ch) {
          return {
            label: ch, backgroundColor: series[ch], borderColor: surface, borderWidth: 2, borderSkipped: false, borderRadius: 2,
            data: months.map(function (mo) { return counts[mo + "|" + ch] || 0; })
          };
        })
      },
      options: baseOptions({
        plugins: {
          legend: legendOn(),
          tooltip: { callbacks: { footer: function (items) {
            return "Total " + nf.format(items.reduce(function (s, i) { return s + i.parsed.y; }, 0));
          } } }
        },
        scales: {
          x: { stacked: true, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { stacked: true, ticks: { callback: function (v) { return nf.format(v); } } }
        }
      })
    });
    setTable("c-month", ["Month"].concat(order).concat(["Total"]), months.map(function (mo) {
      var vals = order.map(function (ch) { return counts[mo + "|" + ch] || 0; });
      return [monthLabel(mo)].concat(vals.map(nf.format)).concat([nf.format(vals.reduce(function (a, b) { return a + b; }, 0))]);
    }));

    // wait by triage
    var tri = m.wait_by_triage;
    mount("c-wait", {
      type: "bar",
      data: {
        labels: tri.map(function (r) { return r.label; }),
        datasets: [
          { label: "Average wait", data: tri.map(function (r) { return r.avg_wait; }), backgroundColor: s1, borderColor: surface, borderWidth: 2, borderRadius: 2, order: 2 },
          { label: "90th percentile", data: tri.map(function (r) { return r.p90_wait; }), backgroundColor: s2, borderColor: surface, borderWidth: 2, borderRadius: 2, order: 2 },
          {
            type: "line", label: "Target wait", data: tri.map(function (r) { return r.target; }), showLine: false,
            pointStyle: "line", pointRadius: 26, pointHoverRadius: 28, pointBorderWidth: 3, pointBorderColor: ink,
            pointBackgroundColor: ink, borderColor: ink, order: 1
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: legendOn(),
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + c.parsed.y + " min"; } } }
        },
        scales: { y: { title: { display: true, text: "Minutes", color: css("--ink-2") } } }
      })
    });
    setTable("c-wait", ["Triage level", "Consultations", "Avg wait (min)", "P90 wait (min)", "Target (min)"], tri.map(function (r) {
      return [r.label, nf.format(r.n), r.avg_wait, r.p90_wait, r.target];
    }));

    // share within target
    mount("c-target", {
      type: "bar",
      data: {
        labels: tri.map(function (r) { return r.label + " (" + r.target + " min)"; }),
        datasets: [{ label: "Within target", data: tri.map(function (r) { return r.share_within_target * 100; }), backgroundColor: s1, borderRadius: 3, barPercentage: 0.7 }]
      },
      options: baseOptions({
        indexAxis: "y",
        layout: { padding: { right: 44 } },
        plugins: {
          tooltip: { callbacks: { label: function (c) { return c.parsed.x.toFixed(1) + "% started within target"; } } },
          valueLabels: { format: function (v) { return v.toFixed(0) + "%"; } }
        },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: function (v) { return v + "%"; } }, grid: { color: css("--line") } },
          y: { grid: { display: false }, beginAtZero: false }
        }
      }),
      plugins: [valueLabels]
    });
    setTable("c-target", ["Triage level", "Target (min)", "Consultations", "Within target"], tri.map(function (r) {
      return [r.label, r.target, nf.format(r.n), pct(r.share_within_target)];
    }));

    // by hour
    mount("c-hour", {
      type: "bar",
      data: {
        labels: m.by_hour.map(function (r) { return r.hour; }),
        datasets: [{ label: "Requests", data: m.by_hour.map(function (r) { return r.n; }), backgroundColor: s1, borderRadius: 2, barPercentage: 0.8 }]
      },
      options: baseOptions({
        plugins: { tooltip: { callbacks: {
          title: function (items) { var h = +items[0].label; return pad(h) + ":00 to " + pad(h) + ":59"; },
          label: function (c) { return nf.format(c.parsed.y) + " requests"; }
        } } },
        scales: { x: { ticks: { callback: function (v, i) { return i % 3 === 0 ? pad(i) + "h" : ""; }, autoSkip: false } },
                  y: { ticks: { callback: function (v) { return nf.format(v); } } } }
      })
    });
    setTable("c-hour", ["Hour", "Requests"], m.by_hour.map(function (r) { return [pad(r.hour) + ":00", nf.format(r.n)]; }));

    // age bands
    var total = m.age_bands.reduce(function (s, r) { return s + r.n; }, 0);
    mount("c-age", {
      type: "bar",
      data: {
        labels: m.age_bands.map(function (r) { return r.band; }),
        datasets: [{ label: "Consultations", data: m.age_bands.map(function (r) { return r.n; }), backgroundColor: s1, borderRadius: 3, barPercentage: 0.6 }]
      },
      options: baseOptions({
        plugins: {
          tooltip: { callbacks: { label: function (c) { return nf.format(c.parsed.y) + " (" + pct(c.parsed.y / total) + ")"; } } },
          valueLabels: { format: function (v) { return nf.format(v); } }
        },
        scales: { y: { ticks: { callback: function (v) { return nf.format(v); } } } },
        layout: { padding: { top: 22 } }
      }),
      plugins: [valueLabels]
    });
    setTable("c-age", ["Age band", "Consultations", "Share"], m.age_bands.map(function (r) { return [r.band, nf.format(r.n), pct(r.n / total)]; }));

    // outcomes
    mount("c-outcome", {
      type: "bar",
      data: {
        labels: m.outcomes.map(function (r) { return words(r.outcome); }),
        datasets: [{ label: "Consultations", data: m.outcomes.map(function (r) { return r.n; }), backgroundColor: s1, borderRadius: 3, barPercentage: 0.6 }]
      },
      options: baseOptions({
        indexAxis: "y",
        layout: { padding: { right: 52 } },
        plugins: {
          tooltip: { callbacks: { label: function (c) { return nf.format(c.parsed.x) + " (" + pct(c.parsed.x / total) + ")"; } } },
          valueLabels: { format: function (v) { return nf.format(v); } }
        },
        scales: { x: { ticks: { callback: function (v) { return nf.format(v); } } }, y: { grid: { display: false }, beginAtZero: false } }
      }),
      plugins: [valueLabels]
    });
    setTable("c-outcome", ["Outcome", "Consultations", "Share"], m.outcomes.map(function (r) { return [words(r.outcome), nf.format(r.n), pct(r.n / total)]; }));
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- load
  fetch("data/metrics.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (m) {
      data = m;
      renderStatic(m);
      var go = function () { drawCharts(); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
    })
    .catch(function () {
      var box = '<div class="err">The data file <code>data/metrics.json</code> could not be loaded. Run <code>make site</code> and serve the <code>site</code> folder with <code>make serve</code>.</div>';
      ["flow", "layers"].forEach(function (id) { document.getElementById(id).innerHTML = box; });
    });
})();
