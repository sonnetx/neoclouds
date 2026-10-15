// The Neocloud Guide: views, supply network, timeline, directory, profiles
// and price chart. Provider data lives in providers.js. The timeline, price
// sources and network settings live in background.js.
(function () {
  'use strict';

  var PROVIDERS = window.NEOCLOUD_PROVIDERS || [];
  var TIMELINE = window.NEOCLOUD_TIMELINE || [];
  var NETCFG = window.NEOCLOUD_NETWORK || { aliases: {}, skip: [], labels: {}, minBuyerLinks: 2 };

  var CATEGORIES = [
    // Broad company types, judged by each company's main business today. Products change too often to sort by.
    { id: 'neocloud', plural: 'Neoclouds', single: 'Neocloud', blurb: 'Companies whose main business is renting AI accelerator capacity. This includes AI compute units of larger groups and state-backed compute companies.' },
    { id: 'hyperscaler', plural: 'Hyperscalers', single: 'Hyperscaler', blurb: 'The largest general-purpose public clouds. These profiles cover only their AI accelerator business.' },
    { id: 'othercloud', plural: 'Other clouds', single: 'Cloud provider', blurb: 'General-purpose cloud, hosting, CDN and telecom companies that rent GPUs alongside their main business.' },
    { id: 'platform', plural: 'AI platforms', single: 'AI platform', blurb: 'Inference, serverless and AI software platforms that sell compute through their own software.' },
    { id: 'marketplace', plural: 'Marketplaces', single: 'Marketplace', blurb: 'Companies that sell GPU capacity owned by other operators.' },
    { id: 'developer', plural: 'Data center developers', single: 'Data center developer', blurb: 'Companies that build powered campuses and lease them to clouds and labs. Most began as Bitcoin miners.' },
    { id: 'lab', plural: 'AI labs', single: 'AI lab', blurb: 'AI labs that run their own large compute fleets and sell some of that capacity.' }
  ];
  var CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.id] = c; });

  var REGIONS = ['North America', 'Europe', 'Asia-Pacific', 'Middle East and Africa', 'Latin America'];

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(sessionStorage.getItem('ncg:' + key));
      sessionStorage.setItem('ncg:' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }
  function families(p) {
    var f = {};
    (p.accelerators || []).forEach(function (a) {
      var s = a.toLowerCase();
      if (s.indexOf('nvidia') > -1 || /\b(h100|h200|b200|b300|gb200|gb300|a100|l40s|rtx|vera rubin)\b/.test(s)) f.nvidia = 1;
      else if (s.indexOf('amd') > -1 || /\bmi\d{3}/.test(s)) f.amd = 1;
      else if (s.indexOf('tpu') > -1) f.tpu = 1;
      else f.other = 1;
    });
    return f;
  }
  function familyLabel(p) {
    var f = families(p), out = [];
    if (f.nvidia) out.push('NVIDIA');
    if (f.amd) out.push('AMD');
    if (f.tpu) out.push('TPU');
    if (f.other) out.push('Other');
    return out.join(', ');
  }
  function foundedNum(p) { var n = parseInt(p.founded, 10); return isNaN(n) ? null : n; }
  function citedParagraphs(text, sentCites, scope) {
    var sentences = String(text || '').replace(/([.!?])\s+(?=[A-Z0-9$\u20ac])/g, '$1\u0001').split('\u0001').filter(function (s) { return s.trim(); });
    var html = sentences.map(function (s, i) {
      return esc(s) + citeHTML(((sentCites || [])[i] || []).map(function (k) { return k + 1; }), scope);
    });
    if (text.length < 650 || sentences.length < 4) return '<p>' + html.join(' ') + '</p>';
    var half = Math.ceil(sentences.length / 2);
    return '<p>' + html.slice(0, half).join(' ') + '</p><p>' + html.slice(half).join(' ') + '</p>';
  }
  function splitParagraphs(text) {
    if (!text) return [];
    if (text.length < 650) return [text];
    // Split only at sentence ends followed by whitespace, so decimals
    // such as $7.4B stay intact.
    var sentences = text.replace(/([.!?])\s+(?=[A-Z0-9$€])/g, '$1\u0001').split('\u0001');
    if (sentences.length < 4) return [text];
    var half = Math.ceil(sentences.length / 2);
    return [sentences.slice(0, half).join(' '), sentences.slice(half).join(' ')];
  }
  // A collapsed source list, opened only by readers who want it.
  function sourcesBlock(list, label, scope) {
    if (!list || !list.length) return '';
    return '<details class="src"><summary>' + esc(label || 'Sources') + ' <span class="n">' + list.length + '</span></summary>' +
      '<ol class="sources">' + list.map(function (s, i) {
        return '<li' + (scope ? ' id="src-' + scope + '-' + (i + 1) + '"' : '') + '><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || hostOf(s.url)) + '</a>' +
          (s.date ? ' <span class="dt">(' + esc(s.date) + ')</span>' : '') + '</li>';
      }).join('') + '</ol></details>';
  }
  // A superscript citation that jumps to numbered sources in a scope.
  function citeHTML(nums, scope) {
    if (!nums || !nums.length) return '';
    nums = nums.slice().sort(function (a, b) { return a - b; });
    return '<sup class="cite">' + nums.map(function (n) {
      return '<a href="#src-' + scope + '-' + n + '" data-cite="' + scope + '-' + n + '">' + n + '</a>';
    }).join(',') + '</sup>';
  }
  // Number the citation markers inside a section and append its source list.
  function wireCitations(host, scope, listHost) {
    var SRC = window.NEOCLOUD_SRC || {};
    var marks = Array.prototype.slice.call(host.querySelectorAll('sup.cite[data-s]'));
    var order = [];
    marks.forEach(function (m) {
      m.getAttribute('data-s').split(/\s+/).forEach(function (k) { if (k && SRC[k] && order.indexOf(k) === -1) order.push(k); });
    });
    marks.forEach(function (m) {
      var nums = m.getAttribute('data-s').split(/\s+/).filter(function (k) { return SRC[k]; })
        .map(function (k) { return order.indexOf(k) + 1; });
      m.outerHTML = citeHTML(nums, scope);
    });
    if (order.length) {
      (listHost || host).insertAdjacentHTML('beforeend', sourcesBlock(order.map(function (k) { return SRC[k]; }), 'Sources for this section', scope));
    }
  }
  // Clicking a citation opens the collapsed list and highlights the source.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-cite]');
    if (!a) return;
    e.preventDefault();
    var li = document.getElementById('src-' + a.getAttribute('data-cite'));
    if (!li) return;
    var det = li.closest('details');
    if (det) det.open = true;
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    li.classList.remove('flash');
    void li.offsetWidth;
    li.classList.add('flash');
  });
  // Company logos live in logos/<id>.png, listed in logos.js.
  var LOGO_SET = {};
  (window.NEOCLOUD_LOGOS || []).forEach(function (n) { LOGO_SET[n] = 1; });
  function logoFile(id) { return String(id).replace(/^b:/, 'b-'); }
  function hasLogo(id) { return !!LOGO_SET[logoFile(id)]; }
  function logoSrc(id) { return 'logos/' + logoFile(id) + '.png'; }
  function initials(name) {
    return String(name).replace(/\(.*?\)/g, '').split(/[\s.-]+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function logoHTML(id, name, size) {
    var st = 'width:' + size + 'px;height:' + size + 'px';
    if (hasLogo(id)) return '<img class="logo" src="' + logoSrc(id) + '" alt="" loading="lazy" style="' + st + '">';
    return '<span class="logo mono" aria-hidden="true" style="' + st + ';font-size:' + Math.round(size * 0.38) + 'px">' + esc(initials(name)) + '</span>';
  }

  function placeTip(tip, box, anchorRect) {
    var vr = box.getBoundingClientRect();
    tip.classList.add('show');
    var left = anchorRect.left - vr.left + anchorRect.width / 2 - tip.offsetWidth / 2;
    left = Math.max(8, Math.min(left, vr.width - tip.offsetWidth - 8));
    var top = anchorRect.top - vr.top - tip.offsetHeight - 10;
    if (top < 4) top = anchorRect.bottom - vr.top + 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  PROVIDERS.forEach(function (p, i) {
    p._i = i;
    p._hay = [p.name, p.aka, p.hq, p.snippet, p.ownership, (p.customers || []).join(' '), (p.accelerators || []).join(' '), (CAT[p.category] || {}).single]
      .join(' ').toLowerCase();
  });
  var BY_SLUG = {};
  PROVIDERS.forEach(function (p) { BY_SLUG[p.slug] = p; });

  document.querySelectorAll('[data-count]').forEach(function (el) {
    el.textContent = PROVIDERS.length || '';
  });

  // =====================================================================
  // Supply network
  // =====================================================================
  var Net = (function () {
    // Each tier owns a vertical band of the map. Neoclouds get the widest band because they are the most numerous.
    var TIER_W = [0.2, 0.36, 0.2, 0.24];
    var TIER_L = [0, 0.2, 0.56, 0.76];
    var TIER_X = TIER_L.map(function (l, i) { return l + TIER_W[i] / 2; });
    var TIER_LABEL = ['Power and data centers', 'Clouds and platforms', 'Hyperscalers and labs', 'Buyers'];
    var GROUPS = [
      { id: 'power', label: 'Power and data centers', color: 'var(--series-2)' },
      { id: 'cloud', label: 'Clouds and platforms', color: 'var(--series-1)' },
      { id: 'buyer', label: 'Buyers', color: '#333' }
    ];
    var SHORT = { oracle: 'Oracle', aws: 'AWS', 'microsoft-azure': 'Microsoft', 'google-cloud': 'Google',
      'deutsche-telekom-industrial-ai-cloud': 'Deutsche Telekom', 'b:ministry-of-science-and-ict': 'Korea MSIT',
      'b:thinking-machines-lab': 'Thinking Machines', 'b:european-commission': 'European Commission' };
    var nodes = [], links = [], byId = {}, isolated = 0;
    var inited = false, sim, svg, gRoot, bandSel, nodeSel, linkSel, zoom, W, H, selected = null, topPad = 16;

    function tierOf(p) {
      if (p.category === 'developer') return 0;
      if (p.category === 'hyperscaler' || p.category === 'lab') return 2;
      return 1;
    }
    function groupOf(n) { return n.kind === 'buyer' ? 'buyer' : (n.tier === 0 ? 'power' : 'cloud'); }
    function colorOf(n) { return GROUPS.filter(function (g) { return g.id === groupOf(n); })[0].color; }

    var built = false;
    function build() {
      if (built) return;
      built = true;
      var nameToSlug = {};
      PROVIDERS.forEach(function (p) { nameToSlug[p.name.toLowerCase()] = p.slug; });
      var raw = [];
      PROVIDERS.forEach(function (p) {
        (p.customers || []).forEach(function (c) {
          if ((NETCFG.skip || []).indexOf(c) > -1) return;
          var id = NETCFG.aliases[c] || nameToSlug[c.toLowerCase()] ||
            ('b:' + c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
          if (id !== p.slug) raw.push([p.slug, id, c]);
        });
      });
      var seen = {}, buyerCount = {}, buyerLabel = {};
      raw.forEach(function (r) {
        if (r[1].indexOf('b:') !== 0) return;
        if (!buyerLabel[r[1]]) buyerLabel[r[1]] = (NETCFG.labels || {})[r[1]] || r[2];
        var k = r[0] + '>' + r[1];
        if (!seen[k]) { seen[k] = 1; buyerCount[r[1]] = (buyerCount[r[1]] || 0) + 1; }
      });
      var keep = function (id) { return id.indexOf('b:') !== 0 || (buyerCount[id] || 0) >= (NETCFG.minBuyerLinks || 2); };
      var linkSet = {};
      links = [];
      raw.forEach(function (r) {
        if (!keep(r[1])) return;
        var k = r[0] + '>' + r[1];
        if (linkSet[k]) return;
        linkSet[k] = 1;
        links.push({ source: r[0], target: r[1] });
      });
      var deg = {};
      links.forEach(function (l) { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });
      nodes = Object.keys(deg).map(function (id) {
        var p = BY_SLUG[id];
        if (p) return { id: id, label: SHORT[id] || p.name, kind: 'provider', tier: tierOf(p), deg: deg[id] };
        return { id: id, label: SHORT[id] || buyerLabel[id], kind: 'buyer', tier: 3, deg: deg[id] };
      });
      byId = {};
      nodes.forEach(function (n) {
        n.logo = hasLogo(n.id);
        n.r = n.logo ? 7 + 2.6 * Math.sqrt(n.deg) : (n.kind === 'buyer' ? 5 + 2.6 * Math.sqrt(n.deg) : 4.5 + 2.1 * Math.sqrt(n.deg));
        n.out = []; n.inn = [];
        byId[n.id] = n;
      });
      links.forEach(function (l) { byId[l.source].out.push(l.target); byId[l.target].inn.push(l.source); });
      isolated = PROVIDERS.filter(function (p) { return !byId[p.slug]; }).length;
    }

    function neighbors(id) {
      var s = {}, n = byId[id];
      s[id] = 1;
      n.out.forEach(function (x) { s[x] = 1; });
      n.inn.forEach(function (x) { s[x] = 1; });
      return s;
    }
    function highlight(id) {
      if (!id) {
        nodeSel.classed('dim', false).classed('show', false);
        linkSel.classed('dim', false).classed('hl', false);
        return;
      }
      var s = neighbors(id);
      nodeSel.classed('dim', function (d) { return !s[d.id]; }).classed('show', function (d) { return !!s[d.id]; });
      linkSel.classed('hl', function (l) { return l.source.id === id || l.target.id === id; })
        .classed('dim', function (l) { return !(l.source.id === id || l.target.id === id); });
    }

    function chip(id) {
      var n = byId[id];
      return '<button type="button" class="chip-btn" data-node="' + esc(id) + '">' + logoHTML(id, n.label, 16) + esc(n.label) + '</button>';
    }
    function sortIds(ids) {
      return ids.slice().sort(function (a, b) { return byId[b].deg - byId[a].deg || byId[a].label.localeCompare(byId[b].label); });
    }
    function rankRows(list, count) {
      return list.map(function (n) {
        return '<button type="button" class="rank-row" data-node="' + esc(n.id) + '"><span>' + logoHTML(n.id, n.label, 20) + esc(n.label) + '</span><span class="c">' + count(n) + '</span></button>';
      }).join('');
    }

    function siteLink(label, url) {
      if (!url) return esc(label);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(hostOf(url)) + '">' + esc(label) +
        '<span class="ext" aria-hidden="true">&#8599;</span></a>';
    }

    function renderPanel() {
      var el = $('net-panel');
      if (!selected) {
        var buyers = nodes.slice().sort(function (a, b) { return b.inn.length - a.inn.length; }).slice(0, 6);
        var sellers = nodes.filter(function (n) { return n.kind === 'provider'; })
          .sort(function (a, b) { return b.out.length - a.out.length; }).slice(0, 6);
        el.innerHTML = '<p class="kicker">How to read the map</p>' +
          '<h3>Follow the compute</h3>' +
          '<p class="desc">Power developers lease halls to clouds, clouds rent GPUs to labs, and a few buyers sit at the end of most chains. Pick a company to light up its links.</p>' +
          '<div class="group"><p class="group-label">Named as a customer most often</p>' + rankRows(buyers, function (n) { return n.inn.length; }) + '</div>' +
          '<div class="group"><p class="group-label">Suppliers with the most named customers</p>' + rankRows(sellers, function (n) { return n.out.length; }) + '</div>' +
          '<p class="small">' + isolated + ' providers in the guide name no customers that connect to this map, so they appear only in the <a href="#providers">Providers tab</a>.</p>';
        return;
      }
      var n = byId[selected], p = BY_SLUG[selected];
      var head;
      if (p) {
        var c = CAT[p.category] || { single: p.category };
        head = '<p class="kicker">' + esc(c.single) + '</p><div class="panel-title">' + logoHTML(p.slug, p.name, 40) + '<h3>' + siteLink(p.name, p.website) + '</h3></div>' +
          '<p class="meta">' + esc([p.hq, p.founded ? 'Founded ' + p.founded : ''].filter(Boolean).join(' · ')) + '</p>' +
          '<p class="desc">' + esc(p.snippet) + '</p>';
      } else {
        head = '<p class="kicker">Buyer</p><div class="panel-title">' + logoHTML(n.id, n.label, 40) + '<h3>' + siteLink(n.label, (NETCFG.sites || {})[n.id]) + '</h3></div>' +
          '<p class="desc">Named as a customer by ' + n.inn.length + ' provider' + (n.inn.length === 1 ? '' : 's') + ' in this guide.</p>';
      }
      el.innerHTML = head +
        (n.out.length ? '<div class="group"><p class="group-label">Supplies (' + n.out.length + ')</p>' + sortIds(n.out).map(chip).join('') + '</div>' : '') +
        (n.inn.length ? '<div class="group"><p class="group-label">Buys from (' + n.inn.length + ')</p>' + sortIds(n.inn).map(chip).join('') + '</div>' : '') +
        (p ? '<a class="go" href="#/' + esc(p.slug) + '">Read the full profile and its sources&nbsp;&rarr;</a>' : '') +
        '<p class="small">Links come from the customer lists in each company\u2019s profile, which cite their sources.</p>' +
        '<div class="group"><button type="button" class="btn small" data-clear>Clear selection</button></div>';
    }

    function select(id, center) {
      selected = id && byId[id] ? id : null;
      nodeSel.classed('sel', function (d) { return d.id === selected; });
      highlight(selected);
      renderPanel();
      if (selected && center) {
        var n = byId[selected];
        var t = d3.zoomTransform(svg.node());
        var k = Math.max(t.k, 1.3);
        // Programmatic transforms skip the translate extent, so clamp here to keep the map edges in view.
        var to = zoom.constrain()(d3.zoomIdentity.translate(W / 2 - n.x * k, H / 2 - n.y * k).scale(k), [[0, 0], [W, H]], zoom.translateExtent());
        svg.transition().duration(450).call(zoom.transform, to);
      }
    }

    function ticked() {
      nodes.forEach(function (d) {
        // Keep each node inside its tier's band so the column headers stay accurate.
        var lo = W * TIER_L[d.tier] + d.r + 6, hi = W * (TIER_L[d.tier] + TIER_W[d.tier]) - d.r - 6;
        d.x = Math.max(lo, Math.min(hi, d.x));
        d.y = Math.max(d.r + topPad, Math.min(H - d.r - topPad, d.y));
      });
      linkSel.attr('d', function (l) {
        var s = l.source, t = l.target, dx = t.x - s.x, dy = t.y - s.y;
        var dr = Math.sqrt(dx * dx + dy * dy) * 1.8;
        return 'M' + s.x + ',' + s.y + 'A' + dr + ',' + dr + ' 0 0,1 ' + t.x + ',' + t.y;
      });
      nodeSel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    }

    function init() {
      if (inited) return;
      inited = true;
      var stage = $('net-stage');
      if (!window.d3) {
        stage.innerHTML = '<p class="net-fallback">The network needs the d3 library, which did not load. The Providers tab lists every company.</p>';
        return;
      }
      build();
      var svgEl = $('net-svg');
      W = svgEl.clientWidth || stage.clientWidth;
      H = svgEl.clientHeight || 700;
      // Controls occupy their own row above the map.
      topPad = 16;
      svg = d3.select(svgEl).attr('viewBox', [0, 0, W, H]);
      gRoot = svg.append('g');
      bandSel = gRoot.append('g').selectAll('rect').data(TIER_W).join('rect')
        .attr('class', function (d, i) { return 'net-band' + (i % 2 ? ' alt' : ''); });
      linkSel = gRoot.append('g').attr('class', 'net-links').selectAll('path').data(links).join('path');
      nodeSel = gRoot.append('g').selectAll('g').data(nodes).join('g')
        .attr('class', function (d) { return 'net-node' + (d.deg < 5 ? ' minor' : ''); })
        .attr('tabindex', 0).attr('role', 'button')
        .attr('aria-label', function (d) { return d.label + ', ' + d.out.length + ' customers, ' + d.inn.length + ' suppliers'; });
      svg.append('defs').html('<clipPath id="net-clip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath>');
      nodeSel.append('circle').attr('r', function (d) { return d.r; })
        .attr('fill', function (d) { return d.logo ? '#fff' : colorOf(d); })
        .attr('stroke', function (d) { return d.logo ? colorOf(d) : '#fff'; })
        .attr('stroke-width', function (d) { return d.logo ? 2.5 : 1.5; });
      nodeSel.filter(function (d) { return d.logo; }).append('image')
        .attr('href', function (d) { return logoSrc(d.id); })
        .attr('x', function (d) { return -d.r * 0.74; }).attr('y', function (d) { return -d.r * 0.74; })
        .attr('width', function (d) { return d.r * 1.48; }).attr('height', function (d) { return d.r * 1.48; })
        .attr('clip-path', 'url(#net-clip)');
      nodeSel.append('text')
        .attr('x', function (d) { return d.tier === 0 || d.tier === 3 ? -(d.r + 5) : d.r + 5; })
        .attr('y', 4)
        .attr('text-anchor', function (d) { return d.tier === 0 || d.tier === 3 ? 'end' : 'start'; })
        .text(function (d) { return d.label; });

      // Seed positions by tier so the layout reads left to right.
      nodes.forEach(function (d, i) {
        d.x = W * TIER_X[d.tier] + (Math.random() - 0.5) * 40;
        d.y = 60 + ((i * 47) % (H - 120));
      });
      sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(70).strength(0.12))
        .force('charge', d3.forceManyBody().strength(function (d) { return -70 - d.deg * 9; }).distanceMax(320))
        .force('x', d3.forceX(function (d) { return W * TIER_X[d.tier]; }).strength(0.55))
        .force('y', d3.forceY(H / 2).strength(0.05))
        .force('collide', d3.forceCollide(function (d) { return d.r + (d.deg >= 3 || d.kind === 'buyer' ? 12 : 5); }).iterations(3))
        .stop();
      for (var i = 0; i < 360; i++) sim.tick();
      ticked();
      sim.on('tick', ticked);

      nodeSel.call(d3.drag()
        .on('start', function (e, d) { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
        .on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

      zoom = d3.zoom().scaleExtent([1, 4]).translateExtent([[0, 0], [W, H]]).on('zoom', function (e) {
        gRoot.attr('transform', e.transform);
        placeCols(e.transform);
      });
      svg.call(zoom).on('dblclick.zoom', null);
      svg.on('click', function (e) { if (!e.target.closest('.net-node')) select(null); });

      var tip = $('net-tip');
      nodeSel
        .on('click', function (e, d) { e.stopPropagation(); select(d.id === selected ? null : d.id); })
        .on('keydown', function (e, d) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.id); } })
        .on('mouseenter focus', function (e, d) {
          if (!selected) highlight(d.id);
          var bits = [];
          if (d.out.length) bits.push('supplies ' + d.out.length);
          if (d.inn.length) bits.push('buys from ' + d.inn.length);
          tip.innerHTML = '<strong>' + esc(d.label) + '</strong><br>' + esc(bits.join(' · '));
          placeTip(tip, stage, this.getBoundingClientRect());
        })
        .on('mouseleave blur', function () {
          if (!selected) highlight(null);
          tip.classList.remove('show');
        });

      $('net-legend').innerHTML = GROUPS.map(function (g) {
        return '<span><i style="background:' + g.color + '"></i>' + esc(g.label) + '</span>';
      }).join('');
      var cols = $('net-cols');
      // Whole-number shares with a zero minimum, so a long word can never shrink the row short of the map's width.
      cols.style.gridTemplateColumns = TIER_W.map(function (w) { return 'minmax(0, ' + Math.round(w * 100) + 'fr)'; }).join(' ');
      cols.innerHTML = TIER_LABEL.map(function (t, i) {
        return '<span' + (i % 2 ? ' class="alt"' : '') + '>' + esc(t) + '</span>';
      }).join('');
      sizeBands();
      $('net-names').innerHTML = nodes.slice().sort(function (a, b) { return a.label.localeCompare(b.label); })
        .map(function (n) { return '<option value="' + esc(n.label) + '">'; }).join('');
      $('net-foot').innerHTML = '<span><strong>' + nodes.length + '</strong> companies</span>' +
        '<span><strong>' + links.length + '</strong> named customer links</span>' +
        '<span class="hint">Select a company to trace its links. Drag to rearrange. Scroll to zoom.</span>';

      var search = $('net-search');
      function find() {
        var q = search.value.trim().toLowerCase();
        if (!q) return;
        // Match the short map label or the provider's full name, so Microsoft Azure finds Microsoft.
        function names(n) { return [n.label, BY_SLUG[n.id] ? BY_SLUG[n.id].name : ''].map(function (s) { return s.toLowerCase(); }); }
        function first(test) { return nodes.filter(function (n) { return names(n).some(test); })[0]; }
        var hit = first(function (s) { return s === q; }) ||
          first(function (s) { return s.indexOf(q) === 0; }) ||
          first(function (s) { return s && s.indexOf(q) > -1; });
        if (hit) select(hit.id, true);
      }
      search.addEventListener('change', find);
      search.addEventListener('keydown', function (e) { if (e.key === 'Enter') find(); });
      $('net-reset').addEventListener('click', function () {
        search.value = '';
        select(null);
        svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
        sim.alpha(0.4).restart();
      });
      $('net-panel').addEventListener('click', function (e) {
        var b = e.target.closest('[data-node]');
        if (b) { select(b.getAttribute('data-node'), true); return; }
        if (e.target.closest('[data-clear]')) select(null);
      });
      renderPanel();

      window.addEventListener('resize', function () {
        if ($('view-network').hidden) return;
        // The map is shorter below 900px, so a resize can change the height as well as the width.
        var w = svgEl.clientWidth, h = svgEl.clientHeight;
        if (!w || (Math.abs(w - W) < 30 && h === H)) return;
        W = w;
        H = h || H;
        svg.attr('viewBox', [0, 0, W, H]);
        zoom.translateExtent([[0, 0], [W, H]]);
        sizeBands();
        sim.force('x', d3.forceX(function (d) { return W * TIER_X[d.tier]; }).strength(0.55))
          .force('y', d3.forceY(H / 2).strength(0.05)).alpha(0.4).restart();
      });
    }

    // Profiles ask whether a company is on the map before offering a link to it.
    function has(id) {
      build();
      return !!byId[id];
    }

    function show(id) {
      init();
      if (!svg || !byId[id]) return;
      $('net-search').value = byId[id].label;
      select(id, true);
    }

    function sizeBands() {
      bandSel.attr('x', function (d, i) { return W * TIER_L[i]; }).attr('y', 0)
        .attr('width', function (d) { return W * d; }).attr('height', H);
      placeCols(d3.zoomTransform(svg.node()));
    }

    // The headers sit outside the SVG so their text never scales, but they follow the map's horizontal pan and zoom.
    function placeCols(t) {
      var cols = $('net-cols');
      cols.style.width = (W * t.k) + 'px';
      cols.style.transform = 'translateX(' + t.x + 'px)';
    }
    return { init: init, has: has, show: show };
  })();

  // =====================================================================
  // Timeline
  // =====================================================================
  var Timeline = (function () {
    var LANES = [
      { id: 'deal', label: 'Deals' },
      { id: 'capital', label: 'Capital' },
      { id: 'tech', label: 'Technology' },
      { id: 'market', label: 'Market and origins' }
    ];
    var MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    // Years before 2025 are compressed so the dense recent period gets room.
    var BREAKS = [[2017, 0], [2023, 0.2], [2025, 0.42], [2026.95, 1]];
    var events = TIMELINE.map(function (e) {
      var m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(e.date);
      var t = m ? +m[2] + (MONTHS[m[1]] + 0.5) / 12 : parseInt(e.date, 10) + 0.5;
      return { e: e, t: t };
    }).sort(function (a, b) { return a.t - b.t; });
    events.forEach(function (ev, i) { ev.i = i; });
    var sel = events.length - 1, laneOn = {}, rendered = false;
    LANES.forEach(function (l) { laneOn[l.id] = true; });

    function u(t) {
      for (var k = 0; k < BREAKS.length - 1; k++) {
        var a = BREAKS[k], b = BREAKS[k + 1];
        if (t <= b[0]) return a[1] + (Math.max(t, a[0]) - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
      }
      return 1;
    }
    function visible() { return events.filter(function (ev) { return laneOn[ev.e.type]; }); }
    function laneLabel(id) { return LANES.filter(function (l) { return l.id === id; })[0].label; }

    function render() {
      var chart = $('tl-chart'), svg = $('tl-svg');
      var W = Math.max(chart.clientWidth, 820);
      var labelW = 150, x0 = labelW, x1 = W - 28, top = 40, laneH = 100;
      var H = top + laneH * LANES.length + 8;
      function X(t) { return x0 + u(t) * (x1 - x0); }
      var out = [];
      out.push('<defs><pattern id="tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#ececec" stroke-width="1.5"/></pattern></defs>');
      LANES.forEach(function (l, i) {
        out.push('<rect class="lane-bg' + (i % 2 ? ' alt' : '') + '" x="0" y="' + (top + i * laneH) + '" width="' + W + '" height="' + laneH + '"/>');
      });
      out.push('<rect class="compressed" x="' + X(2017) + '" y="' + top + '" width="' + (X(2025) - X(2017)) + '" height="' + (laneH * LANES.length) + '" opacity="0.6"/>');
      var lastLabel = -1e9;
      for (var y = 2017; y <= 2026; y++) {
        var xx = X(y), showLabel = xx - lastLabel >= 40;
        if (showLabel) lastLabel = xx;
        out.push('<g class="year"><line x1="' + xx + '" x2="' + xx + '" y1="' + (top - 6) + '" y2="' + (H - 8) + '"/>' +
          (showLabel ? '<text x="' + (xx + 4) + '" y="' + (top - 12) + '">' + y + '</text>' : '') + '</g>');
      }
      [2025.5, 2026.5].forEach(function (t) {
        out.push('<g class="year"><line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + top + '" y2="' + (H - 8) + '" stroke-dasharray="2 3"/><text x="' + (X(t) + 4) + '" y="' + (top - 12) + '" style="font-size:11px">Jul</text></g>');
      });
      LANES.forEach(function (l, i) {
        var n = events.filter(function (ev) { return ev.e.type === l.id; }).length;
        out.push('<text class="lane-label" x="16" y="' + (top + i * laneH + laneH / 2 - 2) + '">' + esc(l.label) + '</text>');
        out.push('<text class="lane-count" x="16" y="' + (top + i * laneH + laneH / 2 + 14) + '">' + n + ' events</text>');
      });
      // Place dots, dodging vertically when two events in a lane sit close
      // together. The top of each lane is a label row for landmark events.
      var OFFS = [0, -14, 14, -28, 28];
      var placed = {}, labelBoxes = {}, dots = [], labels = [];
      events.forEach(function (ev) {
        var li = LANES.map(function (l) { return l.id; }).indexOf(ev.e.type);
        var laneTop = top + li * laneH;
        var cx = X(ev.t), cy0 = laneTop + 60;
        var list = placed[ev.e.type] || (placed[ev.e.type] = []);
        var off = OFFS[OFFS.length - 1];
        for (var k = 0; k < OFFS.length; k++) {
          var clash = list.some(function (p) { return p.o === OFFS[k] && Math.abs(p.x - cx) < 14; });
          if (!clash) { off = OFFS[k]; break; }
        }
        list.push({ x: cx, o: off });
        ev.cx = cx; ev.cy = cy0 + off;
        dots.push('<g class="ev" data-i="' + ev.i + '"><circle cx="' + cx + '" cy="' + ev.cy + '" r="6"/></g>');
        if (ev.e.key) {
          var w = ev.e.key.length * 6.2 + 6;
          var anchorEnd = cx + w > x1;
          var bx0 = anchorEnd ? cx - w + 4 : cx - 4, bx1 = bx0 + w;
          var boxes = labelBoxes[ev.e.type] || (labelBoxes[ev.e.type] = []);
          var hit = boxes.some(function (b) { return bx0 < b[1] + 8 && bx1 > b[0] - 8; });
          if (!hit) {
            boxes.push([bx0, bx1]);
            labels.push('<line class="ev-lead" x1="' + cx + '" x2="' + cx + '" y1="' + (laneTop + 20) + '" y2="' + (ev.cy - 7) + '"/>' +
              '<text class="ev-key" x="' + (anchorEnd ? cx + 4 : cx - 4) + '" y="' + (laneTop + 16) + '" text-anchor="' + (anchorEnd ? 'end' : 'start') + '">' + esc(ev.e.key) + '</text>');
          }
        }
      });
      out.push(labels.join(''));
      out.push(dots.join(''));
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.innerHTML = out.join('');
      applyState();
    }

    function applyState() {
      var svg = $('tl-svg');
      Array.prototype.forEach.call(svg.querySelectorAll('.ev'), function (g) {
        var ev = events[+g.getAttribute('data-i')];
        var on = laneOn[ev.e.type];
        g.classList.toggle('dim', !on);
        g.classList.toggle('sel', ev.i === sel);
        g.firstChild.setAttribute('r', ev.i === sel ? 9 : 6);
      });
      var selG = svg.querySelector('.ev.sel');
      if (selG) selG.parentNode.appendChild(selG);
      renderDetail();
    }

    function renderDetail() {
      var ev = events[sel], e = ev.e, vis = visible();
      var pos = vis.indexOf(ev);
      var links = [];
      if (e.slug && BY_SLUG[e.slug]) links.push('<a href="#/' + esc(e.slug) + '">' + esc(BY_SLUG[e.slug].name) + ' profile</a>');
      if (e.url) links.push('<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Source</a>');
      $('tl-detail').innerHTML = (e.slug && BY_SLUG[e.slug] ? '<a class="tl-logo" href="#/' + esc(e.slug) + '">' + logoHTML(e.slug, BY_SLUG[e.slug].name, 44) + '</a>' : '') +
        '<p class="when">' + esc(e.date) + '<span class="lane-tag">' + esc(laneLabel(e.type)) + '</span></p>' +
        '<p class="text">' + esc(e.event) + '</p>' +
        '<p class="links">' + links.join('') + '</p>' +
        '<div class="tl-nav"><button type="button" class="btn small" data-step="-1">&larr; Earlier</button>' +
        '<button type="button" class="btn small" data-step="1">Later &rarr;</button>' +
        '<span class="pos">' + (pos > -1 ? (pos + 1) + ' of ' + vis.length : '') + '</span></div>';
    }

    function step(d) {
      var vis = visible();
      if (!vis.length) return;
      var pos = vis.indexOf(events[sel]);
      if (pos === -1) pos = d > 0 ? -1 : vis.length;
      pos = Math.max(0, Math.min(vis.length - 1, pos + d));
      sel = vis[pos].i;
      applyState();
    }

    function renderFilters() {
      $('tl-filters').innerHTML = LANES.map(function (l) {
        var n = events.filter(function (ev) { return ev.e.type === l.id; }).length;
        return '<button type="button" class="pill" data-lane="' + l.id + '" aria-pressed="' + laneOn[l.id] + '">' + esc(l.label) + '<span class="c">' + n + '</span></button>';
      }).join('');
    }

    function renderList() {
      var tl = $('tl-list');
      tl.innerHTML = TIMELINE.map(function (t) {
        var links = [];
        if (t.slug && BY_SLUG[t.slug]) links.push('<a href="#/' + esc(t.slug) + '">' + esc(BY_SLUG[t.slug].name) + '</a>');
        if (t.url) links.push('<a href="' + esc(t.url) + '" target="_blank" rel="noopener">Source</a>');
        return '<li><span class="d">' + esc(t.date) + '</span><span class="e">' + esc(t.event) +
          (links.length ? ' <span class="tl-links">' + links.join(' · ') + '</span>' : '') + '</span></li>';
      }).join('');
    }

    function init() {
      if (rendered) { render(); return; }
      rendered = true;
      renderFilters();
      renderList();
      render();
      var svg = $('tl-svg'), tip = $('tl-tip'), chart = $('tl-chart');
      svg.addEventListener('click', function (e) {
        var g = e.target.closest('.ev');
        if (!g) return;
        sel = +g.getAttribute('data-i');
        applyState();
      });
      svg.addEventListener('mouseover', function (e) {
        var g = e.target.closest('.ev');
        if (!g) return;
        var ev = events[+g.getAttribute('data-i')];
        tip.innerHTML = '<strong>' + esc(ev.e.date) + '</strong><br>' + esc(ev.e.event.length > 110 ? ev.e.event.slice(0, 107) + '...' : ev.e.event);
        placeTip(tip, chart, g.getBoundingClientRect());
      });
      svg.addEventListener('mouseout', function (e) { if (e.target.closest('.ev')) tip.classList.remove('show'); });
      svg.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      });
      $('tl-detail').addEventListener('click', function (e) {
        var b = e.target.closest('[data-step]');
        if (b) step(+b.getAttribute('data-step'));
      });
      $('tl-filters').addEventListener('click', function (e) {
        var b = e.target.closest('[data-lane]');
        if (!b) return;
        var id = b.getAttribute('data-lane');
        var allOn = LANES.every(function (l) { return laneOn[l.id]; });
        // The first click isolates one lane, and later clicks toggle lanes.
        if (allOn) LANES.forEach(function (l) { laneOn[l.id] = l.id === id; });
        else laneOn[id] = !laneOn[id];
        if (!LANES.some(function (l) { return laneOn[l.id]; })) LANES.forEach(function (l) { laneOn[l.id] = true; });
        if (!laneOn[events[sel].e.type]) { var vis = visible(); sel = vis[vis.length - 1].i; }
        renderFilters();
        applyState();
      });
      window.addEventListener('resize', function () { if (!$('view-timeline').hidden) render(); });
    }
    return { init: init };
  })();

  // =====================================================================
  // Directory
  // =====================================================================
  var saved = store('state') || {};
  var state = {
    q: saved.q || '',
    cat: saved.cat || '',
    region: saved.region || '',
    accel: saved.accel || '',
    sort: saved.sort || 'featured',
    // The Cards layout was retired, so a saved 'cards' choice falls back to the logo wall.
    layout: ['logos', 'table', 'map'].indexOf(saved.layout) > -1 ? saved.layout : 'logos'
  };

  var qEl = $('q'), regionEl = $('region'), accelEl = $('accel'), sortEl = $('sort');
  REGIONS.forEach(function (r) {
    if (!PROVIDERS.some(function (p) { return p.region === r; })) return;
    var o = document.createElement('option');
    o.value = r; o.textContent = r;
    regionEl.appendChild(o);
  });
  qEl.value = state.q; regionEl.value = state.region; accelEl.value = state.accel; sortEl.value = state.sort;

  function matches(p, ignoreCat) {
    if (!ignoreCat && state.cat && p.category !== state.cat) return false;
    if (state.region && p.region !== state.region) return false;
    if (state.accel && !families(p)[state.accel]) return false;
    if (state.q) {
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) if (p._hay.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }

  function sorted(list) {
    var l = list.slice();
    if (state.sort === 'az') l.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (state.sort === 'new' || state.sort === 'old') {
      var dir = state.sort === 'new' ? -1 : 1;
      l.sort(function (a, b) {
        var fa = foundedNum(a), fb = foundedNum(b);
        if (fa === null && fb === null) return a._i - b._i;
        if (fa === null) return 1;
        if (fb === null) return -1;
        return (fa - fb) * dir || a._i - b._i;
      });
    } else l.sort(function (a, b) { return a._i - b._i; });
    return l;
  }

  function renderPills() {
    var base = PROVIDERS.filter(function (p) { return matches(p, true); });
    var html = '<button type="button" class="pill" data-cat="" aria-pressed="' + (state.cat === '') + '">All<span class="c">' + base.length + '</span></button>';
    CATEGORIES.forEach(function (c) {
      if (!PROVIDERS.some(function (p) { return p.category === c.id; })) return;
      var n = base.filter(function (p) { return p.category === c.id; }).length;
      html += '<button type="button" class="pill" data-cat="' + c.id + '" aria-pressed="' + (state.cat === c.id) + '">' +
        esc(c.plural) + '<span class="c">' + n + '</span></button>';
    });
    $('cats').innerHTML = html;
    $('cat-blurb').textContent = state.cat ? CAT[state.cat].blurb : '';
  }

  // One provider as a card, in the style of the Projects page repository cards.
  function cardHTML(p) {
    var c = CAT[p.category] || { single: p.category };
    var meta = [c.single, p.hq].filter(Boolean).join(' · ');
    var facts = (p.facts || []).slice(0, 2).map(function (f) {
      return '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(f.value) + '</dd></div>';
    }).join('');
    return '<a class="card" href="#/' + esc(p.slug) + '">' +
      '<div class="card-head">' + logoHTML(p.slug, p.name, 40) +
        '<div><span class="card-name">' + esc(p.name) + '</span>' +
        (meta ? '<div class="card-meta">' + esc(meta) + '</div>' : '') + '</div></div>' +
      '<p class="card-desc">' + esc(p.snippet) + '</p>' +
      (facts ? '<dl class="card-facts">' + facts + '</dl>' : '') +
      '</a>';
  }

  // Every provider as a logo tile, grouped by business type.
  function logoWallHTML(list) {
    return CATEGORIES.map(function (c) {
      var group = list.filter(function (p) { return p.category === c.id; });
      if (!group.length) return '';
      return '<section class="wall-group"><header class="wall-head"><h3>' + esc(c.plural) + '</h3><span class="n">' + group.length + '</span>' +
        '<p>' + esc(c.blurb) + '</p></header><div class="wall">' +
        group.map(function (p) {
          return '<a class="tile" href="#/' + esc(p.slug) + '" title="' + esc(p.snippet) + '">' + logoHTML(p.slug, p.name, 52) +
            '<span class="tile-name">' + esc(p.name) + '</span><span class="tile-meta">' + esc(p.hq.split(',').slice(-1)[0].trim()) + '</span></a>';
        }).join('') + '</div></section>';
    }).join('');
  }

  var layoutButtons = Array.prototype.slice.call(document.querySelectorAll('[data-layout]'));

  function renderDirectory() {
    store('state', state);
    renderPills();
    var list = sorted(PROVIDERS.filter(function (p) { return matches(p); }));
    var filtered = list.length < PROVIDERS.length;
    $('result-count').textContent = filtered ? list.length + ' of ' + PROVIDERS.length + ' providers' : PROVIDERS.length + ' providers';
    $('clear-filters').hidden = !(state.q || state.cat || state.region || state.accel);
    var active = (state.region ? 1 : 0) + (state.accel ? 1 : 0);
    $('filter-count').textContent = active ? String(active) : '';
    layoutButtons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-layout') === state.layout); });
    var dir = $('dir'), stage = $('map-stage');
    var onMap = state.layout === 'map';
    stage.hidden = !onMap;
    dir.hidden = onMap && !!list.length;
    if (!list.length) {
      dir.hidden = false;
      stage.hidden = true;
      dir.innerHTML = '<p class="empty">No providers match these filters.</p>';
      return;
    }
    if (onMap) {
      HQMap.show(list);
      return;
    }
    if (state.layout === 'table') {
      dir.innerHTML = '<div class="table-wrap"><table class="dir-table"><thead><tr><th>Provider</th><th>Type</th><th>Headquarters</th><th>Founded</th><th>Ownership</th><th>Accelerators</th></tr></thead><tbody>' +
        list.map(function (p) {
          return '<tr><td><a class="t-name" href="#/' + esc(p.slug) + '">' + logoHTML(p.slug, p.name, 22) + esc(p.name) + '</a></td><td>' + esc((CAT[p.category] || {}).single || '') +
            '</td><td>' + esc(p.hq) + '</td><td class="num">' + esc(p.founded) + '</td><td>' + esc(p.ownership) + '</td><td>' + esc(familyLabel(p)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      return;
    }
    dir.innerHTML = logoWallHTML(list);
  }

  $('clear-filters').addEventListener('click', function () {
    state.q = state.cat = state.region = state.accel = '';
    qEl.value = regionEl.value = accelEl.value = '';
    renderDirectory();
    qEl.focus();
  });

  // The Filters menu closes on an outside click or Escape, like a native menu.
  var filtersEl = $('filters');
  document.addEventListener('click', function (e) {
    if (filtersEl.open && !filtersEl.contains(e.target)) filtersEl.open = false;
  });
  filtersEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && filtersEl.open) { filtersEl.open = false; filtersEl.querySelector('summary').focus(); }
  });

  qEl.addEventListener('input', function () { state.q = qEl.value.trim(); renderDirectory(); });
  regionEl.addEventListener('change', function () { state.region = regionEl.value; renderDirectory(); });
  accelEl.addEventListener('change', function () { state.accel = accelEl.value; renderDirectory(); });
  sortEl.addEventListener('change', function () { state.sort = sortEl.value; renderDirectory(); });
  layoutButtons.forEach(function (b) {
    b.addEventListener('click', function () { state.layout = b.getAttribute('data-layout'); renderDirectory(); });
  });
  $('cats').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cat]');
    if (!b) return;
    state.cat = b.getAttribute('data-cat');
    renderDirectory();
  });

  // =====================================================================
  // Headquarters map
  // =====================================================================
  var HQMap = (function () {
    // Approximate city coordinates, [longitude, latitude], keyed by the
    // first part of each profile's headquarters field.
    var CITY = {
      'Abu Dhabi': [54.38, 24.45], 'Amsterdam': [4.9, 52.37], 'Arlington': [-77.1, 38.88], 'Armonk': [-73.71, 41.13],
      'Atlanta': [-84.39, 33.75], 'Austin': [-97.74, 30.27], 'Australia': [151.21, -33.87], 'Bonn': [7.1, 50.74],
      'Bournemouth': [-1.88, 50.72], 'Broomfield': [-105.09, 39.92], 'Calgary': [-114.07, 51.05], 'Cambridge': [-71.11, 42.37],
      'Chicago': [-87.63, 41.88], 'Contern': [6.23, 49.59], 'Dallas': [-96.8, 32.78], 'Darvoz': [70.88, 38.46],
      'Easton': [-76.08, 38.77], 'Endicott': [-76.05, 42.1], 'Frankfurt': [8.68, 50.11], 'Gunzenhausen': [10.75, 49.11],
      'Hangzhou': [120.16, 30.27], 'Hanoi': [105.85, 21.03], 'Helsinki': [24.94, 60.17], 'Jakarta': [106.85, -6.21],
      'Las Vegas': [-115.14, 36.17], 'Leiden': [4.49, 52.16], 'Livingston': [-74.31, 40.79], 'London': [-0.13, 51.51],
      'Los Angeles': [-118.24, 34.05], 'Marseille': [5.37, 43.3], 'Miami': [-80.19, 25.76], 'Mountain View': [-122.08, 37.39],
      'Mumbai': [72.88, 19.08], 'Munich': [11.58, 48.14], 'New Delhi': [77.21, 28.61], 'New York': [-74.01, 40.71],
      'Northbrook': [-87.83, 42.13], 'Osaka': [135.5, 34.69], 'Palo Alto': [-122.14, 37.44], 'Paris': [2.35, 48.86],
      'Pleasanton': [-121.87, 37.66], 'Rancho Cordova': [-121.3, 38.59], 'Redmond': [-122.12, 47.67], 'Riyadh': [46.68, 24.71],
      'Roubaix': [3.17, 50.69], 'San Diego': [-117.16, 32.72], 'San Francisco': [-122.42, 37.77], 'San Mateo': [-122.32, 37.56],
      'Seattle': [-122.33, 47.61], 'Seongnam': [127.13, 37.42], 'Seoul': [126.98, 37.57], 'Singapore': [103.82, 1.35],
      'Slovakia': [17.11, 48.15], 'Starbase': [-97.16, 25.99], 'Stockholm': [18.07, 59.33], 'Sydney': [151.21, -33.87],
      'São Paulo': [-46.63, -23.55], 'Tokyo': [139.69, 35.68], 'Toronto': [-79.38, 43.65], 'West Palm Beach': [-80.05, 26.72]
    };
    var inited = false, svg, gRoot, W, H, projection, world = null, loading = null, zoom, current = [];

    function where(p) { return CITY[(p.hq || '').split(',')[0].trim()]; }
    function groupColor(p) {
      return p.category === 'developer' ? 'var(--series-2)' : 'var(--series-1)';
    }

    function loadWorld() {
      if (world) return Promise.resolve(world);
      if (!loading) {
        loading = fetch('data/countries-110m.json').then(function (r) { return r.json(); }).then(function (t) {
          world = window.topojson ? window.topojson.feature(t, t.objects.countries) : null;
          return world;
        });
      }
      return loading;
    }

    function draw() {
      var stage = $('map-stage'), svgEl = $('map-svg');
      W = svgEl.clientWidth || stage.clientWidth;
      H = svgEl.clientHeight || 620;
      svg = d3.select(svgEl).attr('viewBox', [0, 0, W, H]);
      svg.selectAll('*').remove();
      projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'Sphere' });
      var path = d3.geoPath(projection);
      gRoot = svg.append('g');
      gRoot.append('path').attr('class', 'map-sphere').attr('d', path({ type: 'Sphere' }));
      if (world) gRoot.append('g').selectAll('path').data(world.features).join('path').attr('class', 'map-land').attr('d', path);

      // Spread logos that share a city with a small collision layout.
      var pts = current.filter(where).map(function (p) {
        var xy = projection(where(p));
        return { p: p, ax: xy[0], ay: xy[1], x: xy[0], y: xy[1] };
      });
      var sim = d3.forceSimulation(pts)
        .force('x', d3.forceX(function (d) { return d.ax; }).strength(0.6))
        .force('y', d3.forceY(function (d) { return d.ay; }).strength(0.6))
        .force('collide', d3.forceCollide(13).iterations(3)).stop();
      for (var i = 0; i < 160; i++) sim.tick();

      var tip = $('map-tip');
      var g = gRoot.append('g').selectAll('a').data(pts).join('a')
        .attr('class', 'map-mark').attr('href', function (d) { return '#/' + d.p.slug; })
        .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; })
        .attr('aria-label', function (d) { return d.p.name + ', ' + d.p.hq; });
      g.append('line').attr('class', 'map-tether').attr('x1', 0).attr('y1', 0)
        .attr('x2', function (d) { return d.ax - d.x; }).attr('y2', function (d) { return d.ay - d.y; });
      g.append('circle').attr('r', 12).attr('fill', '#fff').attr('stroke', function (d) { return groupColor(d.p); }).attr('stroke-width', 2);
      g.each(function (d) {
        var sel = d3.select(this);
        if (hasLogo(d.p.slug)) {
          sel.append('image').attr('href', logoSrc(d.p.slug)).attr('x', -9).attr('y', -9).attr('width', 18).attr('height', 18)
            .attr('clip-path', 'url(#round-clip)');
        } else {
          sel.append('text').attr('class', 'map-mono').attr('text-anchor', 'middle').attr('y', 4).text(initials(d.p.name));
        }
      });
      svg.append('defs').html('<clipPath id="round-clip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath>');
      g.on('mouseenter focus', function (e, d) {
        tip.innerHTML = '<strong>' + esc(d.p.name) + '</strong><br>' + esc(d.p.hq);
        placeTip(tip, stage, this.getBoundingClientRect());
      }).on('mouseleave blur', function () { tip.classList.remove('show'); });

      zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]]).on('zoom', function (e) {
        gRoot.attr('transform', e.transform);
        // Markers grow more slowly than the map, so clusters open up as you zoom.
        var s = 1 / Math.sqrt(e.transform.k);
        gRoot.selectAll('.map-mark').attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ') scale(' + s + ')'; });
      });
      svg.call(zoom);

      var counts = {};
      current.forEach(function (p) { counts[p.region] = (counts[p.region] || 0) + 1; });
      $('map-foot').innerHTML = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
        .map(function (r) { return '<span><strong>' + counts[r] + '</strong> ' + esc(r) + '</span>'; }).join('') +
        '<span class="hint">Scroll to zoom into dense clusters. Click a logo to open its profile.</span>';
    }

    function show(list) {
      current = list;
      if (!window.d3) { $('map-foot').textContent = 'The map needs the d3 library, which did not load.'; return; }
      loadWorld().then(draw, draw);
      if (!inited) {
        inited = true;
        window.addEventListener('resize', function () {
          if (!$('map-stage').hidden && Math.abs(($('map-svg').clientWidth || 0) - W) > 30) draw();
        });
      }
    }
    return { show: show };
  })();

  // =====================================================================
  // Provider profile
  // =====================================================================
  function profileHTML(p) {
    var c = CAT[p.category] || { single: p.category, plural: p.category };
    var scope = 'p';
    var cites = (window.NEOCLOUD_CITES || {})[p.slug] || {};
    function pc(list) { return (list || []).map(function (i) { return i + 1; }); }
    var kv = [
      ['Headquarters', esc(p.hq)],
      ['Founded', esc(p.founded || 'Not public')],
      ['Ownership', esc(p.ownership)],
      ['Website', p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(hostOf(p.website)) + '</a>' : 'Not listed']
    ].concat((p.facts || []).map(function (f, i) { return [esc(f.label), esc(f.value) + citeHTML(pc(cites.facts && cites.facts[i]), scope)]; }))
      .map(function (m) { return '<div><dt>' + m[0] + '</dt><dd>' + m[1] + '</dd></div>'; }).join('');

    var sections = [['Origin', p.origin, 'origin'], ['In 2026', p.today, 'today'], ['Platform', p.platform, 'platform'], ['Outlook', p.outlook, 'outlook']]
      .filter(function (s) { return s[1]; }).map(function (s) {
        return '<h3 class="sub">' + s[0] + '</h3><div class="prose">' +
          citedParagraphs(s[1], (cites.fields || {})[s[2]], scope) + '</div>';
      }).join('');

    function tagList(label, items) {
      if (!items || !items.length) return '';
      return '<p class="side-label">' + label + '</p><ul class="tags">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }

    var related = PROVIDERS.filter(function (q) { return q.category === p.category && q.slug !== p.slug; }).slice(0, 3);
    var prev = PROVIDERS[(p._i - 1 + PROVIDERS.length) % PROVIDERS.length];
    var next = PROVIDERS[(p._i + 1) % PROVIDERS.length];

    return '<article class="profile">' +
      '<p class="crumbs"><a href="#providers">&larr; All providers</a>' +
        (Net.has(p.slug) ? ' &nbsp;&middot;&nbsp; <a href="#network" data-net="' + esc(p.slug) + '">Show on the network</a>' : '') + '</p>' +
      '<header class="profile-head"><div class="profile-title">' + logoHTML(p.slug, p.name, 64) + '<h2>' + esc(p.name) + '</h2></div>' +
        '<p class="profile-meta">' + esc([c.single, p.region].filter(Boolean).join(' · ')) +
        (p.aka ? ' &middot; Also known as ' + esc(p.aka) : '') + '</p>' +
        '<p class="lede">' + esc(p.snippet) + citeHTML(pc(((cites.fields || {}).snippet || []).reduce(function (a, b) { return a.concat(b); }, []).filter(function (v, i, arr) { return arr.indexOf(v) === i; })), scope) + '</p></header>' +
      '<div class="profile-grid"><div class="profile-main">' +
        (p.confidence === 'low' ? '<div class="notice">Little public information exists about this company, so read this profile as a starting point. Corrections with sources are welcome.</div>' : '') +
        sections + sourcesBlock(p.sources, 'Sources for this profile', scope) +
      '</div><aside class="profile-side"><dl class="kv">' + kv + '</dl>' +
        tagList('Accelerators', p.accelerators) + tagList('Products', p.products) + tagList('Named customers and tenants', p.customers) +
      '</aside></div>' +
      (related.length ? '<section class="profile-section"><header class="sec-head"><h2>Other ' + esc(c.plural.toLowerCase()) + '</h2></header>' +
        '<div class="card-grid">' + related.map(cardHTML).join('') + '</div></section>' : '') +
      '<nav class="pager"><a href="#/' + esc(prev.slug) + '"><small>Previous</small>' + esc(prev.name) + '</a>' +
      '<a href="#/' + esc(next.slug) + '" style="text-align:right"><small>Next</small>' + esc(next.name) + '</a></nav>' +
      '</article>';
  }

  // =====================================================================
  // Price chart
  // =====================================================================
  // On-demand H100 SXM prices from each provider's own rate card, read October 14, 2026.
  // research/rate-cards-2026-10.json records the quoted text and the arithmetic for each one.
  var PRICE_GROUPS = [
    { id: 'neo', label: 'Neoclouds and AI platforms', color: 'var(--series-2)' },
    { id: 'other', label: 'Other clouds', color: 'var(--series-1)' },
    { id: 'hyper', label: 'Hyperscalers', color: 'var(--series-3)' }
  ];
  var PRICE_POINTS = [
    { label: 'Hyperstack', value: 3.20, group: 'neo', src: 'Rate card', note: 'billed per minute', url: 'https://www.hyperstack.cloud/gpu-pricing' },
    { label: 'Crusoe', value: 3.90, group: 'neo', src: 'Rate card', url: 'https://www.crusoe.ai/cloud/pricing' },
    { label: 'Lambda', value: 3.99, group: 'neo', src: 'Rate card', note: '8x H100 SXM instance', url: 'https://lambda.ai/pricing' },
    { label: 'Runpod', value: 3.99, group: 'neo', src: 'Rate card', note: 'Secure Cloud, one GPU', url: 'https://www.runpod.io/pricing' },
    { label: 'Together AI', value: 3.99, group: 'neo', src: 'Rate card', note: 'GPU clusters', url: 'https://www.together.ai/pricing' },
    { label: 'Verda', value: 4.09, group: 'neo', src: 'Rate card', note: 'single H100 SXM5 instance', url: 'https://verda.com/pricing' },
    { label: 'DigitalOcean', value: 4.41, group: 'other', src: 'Rate card', note: 'HGX H100 GPU Droplet', url: 'https://www.digitalocean.com/pricing/gpu-droplets' },
    { label: 'Nebius', value: 4.50, group: 'neo', src: 'Rate card', url: 'https://nebius.com/prices' },
    { label: 'CoreWeave', value: 6.16, group: 'neo', src: 'Rate card', note: '$49.24 per 8-GPU node', url: 'https://www.coreweave.com/pricing' },
    { label: 'AWS p5', value: 6.88, group: 'hyper', src: 'Rate card', note: '$55.04 per 8-GPU instance, US East', url: 'https://aws.amazon.com/ec2/pricing/on-demand/' },
    { label: 'Oracle', value: 10.00, group: 'hyper', src: 'Rate card', note: 'BM.GPU.H100.8', url: 'https://www.oracle.com/cloud/compute/pricing/' },
    { label: 'Google Cloud', value: 11.06, group: 'hyper', src: 'Rate card', note: 'a3-highgpu-8g, $88.49 per 8-GPU instance, us-central1', url: 'https://cloud.google.com/products/compute/pricing/accelerator-optimized' },
    { label: 'Microsoft Azure', value: 12.29, group: 'hyper', src: 'Rate card', note: 'ND H100 v5, $98.32 per 8-GPU VM, East US', url: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/' }
  ];
  var PRICE_MAX = 14;

  function renderPriceChart() {
    var rows = $('pv-rows');
    if (!rows) return;
    var groupOf = {};
    PRICE_GROUPS.forEach(function (g) { groupOf[g.id] = g; });
    $('pv-legend').innerHTML = PRICE_GROUPS.map(function (g) {
      return '<span><i style="background:' + g.color + '"></i>' + esc(g.label) + '</span>';
    }).join('');
    var ticks = [0, 2, 4, 6, 8, 10, 12, 14];
    var grid = ticks.map(function (t) {
      return '<span class="g' + (t === 0 ? ' zero' : '') + '" style="left:' + (t / PRICE_MAX * 100) + '%"></span>';
    }).join('');
    rows.innerHTML = PRICE_POINTS.map(function (d, i) {
      var x = d.value / PRICE_MAX * 100;
      var right = x > 80;
      var label = '$' + d.value.toFixed(2);
      return '<div class="pp-row" role="listitem">' +
        '<div class="pp-label">' + esc(d.label) + '</div>' +
        '<div class="pp-track">' + grid +
          '<span class="pp-dot" tabindex="0" data-i="' + i + '" style="left:' + x + '%;background:' + groupOf[d.group].color + '" aria-label="' + esc(d.label + ', ' + label + ' per GPU-hour') + '"></span>' +
          '<span class="pp-val" style="' + (right ? 'right:' + (100 - x) + '%;margin-right:14px' : 'left:' + x + '%;margin-left:14px') + '">' + label + '</span>' +
        '</div></div>';
    }).join('');
    $('pv-ticks').innerHTML = ticks.map(function (t) {
      return '<span style="left:' + (t / PRICE_MAX * 100) + '%">$' + t + '</span>';
    }).join('');
    $('pv-table').innerHTML = '<thead><tr><th>Price point</th><th>Type</th><th>$/GPU-hour</th><th>Notes</th><th>Source</th></tr></thead><tbody>' +
      PRICE_POINTS.map(function (d) {
        return '<tr><td>' + esc(d.label) + '</td><td>' + esc(groupOf[d.group].label) + '</td><td class="num">$' + d.value.toFixed(2) + '</td><td>' +
          esc([d.note, d.when ? 'read ' + d.when : ''].filter(Boolean).join(', ')) + '</td><td><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.src) + '</a></td></tr>';
      }).join('') + '</tbody>';

    var tip = $('pv-tip'), viz = $('price-viz');
    function show(dot) {
      var d = PRICE_POINTS[+dot.getAttribute('data-i')];
      tip.innerHTML = '<strong>$' + d.value.toFixed(2) + '</strong> per GPU-hour<br>' + esc(d.label) +
        (d.note ? '<br>' + esc(d.note) : '') + '<br>' + esc(groupOf[d.group].label) + ' · ' + esc(d.src);
      placeTip(tip, viz, dot.getBoundingClientRect());
    }
    function hide() { tip.classList.remove('show'); }
    rows.addEventListener('mouseover', function (e) { var d = e.target.closest('.pp-dot'); if (d) show(d); });
    rows.addEventListener('mouseout', function (e) { if (e.target.closest('.pp-dot')) hide(); });
    rows.addEventListener('focusin', function (e) { var d = e.target.closest('.pp-dot'); if (d) show(d); });
    rows.addEventListener('focusout', hide);
  }

  // =====================================================================
  // Section sources
  // =====================================================================
  function renderStatic() {
    wireCitations($('view-prices'), 'prices', $('pricing-sources'));
  }

  // =====================================================================
  // Views and routing
  // =====================================================================
  // The long-form Guide tab was retired in October 2026. Its old anchors fall through to the
  // network, and #method scrolls to the About the data note at the foot of the page.
  var VIEW_FOR = { '': 'network', network: 'network', providers: 'directory', timeline: 'timeline', prices: 'prices', pricing: 'prices' };
  var current = null, dirScroll = 0, defaultTitle = document.title, pendingNet = null;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#tabs a'));

  function parse(hash) {
    var m = /^#\/([a-z0-9-]+)/.exec(hash);
    if (m && BY_SLUG[m[1]]) return { view: 'provider', slug: m[1] };
    var id = hash.replace(/^#/, '');
    if (VIEW_FOR.hasOwnProperty(id)) return { view: VIEW_FOR[id] };
    if (id === 'method') return { view: current || 'network', anchor: 'method' };
    return { view: 'network' };
  }

  function route() {
    var r = parse(decodeURIComponent(location.hash || ''));
    var prev = current;
    if (prev === 'directory' && r.view === 'provider') dirScroll = window.scrollY;
    current = r.view;
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + r.view; });
    $('hero').hidden = r.view !== 'network';
    tabs.forEach(function (a) {
      var on = a.getAttribute('data-view') === r.view || (r.view === 'provider' && a.getAttribute('data-view') === 'directory');
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = defaultTitle;

    if (r.view === 'provider') {
      var p = BY_SLUG[r.slug];
      $('view-provider').innerHTML = profileHTML(p);
      document.title = p.name + ' · The Neocloud Guide';
      window.scrollTo(0, $('topbar').offsetTop);
      return;
    }
    if (r.view === 'network') {
      Net.init();
      if (pendingNet) { var s = pendingNet; pendingNet = null; setTimeout(function () { Net.show(s); }, 0); }
    }
    if (r.view === 'timeline') Timeline.init();

    var tabsTop = $('topbar').offsetTop;
    if (r.anchor) {
      var el = document.getElementById(r.anchor);
      if (el) el.scrollIntoView();
    } else if (r.view === 'directory' && prev === 'provider' && dirScroll) {
      window.scrollTo(0, dirScroll);
    } else if (prev !== null && window.scrollY > tabsTop) {
      window.scrollTo(0, tabsTop);
    }
  }
  window.addEventListener('hashchange', route);

  document.querySelector('.skip-link').addEventListener('click', function (e) {
    e.preventDefault();
    var main = $('main');
    main.focus({ preventScroll: true });
    main.scrollIntoView();
  });

  // "Show on the network" links from a profile select that company on the map.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-net]');
    if (a) pendingNet = a.getAttribute('data-net');
  });

  renderDirectory();
  renderPriceChart();
  renderStatic();
  route();
})();
