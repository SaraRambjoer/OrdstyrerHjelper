let deltakere = [];
let aktivDeltakerId = null;
let timerInterval = null;
let nåværendeTaleType = null; // 'innlegg' | 'kommentar'

let innleggListe = [];
let innleggTeller = 1;
let aktivInnleggId = null;

let innstillinger = {
    algoritme: 'kø',
    feministisk: false,
    feministiskFaktor: 1.2,
    moeteLengdeMin: 60,
    maksInnleggMin: 5,
    maksKommentarMin: 2,
};

// Nedtelling / lyd
let gjeldendeTaleSekunder = 0;
let varselSpilt = false;
let tidUteSpilt = false;
let lydVarmet = false;

const LYD_VARSEL_STI = 'lyder/varsel.mp3';
const LYD_TID_UTE_STI = 'lyder/tid-ute.mp3';

const lydVarsel = new Audio(LYD_VARSEL_STI);
const lydTidUte = new Audio(LYD_TID_UTE_STI);

const grid = document.getElementById('deltaker-grid');
const tomMelding = document.getElementById('tom-melding');
const forslagListe = document.getElementById('forslag-liste');
const bbAlgoritme = document.getElementById('bb-algoritme');

// ---------- LOAD / SAVE ----------

function normaliserDeltaker(d) {
    return {
        ...d,
        antallGangerTalt: d.antallGangerTalt ?? 0,
        taleTid: d.taleTid ?? 0,
        innleggTaleTid: d.innleggTaleTid ?? 0,
        innleggAntall: d.innleggAntall ?? 0,
        kommentarTaleTid: d.kommentarTaleTid ?? 0,
        kommentarAntall: d.kommentarAntall ?? 0,
        sistTalt: d.sistTalt ?? 0,
    };
}

function normaliserKommentarIder(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(k =>
        typeof k === 'string' ? { id: k, opprettet: Date.now() } : k
    );
}

function lastData() {
    const lagretDeltakere = localStorage.getItem('deltakere');
    if (lagretDeltakere) {
        try {
            deltakere = JSON.parse(lagretDeltakere).map(normaliserDeltaker);
        } catch (e) {
            console.error('Kunne ikke parse deltakere', e);
            deltakere = [];
        }
    }

    const lagretInnst = localStorage.getItem('moeteInnstillinger');
    if (lagretInnst) {
        try { innstillinger = { ...innstillinger, ...JSON.parse(lagretInnst) }; } catch (e) {}
    }

    const lagretInnlegg = localStorage.getItem('innleggListe');
    if (lagretInnlegg) {
        try {
            const data = JSON.parse(lagretInnlegg);
            innleggListe = (data.innleggListe || []).map(i => ({
                ...i,
                kommentarIder: normaliserKommentarIder(i.kommentarIder),
            }));
            aktivInnleggId = data.aktivInnleggId || null;
            innleggTeller = data.innleggTeller || 1;
        } catch (e) {}
    }
}

function lagreInnlegg() {
    localStorage.setItem('innleggListe', JSON.stringify({
        innleggListe, aktivInnleggId, innleggTeller,
    }));
}

// ---------- HELPERS ----------

function formaterTid(sekunder) {
    const neg = sekunder < 0;
    const abs = Math.abs(sekunder);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return neg ? '-' + str : str;
}

function finnInnleggForTaler(deltakerId) {
    return innleggListe.find(i => i.talerId === deltakerId && i.status !== 'ferdig');
}

function finnKommentarInnlegg(deltakerId) {
    return innleggListe.find(i =>
        i.status !== 'ferdig' && i.kommentarIder.some(k => k.id === deltakerId)
    );
}

function hentMaksTaleSekunder(type) {
    if (type === 'innlegg')   return (innstillinger.maksInnleggMin || 5) * 60;
    if (type === 'kommentar') return (innstillinger.maksKommentarMin || 2) * 60;
    return null;
}

function hentGjenstaaendeSekunder() {
    const maks = hentMaksTaleSekunder(nåværendeTaleType);
    if (maks === null) return null;
    return maks - gjeldendeTaleSekunder;
}

function spillLyd(lyd) {
    try {
        lyd.currentTime = 0;
        const p = lyd.play();
        if (p && p.catch) p.catch(() => {});
    } catch (_) {}
}

function varmOppLyd() {
    if (lydVarmet) return;
    lydVarmet = true;
    [lydVarsel, lydTidUte].forEach(l => {
        const opprinneligVolum = l.volume;
        l.volume = 0;
        const p = l.play();
        if (p && p.then) {
            p.then(() => { l.pause(); l.currentTime = 0; l.volume = opprinneligVolum; })
             .catch(() => { l.volume = opprinneligVolum; });
        } else {
            l.volume = opprinneligVolum;
        }
    });
}

// ---------- SCORING ----------

function typiskTaleSekunder(type) {
    const tidKey    = type === 'innlegg' ? 'innleggTaleTid' : 'kommentarTaleTid';
    const antallKey = type === 'innlegg' ? 'innleggAntall'  : 'kommentarAntall';

    const totalTid    = deltakere.reduce((s, x) => s + (x[tidKey]    || 0), 0);
    const totalAntall = deltakere.reduce((s, x) => s + (x[antallKey] || 0), 0);

    const maks = hentMaksTaleSekunder(type) ?? 300;

    if (totalAntall === 0) return maks * 0.5;
    if (totalAntall > 10)  return totalTid / totalAntall;
    return (totalTid / totalAntall) * 0.5 + maks * 0.5;
}

// lavere jo bedre
function beregnScore(deltakerId, type, opprettet, nå = Date.now()) {
    const d = deltakere.find(dd => dd.id === deltakerId);
    if (!d) return Infinity;

    const typiskSek = typiskTaleSekunder(type);

    // Basis: hvor mye har de snakket — begge typer samlet
    let score = (d.innleggTaleTid || 0) + (d.kommentarTaleTid || 0);

    // Bonus for folk som ikke har hatt innlegg ennå
    if ((d.innleggAntall || 0) === 0) {
        score -= typiskSek / 5;
    }

    // Feministisk — additivt og capped
    const prioritert = innstillinger.feministisk &&
        (d.gender === 'Kvinne' || d.gender === 'Ikke-binær/Annet');
    if (prioritert) {
        const faktor = Math.max(0, (innstillinger.feministiskFaktor || 1.2) - 1);
        score -= typiskSek * faktor;
    }

    // Urgency — ventet > 1/10 av møtet gir ekstra prioritet, capped
    const moeteSek = (innstillinger.moeteLengdeMin || 60) * 60;
    const ventetSek = Math.max(0, (nå - opprettet) / 1000);
    const deadline = moeteSek * 0.1;
    if (ventetSek > deadline) {
        const overskudd = Math.min(ventetSek - deadline, typiskSek);
        score -= overskudd;
    }

    // Tiebreak — minst nylig talt får liten fordel (maks ~6s)
    const sekSidenSist = d.sistTalt ? (nå - d.sistTalt) / 1000 : 1e9;
    score -= Math.min(sekSidenSist, 600) * 0.01;

    return score;
}

function sorterKommentarer(innlegg) {
    if (innstillinger.algoritme !== 'smart') return [...innlegg.kommentarIder];
    const nå = Date.now();
    return [...innlegg.kommentarIder].sort((a, b) =>
        beregnScore(a.id, 'kommentar', a.opprettet, nå) -
        beregnScore(b.id, 'kommentar', b.opprettet, nå)
    );
}

function sorterVentendeInnlegg(liste) {
    if (innstillinger.algoritme !== 'smart') return [...liste];
    const nå = Date.now();
    return [...liste].sort((a, b) =>
        beregnScore(a.talerId, 'innlegg', a.opprettet, nå) -
        beregnScore(b.talerId, 'innlegg', b.opprettet, nå)
    );
}

// ---------- SIGNUP ----------

function tegnInnlegg(deltakerId) {
    const eksisterende = finnInnleggForTaler(deltakerId);
    if (eksisterende) {
        if (eksisterende.status === 'venter') {
            innleggListe = innleggListe.filter(i => i.id !== eksisterende.id);
            lagreInnlegg();
            renderAlt();
        }
        return;
    }
    innleggListe.push({
        id: 'innlegg' + innleggTeller++,
        talerId: deltakerId,
        kommentarIder: [],
        status: 'venter',
        opprettet: Date.now(),
    });
    lagreInnlegg();
    renderAlt();
}

function tegnKommentar(deltakerId) {
    for (const innlegg of innleggListe) {
        if (innlegg.status === 'ferdig') continue;
        const idx = innlegg.kommentarIder.findIndex(k => k.id === deltakerId);
        if (idx !== -1) {
            innlegg.kommentarIder.splice(idx, 1);
            lagreInnlegg();
            renderAlt();
            return;
        }
    }
    if (!aktivInnleggId) return;
    const innlegg = innleggListe.find(i => i.id === aktivInnleggId);
    if (!innlegg) return;
    innlegg.kommentarIder.push({ id: deltakerId, opprettet: Date.now() });
    lagreInnlegg();
    renderAlt();
}

// ---------- SPEAKING ----------

function avsluttAktivTale() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    if (aktivDeltakerId && nåværendeTaleType === 'kommentar') {
        for (const innlegg of innleggListe) {
            if (innlegg.status === 'ferdig') continue;
            const idx = innlegg.kommentarIder.findIndex(k => k.id === aktivDeltakerId);
            if (idx !== -1) {
                innlegg.kommentarIder.splice(idx, 1);
                break;
            }
        }
    }

    aktivDeltakerId = null;
    nåværendeTaleType = null;
    gjeldendeTaleSekunder = 0;
    varselSpilt = false;
    tidUteSpilt = false;
}

function startTale(deltakerId, foretrukketType = null) {
    if (aktivDeltakerId === deltakerId) { stoppTale(); return; }

    varmOppLyd();
    avsluttAktivTale();

    let type = foretrukketType;

    if (type === 'kommentar' && !finnKommentarInnlegg(deltakerId)) type = null;
    if (type === 'innlegg' && !finnInnleggForTaler(deltakerId)) type = null;

    if (!type) {
        if (finnKommentarInnlegg(deltakerId)) {
            type = 'kommentar';
        } else if (finnInnleggForTaler(deltakerId)) {
            type = 'innlegg';
        } else {
            type = aktivInnleggId ? 'kommentar' : 'innlegg';
        }
    }

    if (type === 'innlegg') {
        const innlegg = finnInnleggForTaler(deltakerId);
        if (innlegg && innlegg.status === 'venter') {
            if (aktivInnleggId && aktivInnleggId !== innlegg.id) {
                const prev = innleggListe.find(i => i.id === aktivInnleggId);
                if (prev) prev.status = 'ferdig';
            }
            innlegg.status = 'aktiv';
            aktivInnleggId = innlegg.id;
        }
    }

    nåværendeTaleType = type;
    aktivDeltakerId = deltakerId;

    gjeldendeTaleSekunder = 0;
    varselSpilt = false;
    tidUteSpilt = false;

    const d = deltakere.find(x => x.id === deltakerId);
    if (d) {
        d.antallGangerTalt += 1;
        if (type === 'innlegg') d.innleggAntall += 1;
        if (type === 'kommentar') d.kommentarAntall += 1;
        d.sistTalt = Date.now();
    }

    lagreInnlegg();
    renderAlt();

    timerInterval = setInterval(() => {
        if (!aktivDeltakerId) return;
        const delt = deltakere.find(x => x.id === aktivDeltakerId);
        if (!delt) return;

        delt.taleTid += 1;
        if (nåværendeTaleType === 'innlegg') delt.innleggTaleTid += 1;
        if (nåværendeTaleType === 'kommentar') delt.kommentarTaleTid += 1;
        gjeldendeTaleSekunder += 1;

        const tidEl = document.getElementById(`tid-${delt.id}`);
        if (tidEl) tidEl.textContent = formaterTid(delt.taleTid);

        const maks = hentMaksTaleSekunder(nåværendeTaleType);
        if (maks === null) return;

        const gjenstaar = maks - gjeldendeTaleSekunder;
        const nedtellingEl = document.getElementById(`nedtelling-${delt.id}`);

        if (nedtellingEl) {
            nedtellingEl.textContent = formaterTid(gjenstaar);
        }

        if (!varselSpilt && gjenstaar <= maks / 5 && gjenstaar > 0) {
            varselSpilt = true;
            spillLyd(lydVarsel);
            if (nedtellingEl) nedtellingEl.classList.add('advarsel');
        }

        if (!tidUteSpilt && gjenstaar <= 0) {
            tidUteSpilt = true;
            spillLyd(lydTidUte);
            if (nedtellingEl) {
                nedtellingEl.classList.remove('advarsel');
                nedtellingEl.classList.add('tid-ute');
            }
        }
    }, 1000);
}

function stoppTale() {
    avsluttAktivTale();
    lagreInnlegg();
    renderAlt();
}

// ---------- RENDER: DELTAKER-KORT ----------

function render() {
    if (!deltakere.length) {
        grid.innerHTML = '';
        tomMelding.hidden = false;
        return;
    }
    tomMelding.hidden = true;
    grid.innerHTML = '';

    deltakere.forEach(deltaker => {
        const kort = document.createElement('div');
        kort.className = 'deltaker-kort' + (deltaker.id === aktivDeltakerId ? ' active' : '');
        kort.id = `kort-${deltaker.id}`;

        const navn = document.createElement('div');
        navn.className = 'deltaker-navn';
        navn.textContent = deltaker.navn;

        const stat1 = document.createElement('div');
        stat1.className = 'deltaker-stat';
        stat1.innerHTML = `<span>Talt:</span><span>${deltaker.antallGangerTalt} ganger</span>`;

        const stat2 = document.createElement('div');
        stat2.className = 'deltaker-stat';
        stat2.innerHTML = `<span>Tid:</span><span id="tid-${deltaker.id}">${formaterTid(deltaker.taleTid)}</span>`;

        const knapper = document.createElement('div');
        knapper.className = 'deltaker-knapper';

        const snakkBtn = document.createElement('button');
        snakkBtn.textContent = deltaker.id === aktivDeltakerId ? 'Stopp' : 'Snakk';
        snakkBtn.addEventListener('click', () => startTale(deltaker.id));

        const innleggForTaler = finnInnleggForTaler(deltaker.id);
        const innleggBtn = document.createElement('button');
        if (!innleggForTaler) {
            innleggBtn.textContent = 'Tegn innlegg';
        } else if (innleggForTaler.status === 'aktiv') {
            innleggBtn.textContent = 'Innlegg aktiv';
            innleggBtn.disabled = true;
        } else {
            innleggBtn.textContent = 'Angre innlegg';
        }
        innleggBtn.addEventListener('click', () => tegnInnlegg(deltaker.id));

        const harKommentar = !!finnKommentarInnlegg(deltaker.id);
        const kommentarBtn = document.createElement('button');
        kommentarBtn.textContent = harKommentar ? 'Angre kommentar' : 'Tegn kommentar';
        const kanKommentere = harKommentar || !!aktivInnleggId;
        kommentarBtn.disabled = !kanKommentere;
        kommentarBtn.title = kanKommentere ? '' : 'Ingen aktivt innlegg å kommentere';
        kommentarBtn.addEventListener('click', () => tegnKommentar(deltaker.id));

        knapper.appendChild(snakkBtn);
        knapper.appendChild(innleggBtn);
        knapper.appendChild(kommentarBtn);

        kort.appendChild(navn);
        kort.appendChild(stat1);
        kort.appendChild(stat2);
        kort.appendChild(knapper);

        if (deltaker.id === aktivDeltakerId) {
            const gjenstaar = hentGjenstaaendeSekunder();
            if (gjenstaar !== null) {
                const nedtelling = document.createElement('div');
                nedtelling.className = 'deltaker-nedtelling';
                nedtelling.id = `nedtelling-${deltaker.id}`;
                nedtelling.textContent = formaterTid(gjenstaar);
                const maks = hentMaksTaleSekunder(nåværendeTaleType);
                if (gjenstaar <= 0) {
                    nedtelling.classList.add('tid-ute');
                } else if (gjenstaar <= maks / 5) {
                    nedtelling.classList.add('advarsel');
                }
                kort.appendChild(nedtelling);
            }
        }

        grid.appendChild(kort);
    });
}

// ---------- RENDER: BOTTOM BAR ----------

function lagTalerRad(deltakerId, ekstraKlasse, prefiks, foretrukketType) {
    const d = deltakere.find(dd => dd.id === deltakerId);
    const rad = document.createElement('div');
    rad.className = 'bb-taler ' + ekstraKlasse;
    if (aktivDeltakerId === deltakerId && nåværendeTaleType === foretrukketType) {
        rad.classList.add('bb-taler-aktiv');
    }
    if (prefiks) {
        const p = document.createElement('span');
        p.className = 'bb-num';
        p.textContent = prefiks;
        rad.appendChild(p);
    }
    const n = document.createElement('span');
    n.textContent = d ? d.navn : '???';
    rad.appendChild(n);
    rad.title = 'Klikk for å starte taletid';
    rad.addEventListener('click', () => startTale(deltakerId, foretrukketType || null));
    return rad;
}

function renderBottomBar() {
    forslagListe.innerHTML = '';

    const aktive = innleggListe.filter(i => i.status !== 'ferdig');
    if (!aktive.length) {
        const tom = document.createElement('div');
        tom.className = 'bb-tom';
        tom.textContent = 'Ingen forslag ennå. Tegn innlegg eller kommentar for å komme i gang.';
        forslagListe.appendChild(tom);
        return;
    }

    const aktiv = aktive.find(i => i.status === 'aktiv');
    const ventende = sorterVentendeInnlegg(aktive.filter(i => i.status === 'venter'));
    const rekkefølge = aktiv ? [aktiv, ...ventende] : ventende;

    rekkefølge.forEach((innlegg, idx) => {
        const box = document.createElement('div');
        box.className = 'bb-innlegg' + (innlegg.status === 'aktiv' ? ' bb-aktiv' : '');

        const header = document.createElement('div');
        header.className = 'bb-innlegg-header';
        if (innlegg.status === 'aktiv') {
            header.textContent = '▶ Innlegg (aktiv)';
        } else if (!aktiv && idx === 0) {
            header.textContent = 'Innlegg (start)';
        } else {
            header.textContent = 'Innlegg (neste)';
        }
        box.appendChild(header);

        box.appendChild(lagTalerRad(innlegg.talerId, 'bb-innlegg-taler', null, 'innlegg'));

        if (innlegg.kommentarIder.length) {
            const kHeader = document.createElement('div');
            kHeader.className = 'bb-kommentar-header';
            kHeader.textContent = `Kommentarer (${innlegg.kommentarIder.length}):`;
            box.appendChild(kHeader);

            const sortert = sorterKommentarer(innlegg);
            sortert.forEach((k, i) => {
                box.appendChild(
                    lagTalerRad(k.id, 'bb-kommentar-taler', `${i + 1}.`, 'kommentar')
                );
            });
        }

        forslagListe.appendChild(box);
    });
}

function renderAlt() {
    render();
    renderBottomBar();
}

// ---------- INIT ----------

lastData();

bbAlgoritme.textContent = innstillinger.algoritme === 'smart' ? 'smart' : 'kø';

renderAlt();

window.addEventListener('beforeunload', () => {
    localStorage.setItem('deltakere', JSON.stringify(deltakere));
    lagreInnlegg();
});