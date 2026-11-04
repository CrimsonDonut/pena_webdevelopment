const BASES = ['https://arena.fastapicloud.dev/api', 'https://arena-hv.fastapicloud.dev/api'];
const PAGE_SIZE = 10;
const METRICS = { win: 'Win rate', pick: 'Pick rate', ban: 'Ban rate' };
const TREND_KEYS = { win: 'win_rate', pick: 'app_rate', ban: 'ban_rate' };

const $ = (id) => document.getElementById(id);
const state = { rank: 'all', lane: 'all', metric: 'win', dir: 'desc', page: 1 };
const rankCache = new Map();   // rank -> heroes[]
const laneCache = new Map();   // lane -> Set(hero ids)
const trendCache = new Map();  // "id|rank|days" -> points[]
let heroes = [];               // after rank + position filter, sorted
let filtered = [];             // after search
let loadToken = 0;

const api = async (path) => {
    let lastError;
    for (const base of BASES) {
        try {
            const res = await fetch(base + path);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            if (json.code !== undefined && json.code !== 0) throw new Error(json.message || 'API error');
            return json;
        } catch (err) { lastError = err; }
    }
    throw lastError;
};

const num = (v) => (v == null ? null : v <= 1 ? v * 100 : v);
const pct = (v) => (v == null ? '–' : num(v).toFixed(1) + '%');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const rankName = () => $('rank').selectedOptions[0].textContent;

// Data loading 
const fetchAll = async (path, limit = 5) => {
    let out = [], total = Infinity;
    for (let index = 1; out.length < total && index <= limit; index++) {
        const json = await api(`${path}&size=200&index=${index}`);
        const records = json?.data?.records || [];
        total = json?.data?.total ?? records.length;
        out = out.concat(records);
        if (!records.length) break;
    }
    return out;
};

const loadRank = async (rank) => {
    const records = await fetchAll(`/heroes/rank?days=7&rank=${rank}&sort_field=win_rate`);
    return records.map((r) => {
        const d = r.data || {};
        const hero = d.main_hero?.data || {};
        return {
            id: Number(d.main_heroid ?? hero.heroid),
            name: hero.name || String(d.main_heroid),
            head: hero.head || hero.squarehead || '',
            win: d.main_hero_win_rate,
            pick: d.main_hero_appearance_rate ?? d.main_hero_pick_rate,
            ban: d.main_hero_ban_rate
        };
    });
};

const loadLane = async (lane) => {
    const records = await fetchAll(`/academy/heroes?lane=${lane}`);
    return new Set(records.map((r) => Number(r.data?.hero_id ?? r.data?.hero?.data?.heroid ?? r.data?.heroid)).filter(Boolean));
};

const recompute = () => {
    let base = rankCache.get(state.rank) || [];
    if (state.lane !== 'all') {
        const ids = laneCache.get(state.lane);
        base = base.filter((h) => ids.has(h.id));
    }
    const m = state.metric, sign = state.dir === 'desc' ? -1 : 1;
    heroes = [...base].sort((a, b) => {
        if (a[m] == null) return 1;
        if (b[m] == null) return -1;
        return sign * (a[m] - b[m]);
    });
    const q = normalize($('search').value);
    filtered = q ? heroes.filter((h) => normalize(h.name).includes(q)) : heroes;
};

const refresh = async ({ resetPage = true } = {}) => {
    const token = ++loadToken;
    const controls = ['rank', 'metric', 'dir'].map($).concat([...document.querySelectorAll('#lane button')]);
    controls.forEach((c) => (c.disabled = true));
    $('loading').hidden = false;
    $('status').textContent = '';
    try {
        if (!rankCache.has(state.rank)) rankCache.set(state.rank, await loadRank(state.rank));
        if (state.lane !== 'all' && !laneCache.has(state.lane)) laneCache.set(state.lane, await loadLane(state.lane));
        if (token !== loadToken) return;
        $('rank-label').textContent = state.rank === 'all' ? 'all ranks' : rankName() + ' rank';
        recompute();
        if (resetPage) state.page = 1;
        renderList();
    } catch (err) {
        $('status').textContent = 'Could not load heroes: ' + err.message;
    } finally {
        if (token === loadToken) {
            controls.forEach((c) => (c.disabled = false));
            $('loading').hidden = true;
        }
    }
};

// List: theme settings live here, change them freely
const UI = {
    BAN_ALERT: 20,   // ban rate (%) at or above this gets the crimson row + tag
    BAN_TAG: 'High ban',
    WIN_HOT: 53,     // win rate (%) at or above this is crimson
    WIN_COOL: 49,    // win rate (%) at or above this is cyan; below it is dimmed
    BAR_SPLIT: 50    // win rate (%) under this gets the pink bar, at or over it the purple bar
};

const span = (text, cls = '') => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
};

// Which color class a stat gets: hot (crimson), cool (cyan) or dim (grey)
const toneOf = (h, m) => {
    const v = num(h[m]) ?? 0;
    if (m === 'win') return v >= UI.WIN_HOT ? 'hot' : v >= UI.WIN_COOL ? 'cool' : 'dim';
    if (m === 'pick') return 'cool';
    return v >= UI.BAN_ALERT ? 'hot' : 'dim';
};

// Flat bar colors (defined in theme.css): low = pink, high = purple, mid = in between
const barClass = (h, m) => {
    if (m === 'win') return (num(h.win) ?? 0) >= UI.BAR_SPLIT ? 'fill-high' : 'fill-low';
    return 'fill-mid';   // pick and ban rates
};

const renderList = () => {
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    const list = $('list');
    list.replaceChildren();

    if (!slice.length) {
        const p = document.createElement('p');
        p.className = 'p-4 text-center text-body-secondary mb-0';
        p.textContent = 'No heroes match these filters.';
        list.append(p);
    }

    const m = state.metric;
    const max = Math.max(...heroes.map((h) => num(h[m]) ?? 0), 1);
    const others = Object.keys(METRICS).filter((k) => k !== m);

    slice.forEach((h) => {
        const rank = heroes.indexOf(h) + 1;
        const highBan = (num(h.ban) ?? 0) >= UI.BAN_ALERT;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hero-row' + (highBan ? ' is-ban' : rank === 1 && state.dir === 'desc' ? ' is-top' : '');
        btn.innerHTML = `
            <span class="rank-badge" data-f="rank"></span>
            <span class="avatar"><img data-f="img" alt="" loading="lazy"></span>
            <span class="who"><span class="name" data-f="name"></span><span class="tag" data-f="tag" hidden></span></span>
            <span class="meter" aria-hidden="true"><span class="meter-fill" data-f="bar"></span></span>
            <span class="figures"><span class="main mono" data-f="main"></span><span class="extra mono" data-f="extra"></span></span>
            <span class="material-symbols-outlined chev" aria-hidden="true">chevron_right</span>`;
        const f = (name) => btn.querySelector(`[data-f="${name}"]`);

        f('rank').textContent = rank;
        if (h.head) f('img').src = h.head; else f('img').style.visibility = 'hidden';
        f('name').textContent = h.name;
        if (highBan) { f('tag').hidden = false; f('tag').textContent = UI.BAN_TAG; }

        const width = m === 'win' ? Math.min(num(h.win) ?? 0, 100) : ((num(h[m]) ?? 0) / max) * 100;
        const bar = f('bar');
        bar.style.width = width + '%';
        bar.classList.add(barClass(h, m));

        f('main').textContent = pct(h[m]);
        f('main').classList.add('tone-' + toneOf(h, m));

        const extra = f('extra');
        others.forEach((k, i) => {
            if (i) extra.append(' · ');
            extra.append(span(`${METRICS[k].split(' ')[0]} ${pct(h[k])}`, k === 'ban' && highBan ? 'tone-hot' : ''));
        });

        btn.setAttribute('aria-label', `${h.name}, ${METRICS[m]} ${pct(h[m])}. Show performance trends`);
        btn.addEventListener('click', () => openHero(h));
        list.append(btn);
    });

    $('status').textContent = filtered.length
        ? `Showing ${start + 1}–${start + slice.length} of ${filtered.length} heroes · sorted by ${METRICS[m].toLowerCase()}`
        : '';
    renderPager(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
};

const renderPager = (pages) => {
    const pager = $('pager');
    pager.replaceChildren();
    if (pages <= 1) return;
    const add = (label, target, { active = false, disabled = false, aria } = {}) => {
        const li = document.createElement('li');
        li.className = `page-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`;
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'page-link';
        a.textContent = label;
        if (aria) a.setAttribute('aria-label', aria);
        if (active) a.setAttribute('aria-current', 'page');
        if (!disabled && !active) a.addEventListener('click', () => { state.page = target; renderList(); window.scrollTo({ top: 0 }); });
        li.append(a);
        pager.append(li);
    };
    const p = state.page;
    add('‹', p - 1, { disabled: p === 1, aria: 'Previous page' });
    const nums = new Set([1, pages, p - 1, p, p + 1].filter((n) => n >= 1 && n <= pages));
    let prev = 0;
    [...nums].sort((a, b) => a - b).forEach((n) => {
        if (n - prev > 1) add('…', n, { disabled: true });
        add(String(n), n, { active: n === p });
        prev = n;
    });
    add('›', p + 1, { disabled: p === pages, aria: 'Next page' });
};

// Trends modal
const modal = new bootstrap.Modal($('hero-modal'));
const trend = { hero: null, days: 7, metric: 'win' };

const loadTrend = async (hero, days) => {
    const key = `${hero.id}|${state.rank}|${days}`;
    if (trendCache.has(key)) return trendCache.get(key);
    const json = await api(`/academy/heroes/${hero.id}/trends?days=${days}&rank=${state.rank}`);
    const records = json?.data?.records || [];
    // Several records can exist (match types); use the one with the most daily points
    const series = records.map((r) => r.data?.win_rate || []).sort((a, b) => b.length - a.length)[0] || [];
    const points = [...series].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    trendCache.set(key, points);
    return points;
};

const chartSvg = (points, metric) => {
    const key = TREND_KEYS[metric];
    const vals = points.map((p) => num(p[key]));
    const W = 480, H = 200, L = 40, R = 12, T = 12, B = 28;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (metric === 'win') { lo = Math.min(lo, 50); hi = Math.max(hi, 50); }
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (i) => L + (i * (W - L - R)) / Math.max(points.length - 1, 1);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="currentColor"><title>${esc(points[i].date)}: ${v.toFixed(2)}%</title></circle>`).join('');
    const ref = metric === 'win'
        ? `<line x1="${L}" x2="${W - R}" y1="${y(50)}" y2="${y(50)}" stroke="currentColor" stroke-dasharray="4 3"/>
           <text x="${L - 6}" y="${y(50) + 4}" text-anchor="end">50%</text>`
        : '';

    return `<svg class="w-100 h-auto text-info" viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRICS[metric]} over time">
        <g class="text-body-tertiary" stroke="currentColor">
            <line x1="${L}" x2="${W - R}" y1="${y(hi - pad)}" y2="${y(hi - pad)}"/>
            <line x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}"/>
        </g>
        <g class="text-body-secondary" fill="currentColor" font-size="11">
            <text x="${L - 6}" y="${y(hi - pad) + 4}" text-anchor="end">${(hi - pad).toFixed(1)}%</text>
            <text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${lo.toFixed(1)}%</text>
            ${ref}
            <text x="${L}" y="${H - 8}">${esc(points[0].date)}</text>
            <text x="${W - R}" y="${H - 8}" text-anchor="end">${esc(points[points.length - 1].date)}</text>
        </g>
        <path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
    </svg>`;
};

const renderTrend = async () => {
    const { hero, days, metric } = trend;
    document.querySelectorAll('#trend-metrics button').forEach((b) => b.classList.toggle('active', b.dataset.metric === metric));
    document.querySelectorAll('#trend-days button').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === days));
    const body = $('trend-body');
    body.innerHTML = '<p class="text-body-secondary mb-0">Loading trends...</p>';
    try {
        const points = await loadTrend(hero, days);
        if (trend.hero !== hero || trend.days !== days) return; // user moved on
        if (points.length < 2) { body.innerHTML = '<p class="text-body-secondary mb-0">Not enough data for this period.</p>'; return; }
        const vals = points.map((p) => num(p[TREND_KEYS[metric]]));
        const change = vals[vals.length - 1] - vals[0];
        const tile = (label, value) => `<div class="col-6 col-sm-3"><div class="stat-tile"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>`;
        body.innerHTML = chartSvg(points, metric) + `<div class="row g-2 mt-2">
                ${tile('Latest', vals[vals.length - 1].toFixed(1) + '%')}
                ${tile('Change', (change >= 0 ? '+' : '') + change.toFixed(1) + ' pts')}
                ${tile('High', Math.max(...vals).toFixed(1) + '%')}
                ${tile('Low', Math.min(...vals).toFixed(1) + '%')}
            </div>`;
    } catch (err) {
        body.innerHTML = `<p class="text-danger mb-0">Could not load trends. ${esc(err.message)}</p>`;
    }
};

const openHero = (h) => {
    trend.hero = h;
    trend.metric = state.metric;
    $('hero-title').textContent = h.name;
    $('hero-img').src = h.head;
    $('hero-sub').textContent = `${state.rank === 'all' ? 'All ranks' : rankName() + ' rank'} · now ${pct(h.win)} win, ${pct(h.pick)} pick, ${pct(h.ban)} ban`;
    modal.show();
    renderTrend();
};

$('trend-metrics').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    trend.metric = b.dataset.metric; renderTrend();
});
$('trend-days').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    trend.days = Number(b.dataset.days); renderTrend();
});

// Controls 
$('search').addEventListener('input', () => { recompute(); state.page = 1; renderList(); });
$('rank').addEventListener('change', (e) => { state.rank = e.target.value; refresh(); });
$('lane').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.lane === state.lane) return;
    state.lane = b.dataset.lane;
    document.querySelectorAll('#lane button').forEach((x) => x.classList.toggle('active', x === b));
    refresh();
});
$('metric').addEventListener('change', (e) => { state.metric = e.target.value; recompute(); state.page = 1; renderList(); });
$('dir').addEventListener('click', (e) => {
    state.dir = state.dir === 'desc' ? 'asc' : 'desc';
    e.currentTarget.textContent = state.dir === 'desc' ? 'High → Low' : 'Low → High';
    e.currentTarget.setAttribute('aria-label', `Sort direction: ${state.dir === 'desc' ? 'high to low' : 'low to high'}`);
    recompute(); state.page = 1; renderList();
});

refresh();