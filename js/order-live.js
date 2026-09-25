/*
 * Online ordering. Menu, availability, delivery days and prices come from the
 * kitchen backend (HCC_CONFIG.kitchenApi); orders go straight to it and the panel
 * turns into a live tracker. If the kitchen can't be reached, the page stays on
 * the static menu + WhatsApp flow in site.js (legacy).
 */
(function () {
  var cfg = window.HCC_CONFIG;
  var site = window.HCC_SITE;
  if (!cfg.kitchenApi || !site) return;

  var TRACK_KEY = "hcc-order";
  var STEPS = ["RECIBIDO", "ACEPTADO", "PREPARANDO", "EN_CAMINO", "ENTREGADO"];
  var kitchen, data;
  var lines = [];           // { id, name, price, qty, extras: [{ optionName, priceDelta }] }
  var filter = "all";
  var pay = "EFECTIVO";
  var pending = null;       // item id whose combo options are open
  var pin = null, map = null, marker = null;
  var tracking = null, poll = null, sending = false;

  var live = window.HCC_LIVE = { active: false, primary: primary, whatsapp: whatsapp };

  function $(id) { return document.getElementById(id); }
  function t() { return window.HCC_I18N[site.locale()]; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))); }
  function localeTag() { return site.locale() === "es" ? "es-EC" : "en-US"; }

  /* ---------- Menu data ---------- */

  // Sections tagged with the page language; untagged ones always show.
  function sections() {
    var l = site.locale();
    var mine = data.sections.filter(function (s) { return s.language === l; });
    var untagged = data.sections.filter(function (s) { return s.language !== "es" && s.language !== "en"; });
    return mine.length ? untagged.concat(mine) : data.sections;
  }
  function planItem() {
    var found = null;
    sections().forEach(function (s) { s.items.forEach(function (i) { if (i.featured && !found) found = i; }); });
    return found;
  }
  function findItem(id) {
    var found = null;
    data.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.id === id) found = i; }); });
    return found;
  }
  function dishSections() {
    var plan = planItem();
    return sections().map(function (s) {
      return { id: s.id, name: s.name, items: s.items.filter(function (i) { return i !== plan; }) };
    }).filter(function (s) { return s.items.length; });
  }

  /* ---------- Menu section (same markup and classes as the static menu) ---------- */

  function renderMenu() {
    var d = t();
    var plan = planItem();
    if (plan) {
      var desc = (plan.description || "").split("\n");
      var card = document.querySelector(".plan");
      card.querySelector("img").src = plan.imageUrl || card.querySelector("img").src;
      card.querySelector("img").alt = plan.name;
      card.querySelector("h3").textContent = plan.name;
      card.querySelector(".plan-body p[data-i18n]").textContent = desc[0];
      $("plan-dinners").innerHTML = desc.slice(1).filter(Boolean).map(function (line, i) {
        var parts = line.split(" — ");
        return '<li><span class="num">0' + (i + 1) + '</span><span><strong>' + esc(parts[0]) + "</strong>" +
          (parts[1] ? " — " + esc(parts.slice(1).join(" — ")) : "") + "</span></li>";
      }).join("");
      document.querySelectorAll("[data-plan-price]").forEach(function (el) {
        el.textContent = d.weeklyPlanKicker + " · " + money(plan.price);
      });
    }
    var secs = dishSections();
    if (filter !== "all" && !secs.some(function (s) { return s.id === filter; })) filter = "all";
    document.querySelector(".chips").innerHTML =
      '<button type="button" class="chip' + (filter === "all" ? " active" : "") + '" data-lfilter="all">' + esc(d.allDishes) + "</button>" +
      secs.map(function (s) {
        return '<button type="button" class="chip' + (filter === s.id ? " active" : "") + '" data-lfilter="' + s.id + '">' + esc(s.name) + "</button>";
      }).join("");
    var items = [];
    secs.forEach(function (s) { if (filter === "all" || filter === s.id) items = items.concat(s.items); });
    $("dishes").innerHTML = items.map(function (x) {
      return '<article class="dish">' + (x.imageUrl ? '<img src="' + esc(x.imageUrl) + '" alt="' + esc(x.name) + '" loading="lazy">' : "") +
        '<div class="dish-body"><div class="dish-top"><div><p class="dish-name">' + esc(x.name) + "</p></div><p>" + money(x.price) +
        '</p></div><p class="dish-desc">' + esc(x.description || "") + "</p></div></article>";
    }).join("");
  }

  /* ---------- Order panel ---------- */

  function qtyOf(id) {
    return lines.reduce(function (n, l) { return l.id === id ? n + l.qty : n; }, 0);
  }

  function optionsHtml(item, scope) {
    var d = t();
    return item.extraGroups.map(function (g) {
      var type = g.selectionType === "SINGLE" ? "radio" : "checkbox";
      return '<fieldset class="opts" data-group="' + g.id + '"><legend>' + esc(g.name) +
        (g.required ? " <small>*</small>" : "") + "</legend>" +
        g.options.map(function (o) {
          return '<label class="opt"><input type="' + type + '" name="' + scope + "-" + g.id + '" value="' + esc(o.name) + '" data-price="' + o.priceDelta + '"><span>' +
            esc(o.name) + "</span>" + (o.priceDelta > 0 ? "<em>+" + money(o.priceDelta) + "</em>" : "") + "</label>";
        }).join("") + "</fieldset>";
    }).join("") + '<p class="opts-error" hidden>' + esc(d.chooseOne) + "</p>";
  }

  // Selected options inside a container, or null when a required group is empty.
  function readOptions(box, item) {
    var extras = [], ok = true, missing = "";
    item.extraGroups.forEach(function (g) {
      var fs = box.querySelector('[data-group="' + g.id + '"]');
      var picked = fs ? fs.querySelectorAll("input:checked") : [];
      if (picked.length < (g.required ? Math.max(1, g.minSelect) : g.minSelect)) { ok = false; missing = missing || g.name; }
      if (g.maxSelect && picked.length > g.maxSelect) { ok = false; missing = missing || g.name; }
      Array.prototype.forEach.call(picked, function (i) {
        extras.push({ optionName: i.value, priceDelta: Number(i.getAttribute("data-price")) });
      });
    });
    var err = box.querySelector(".opts-error");
    if (err) { err.hidden = ok; err.textContent = t().chooseOne + " " + missing; }
    return ok ? extras : null;
  }

  function planLine() {
    var plan = planItem();
    if (!plan || !$("plan-check").checked) return null;
    var extras = plan.extraGroups.length ? readOptions($("plan-opts"), plan) : [];
    if (!extras) return false;
    return { id: plan.id, name: plan.name, price: plan.price, qty: 1, extras: extras };
  }

  function allLines() {
    var p = planLine();
    return p ? [p].concat(lines) : lines.slice();
  }

  function lineTotal(l) {
    return (l.price + l.extras.reduce(function (s, e) { return s + e.priceDelta; }, 0)) * l.qty;
  }

  function fee() {
    return pin ? kitchen.deliveryFee(data.zone, pin.lat, pin.lon) : null;
  }

  function renderOrder() {
    var d = t();
    // Delivery days from the kitchen schedule
    var runs = $("runs");
    var active = runs.querySelector(".run.active");
    var chosen = active && active.getAttribute("data-run");
    if (!data.deliveryDates.some(function (x) { return x.date === chosen; })) chosen = data.deliveryDates[0] && data.deliveryDates[0].date;
    runs.innerHTML = data.deliveryDates.length ? data.deliveryDates.map(function (x) {
      var day = new Date(x.date + "T12:00:00-05:00");
      var cut = new Date(x.cutoff);
      var label = new Intl.DateTimeFormat(localeTag(), { weekday: "long", day: "numeric", month: "short", timeZone: "America/Guayaquil" }).format(day);
      var due = new Intl.DateTimeFormat(localeTag(), { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Guayaquil" }).format(cut);
      return '<button type="button" class="run' + (x.date === chosen ? " active" : "") + '" data-run="' + x.date + '"><span style="text-transform:capitalize">' +
        esc(label) + "</span><small>" + esc(d.due) + " " + esc(due) + "</small></button>";
    }).join("") : '<p class="hint" style="grid-column:1/-1">' + esc(d.noDates) + "</p>";

    // Weekly plan checkbox (+ its combo options)
    var plan = planItem();
    var planBox = document.querySelector(".plan-check");
    planBox.hidden = !plan;
    var opts = $("plan-opts");
    if (!opts) {
      opts = document.createElement("div");
      opts.id = "plan-opts";
      opts.className = "combo";
      planBox.parentNode.insertBefore(opts, planBox.nextSibling);
    }
    if (plan) {
      $("plan-name").textContent = plan.name + " — " + money(plan.price);
      var keep = opts.getAttribute("data-item") === plan.id;
      if (!keep) { opts.innerHTML = optionsHtml(plan, "plan"); opts.setAttribute("data-item", plan.id); }
      opts.hidden = !plan.extraGroups.length || !$("plan-check").checked;
    }

    // Individual items
    var list = $("order-items");
    var html = "";
    dishSections().forEach(function (s) {
      s.items.forEach(function (x) {
        var n = qtyOf(x.id);
        html += '<li class="item-row"><div><p style="margin:0;font-size:.9rem;font-weight:500">' + esc(x.name) +
          '</p><p style="margin:0;font-size:.75rem;color:var(--muted)">' + money(x.price) + "</p>" +
          lines.filter(function (l) { return l.id === x.id && l.extras.length; }).map(function (l) {
            return '<p class="line-extras">' + l.qty + " × " + esc(l.extras.map(function (e) { return e.optionName; }).join(", ")) + "</p>";
          }).join("") +
          '</div><div class="qty"><button type="button" data-lminus="' + x.id + '" aria-label="' + esc(d.fewer + " " + x.name) + '">−</button><span>' + n +
          '</span><button type="button" data-lplus="' + x.id + '" aria-label="' + esc(d.more + " " + x.name) + '">+</button></div></li>';
        if (pending === x.id) {
          html += '<li class="combo" data-combo="' + x.id + '">' + optionsHtml(x, "item") +
            '<div class="combo-actions"><button type="button" class="btn btn-outline" data-lcancel>' + esc(d.cancel) +
            '</button><button type="button" class="btn btn-oxblood" data-ladd="' + x.id + '">' + esc(d.addToOrder) + "</button></div></li>";
        }
      });
    });
    list.innerHTML = html;

    // Online-only fields and labels
    document.querySelectorAll(".live-only").forEach(function (el) { el.hidden = false; });
    $("f-area-label").textContent = d.address;
    $("f-area").setAttribute("placeholder", d.addressPh);
    document.querySelectorAll("[data-pay]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-pay") === pay);
    });
    renderTotals();
  }

  function totals() {
    var sub = allLines().reduce(function (s, l) { return s + lineTotal(l); }, 0);
    var f = fee();
    return { sub: sub, fee: f, total: sub + (f || 0) };
  }

  function renderTotals() {
    if (tracking) return;
    var d = t(), x = totals();
    $("totals").innerHTML =
      "<div><dt>" + esc(d.subtotal) + "</dt><dd>" + money(x.sub) + "</dd></div>" +
      "<div><dt>" + esc(d.deliveryFee) + "</dt><dd>" + (x.fee == null ? "—" : money(x.fee)) + "</dd></div>" +
      '<div class="grand"><dt>' + esc(d.total) + "</dt><dd>" + money(x.total) + "</dd></div>";
    $("billing").hidden = x.total < data.billingThreshold;
    $("wa-primary").textContent = sending ? d.sending : d.placeOrder + " · " + money(x.total);
    $("wa-primary").disabled = sending;
    $("copy-msg").textContent = d.waInstead;
    $("copy-msg").hidden = false;
    var hint = $("checkout-hint");
    if (!hint.classList.contains("err")) hint.textContent = d.liveHint;
    if (pin && x.fee == null) setError(d.outOfZone);
  }

  function setError(msg) {
    var hint = $("checkout-hint");
    hint.textContent = msg || t().liveHint;
    hint.classList.toggle("err", !!msg);
  }

  /* ---------- Map (Leaflet, self-hosted in vendor/) ---------- */

  function loadLeaflet(cb) {
    if (window.L) return cb();
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/leaflet/leaflet.css";
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = "vendor/leaflet/leaflet.js";
    js.onload = cb;
    document.head.appendChild(js);
  }

  function initMap() {
    if (tracking) return;
    loadLeaflet(function () {
      if (map) { map.invalidateSize(); return; }
      map = L.map("f-map", { scrollWheelZoom: false }).setView([data.zone.restaurantLat, data.zone.restaurantLon], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      map.on("click", function (e) { setPin(e.latlng.lat, e.latlng.lng); });
    });
  }

  function setPin(lat, lon) {
    pin = { lat: lat, lon: lon };
    if (marker) marker.setLatLng([lat, lon]);
    else marker = L.circleMarker([lat, lon], { radius: 9, color: "#4a1512", weight: 3, fillColor: "#9c3b2e", fillOpacity: 0.9 }).addTo(map);
    map.panTo([lat, lon]);
    setError(null);
    renderTotals();
  }

  /* ---------- Submit ---------- */

  function primary() {
    if (tracking) return newOrder();
    submit();
  }

  function billingType(id) {
    var digits = id.replace(/\D/g, "");
    if (digits.length === 13 && digits === id) return "RUC";
    if (digits.length === 10 && digits === id) return "CEDULA";
    return "PASAPORTE";
  }

  function submit() {
    var d = t();
    var active = $("runs").querySelector(".run.active");
    var date = active && active.getAttribute("data-run");
    var p = planLine();
    if (p === false) return setError(d.chooseOne + " " + planItem().name);
    var all = allLines();
    var name = $("f-name").value.trim();
    var phone = $("f-phone").value.trim();
    var address = $("f-area").value.trim();
    var x = totals();
    var billingId = $("f-billing-id").value.trim();
    if (!date) return setError(d.noDates);
    if (!all.length) return setError(d.needItems);
    if (name.length < 2) return setError(d.needName);
    if (phone.replace(/\D/g, "").length < 7) return setError(d.needPhone);
    if (!address) return setError(d.needAddress);
    if (!pin) return setError(d.needPin);
    if (x.fee == null) return setError(d.outOfZone);
    if (x.total >= data.billingThreshold && !billingId) return setError(d.needBilling);

    var servings = $("f-servings").value.trim();
    var notes = [servings && servings !== "1" ? d.msgHouse + ": " + servings : "", $("f-notes").value.trim()].filter(Boolean).join(" · ");
    sending = true;
    setError(null);
    renderTotals();
    kitchen.order({
      customerName: name,
      customerPhone: phone,
      deliveryLat: pin.lat,
      deliveryLon: pin.lon,
      deliveryAddress: address,
      paymentMethod: pay,
      orderType: "DELIVERY",
      deliveryDate: date,
      notes: notes.slice(0, 300) || undefined,
      consumidorFinal: !billingId,
      billingIdType: billingId ? billingType(billingId) : undefined,
      billingIdNumber: billingId || undefined,
      billingName: billingId ? ($("f-billing-name").value.trim() || name) : undefined,
      items: all.map(function (l) { return { menuItemId: l.id, quantity: l.qty, extras: l.extras }; })
    }).then(function (r) {
      try { localStorage.setItem(TRACK_KEY, JSON.stringify({ token: r.token, at: Date.now() })); } catch (e) {}
      lines = [];
      $("plan-check").checked = false;
      sending = false;
      track(r.token, true);
    }).catch(function (e) {
      sending = false;
      renderTotals();
      setError(e.message);
    });
  }

  /* ---------- Tracker (the order animation) ---------- */

  function track(token, fresh) {
    tracking = { token: token, fresh: fresh, order: null };
    $("order-form").hidden = true;
    $("order-track").hidden = false;
    $("totals").hidden = true;
    $("copy-msg").hidden = true;
    setError(null);
    $("checkout-hint").textContent = "";
    $("wa-primary").textContent = t().newOrder;
    $("wa-primary").disabled = false;
    renderTrack();
    refresh();
    clearInterval(poll);
    poll = setInterval(function () {
      if ($("order").classList.contains("open")) refresh();
    }, 15000);
  }

  function refresh() {
    if (!tracking) return;
    var token = tracking.token;
    kitchen.status(token).then(function (o) {
      if (!tracking || tracking.token !== token) return;
      tracking.order = o;
      renderTrack();
      if (["ENTREGADO", "RECHAZADO", "CANCELADO"].indexOf(o.status) >= 0) clearInterval(poll);
    }).catch(function () {});
  }

  function renderTrack() {
    if (!tracking) return;
    var d = t(), o = tracking.order;
    var failed = o && (o.status === "RECHAZADO" || o.status === "CANCELADO");
    var at = o ? STEPS.indexOf(o.status) : 0;
    var when = o && o.scheduledFor
      ? new Intl.DateTimeFormat(localeTag(), { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guayaquil" }).format(new Date(o.scheduledFor))
      : "";
    var html = '<div class="track' + (tracking.fresh ? " fresh" : "") + '">' +
      '<div class="track-hero"><span class="track-seal' + (failed ? " failed" : "") + '"><svg><use href="#house"></use></svg></span>' +
      '<p class="kicker">' + esc(d.trackKicker) + (o ? " · " + esc(o.code) : "") + "</p>" +
      "<h3>" + esc(failed ? d.stRejected : at >= 1 ? d["st" + at] : d.trackSent) + "</h3>" +
      (when ? '<p class="track-date">' + esc(d.trackFor) + " · " + esc(when) + "</p>" : "") + "</div>";
    if (failed) {
      html += o.rejectionReason ? '<p class="track-note">' + esc(o.rejectionReason) + "</p>" : "";
    } else {
      html += '<ol class="track-steps">' + STEPS.map(function (s, i) {
        var cls = i < at ? "done" : i === at ? "now" : "";
        return '<li class="' + cls + '" style="--i:' + i + '"><span class="dot"></span><div><strong>' + esc(d["st" + i]) +
          "</strong><span>" + esc(d["st" + i + "b"]) + "</span></div></li>";
      }).join("") + "</ol>";
    }
    if (o) {
      html += '<ul class="track-items">' + o.items.map(function (i) {
        return "<li>" + i.quantity + " × " + esc(i.name) + (i.extras.length ? " <small>" + esc(i.extras.join(", ")) + "</small>" : "") + "</li>";
      }).join("") + "</ul>" +
        '<dl class="totals"><div><dt>' + esc(d.deliveryFee) + "</dt><dd>" + money(o.deliveryFee) + '</dd></div><div class="grand"><dt>' +
        esc(d.total) + "</dt><dd>" + money(o.total) + "</dd></div></dl>";
      if (o.bankTransferDetails && !failed) {
        html += '<p class="kicker" style="margin-top:1.25rem">' + esc(d.transferTo) + '</p><p class="track-note">' + esc(o.bankTransferDetails) + "</p>";
      }
    }
    $("order-track").innerHTML = html + "</div>";
    tracking.fresh = false;
  }

  function newOrder() {
    try { localStorage.removeItem(TRACK_KEY); } catch (e) {}
    tracking = null;
    clearInterval(poll);
    $("order-track").hidden = true;
    $("order-track").innerHTML = "";
    $("order-form").hidden = false;
    $("totals").hidden = false;
    renderOrder();
    initMap();
  }

  /* ---------- WhatsApp (legacy channel, same message style as before) ---------- */

  function whatsapp() {
    var d = t();
    var active = $("runs").querySelector(".run.active");
    var p = planLine() || null;
    var text = [
      d.msgHello.replace("{host}", cfg.host).replace("{name}", cfg.siteName), "",
      d.msgName + ": " + ($("f-name").value.trim() || d.addName),
      d.phone + ": " + $("f-phone").value.trim(),
      d.msgArea + ": " + ($("f-area").value.trim() || d.addArea),
      pin ? "https://maps.google.com/?q=" + pin.lat.toFixed(6) + "," + pin.lon.toFixed(6) : "",
      d.msgHouse + ": " + ($("f-servings").value.trim() || "1"),
      d.msgDelivery + ": " + (active ? active.textContent : ""), "",
      p ? p.name + " — " + money(p.price) + (p.extras.length ? " (" + p.extras.map(function (e) { return e.optionName; }).join(", ") + ")" : "") : d.msgPlanNo
    ];
    if (lines.length) {
      text.push("", d.msgItems + ":");
      lines.forEach(function (l) {
        text.push("- " + l.name + " × " + l.qty + (l.extras.length ? " (" + l.extras.map(function (e) { return e.optionName; }).join(", ") + ")" : "") + " — " + money(lineTotal(l)));
      });
    }
    var notes = $("f-notes").value.trim();
    if (notes) text.push("", d.msgNotes + ": " + notes);
    site.sendWa(text.filter(function (l, i, a) { return l !== "" || a[i - 1] !== ""; }).join("\n"));
  }

  /* ---------- Events ---------- */

  document.addEventListener("click", function (e) {
    if (!live.active) return;
    var el;
    if ((el = e.target.closest("[data-lfilter]"))) { filter = el.getAttribute("data-lfilter"); renderMenu(); }
    if ((el = e.target.closest("[data-lplus]"))) {
      var item = findItem(el.getAttribute("data-lplus"));
      if (item.extraGroups.length) { pending = item.id; renderOrder(); return; }
      var same = lines.filter(function (l) { return l.id === item.id; })[0];
      if (same) same.qty++;
      else lines.push({ id: item.id, name: item.name, price: item.price, qty: 1, extras: [] });
      renderOrder();
    }
    if ((el = e.target.closest("[data-lminus]"))) {
      var id = el.getAttribute("data-lminus");
      for (var i = lines.length - 1; i >= 0; i--) {
        if (lines[i].id !== id) continue;
        if (--lines[i].qty <= 0) lines.splice(i, 1);
        break;
      }
      renderOrder();
    }
    if ((el = e.target.closest("[data-ladd]"))) {
      var it = findItem(el.getAttribute("data-ladd"));
      var extras = readOptions(el.closest(".combo"), it);
      if (!extras) return;
      lines.push({ id: it.id, name: it.name, price: it.price, qty: 1, extras: extras });
      pending = null;
      renderOrder();
    }
    if (e.target.closest("[data-lcancel]")) { pending = null; renderOrder(); }
    if ((el = e.target.closest("[data-pay]"))) { pay = el.getAttribute("data-pay"); renderOrder(); }
    if (e.target.closest("[data-open-order]")) {
      if (tracking) refresh();
      setTimeout(initMap, 60);
    }
  });
  document.addEventListener("change", function (e) {
    if (!live.active) return;
    if (e.target.id === "plan-check" || e.target.closest("#plan-opts")) renderOrder();
  });
  document.addEventListener("input", function (e) {
    if (live.active && e.target.closest("#order-form")) { setError(null); renderTotals(); }
  });
  $("f-locate").addEventListener("click", function () {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      loadLeaflet(function () { initMap(); setTimeout(function () { setPin(p.coords.latitude, p.coords.longitude); map.setZoom(16); }, 100); });
    });
  });

  /* ---------- Boot ---------- */

  function onApply() {
    if (!live.active) return;
    renderMenu();
    if (tracking) {
      renderTrack();
      $("wa-primary").textContent = t().newOrder;
      $("copy-msg").hidden = true;
      $("checkout-hint").textContent = "";
    } else {
      renderOrder();
    }
  }

  var s = document.createElement("script");
  s.src = cfg.kitchenApi.replace(/\/$/, "") + "/embed/kitchen.js";
  s.onload = function () {
    kitchen = window.DarkKitchen(cfg.kitchenApi, cfg.kitchenBrand);
    kitchen.menu().then(function (m) {
      data = m;
      live.active = true;
      site.onApply = onApply;
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(TRACK_KEY) || "null"); } catch (e) {}
      if (saved && saved.token && Date.now() - saved.at < 14 * 86400000) track(saved.token, false);
      onApply();
    }).catch(function () { /* kitchen unreachable: keep the WhatsApp flow */ });
  };
  document.head.appendChild(s);
})();
