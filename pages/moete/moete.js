import { spillLyd, varmOppLyd } from '../../utils/utils-lyd.js';
import { lagreInnlegg, lastData } from './moete-load-save.js';
import { formaterTid } from '../../utils/utils-display.js';
import { 
    finnInnleggForTaler, 
    finnKommentarInnlegg, 
    hentMaksTaleSekunder, 
    hentGjenstaaendeSekunder,
}
from './moete-helpers.js';

import {
    sorterKommentarer, 
    sorterVentendeInnlegg, 
}
from './scoring.js';



let state = {
    deltakere: [],
    aktivDeltakerId: null,
    timerInterval: null,
    nåværendeTaleType: null, // 'innlegg' | 'kommentar'
    innleggListe: [],
    innleggTeller: 1,
    aktivInnleggId: null,
    innstillinger: {
        algoritme: 'kø',
        feministisk: false,
        feministiskFaktor: 1.2,
        moeteLengdeMin: 60,
        maksInnleggMin: 5,
        maksKommentarMin: 2,
    },
    gjeldendeTaleSekunder: 0,
    varselSpilt: false,
    tidUteSpilt: false,
};


const LYD_VARSEL_STI = '../../lyder/varsel.mp3';
const LYD_TID_UTE_STI = '../../lyder/tid-ute.mp3';

const lydVarsel = new Audio(LYD_VARSEL_STI);
const lydTidUte = new Audio(LYD_TID_UTE_STI);

const grid = document.getElementById('deltaker-grid');
const tomMelding = document.getElementById('tom-melding');
const forslagListe = document.getElementById('forslag-liste');
const bbAlgoritme = document.getElementById('bb-algoritme');


// ---------- SIGNUP ----------

function tegnInnlegg(deltakerId) {
    const eksisterende = finnInnleggForTaler(state, deltakerId);
    if (eksisterende) {
        if (eksisterende.status === 'venter') {
            state.innleggListe = state.innleggListe.filter(i => i.id !== eksisterende.id);
            lagreInnlegg(state);
            renderAlt();
        }
        return;
    }
    state.innleggListe.push({
        id: 'innlegg' + state.innleggTeller++,
        talerId: deltakerId,
        kommentarIder: [],
        status: 'venter',
        opprettet: Date.now(),
    });
    lagreInnlegg(state);
    renderAlt();
}

function tegnKommentar(deltakerId) {
    for (const innlegg of state.innleggListe) {
        if (innlegg.status === 'ferdig') continue;
        const idx = innlegg.kommentarIder.findIndex(k => k.id === deltakerId);
        if (idx !== -1) {
            innlegg.kommentarIder.splice(idx, 1);
            lagreInnlegg(state);
            renderAlt();
            return;
        }
    }
    if (!state.aktivInnleggId) return;
    const innlegg = state.innleggListe.find(i => i.id === state.aktivInnleggId);
    if (!innlegg) return;
    innlegg.kommentarIder.push({ id: deltakerId, opprettet: Date.now() });
    lagreInnlegg(state);
    renderAlt();
}

// ---------- SPEAKING ----------

function avsluttAktivTale() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }

    if (state.aktivDeltakerId && state.nåværendeTaleType === 'kommentar') {
        for (const innlegg of state.innleggListe) {
            if (innlegg.status === 'ferdig') continue;
            const idx = innlegg.kommentarIder.findIndex(k => k.id === state.aktivDeltakerId);
            if (idx !== -1) {
                innlegg.kommentarIder.splice(idx, 1);
                break;
            }
        }
    }

    state.aktivDeltakerId = null;
    state.nåværendeTaleType = null;
    state.gjeldendeTaleSekunder = 0;
    state.varselSpilt = false;
    state.tidUteSpilt = false;
}

function startTale(deltakerId, foretrukketType = null) {
    if (state.aktivDeltakerId === deltakerId) { stoppTale(); return; }

    avsluttAktivTale();

    let type = foretrukketType;

    if (type === 'kommentar' && !finnKommentarInnlegg(state, deltakerId)) type = null;
    if (type === 'innlegg' && !finnInnleggForTaler(state, deltakerId)) type = null;

    if (!type) {
        if (finnKommentarInnlegg(state, deltakerId)) {
            type = 'kommentar';
        } else if (finnInnleggForTaler(state, deltakerId)) {
            type = 'innlegg';
        } else {
            type = state.aktivInnleggId ? 'kommentar' : 'innlegg';
        }
    }

    if (type === 'innlegg') {
        const innlegg = finnInnleggForTaler(state, deltakerId);
        if (innlegg && innlegg.status === 'venter') {
            if (state.aktivInnleggId && state.aktivInnleggId !== innlegg.id) {
                const prev = state.innleggListe.find(i => i.id === state.aktivInnleggId);
                if (prev) prev.status = 'ferdig';
            }
            innlegg.status = 'aktiv';
            state.aktivInnleggId = innlegg.id;
        }
    }

    state.nåværendeTaleType = type;
    state.aktivDeltakerId = deltakerId;

    state.gjeldendeTaleSekunder = 0;
    state.varselSpilt = false;
    state.tidUteSpilt = false;

    const d = state.deltakere.find(x => x.id === deltakerId);
    if (d) {
        d.antallGangerTalt += 1;
        if (type === 'innlegg') d.innleggAntall += 1;
        if (type === 'kommentar') d.kommentarAntall += 1;
        d.sistTalt = Date.now();
    }

    lagreInnlegg(state);
    renderAlt();

    state.timerInterval = setInterval(() => {
        if (!state.aktivDeltakerId) return;
        const delt = state.deltakere.find(x => x.id === state.aktivDeltakerId);
        if (!delt) return;

        delt.taleTid += 1;
        if (state.nåværendeTaleType === 'innlegg') delt.innleggTaleTid += 1;
        if (state.nåværendeTaleType === 'kommentar') delt.kommentarTaleTid += 1;
        state.gjeldendeTaleSekunder += 1;

        const tidEl = document.getElementById(`tid-${delt.id}`);
        if (tidEl) tidEl.textContent = formaterTid(delt.taleTid);

        const maks = hentMaksTaleSekunder(state, state.nåværendeTaleType);
        if (maks === null) return;

        const gjenstaar = maks - state.gjeldendeTaleSekunder;
        const nedtellingEl = document.getElementById(`nedtelling-${delt.id}`);

        if (nedtellingEl) {
            nedtellingEl.textContent = formaterTid(gjenstaar);
        }

        if (!state.varselSpilt && gjenstaar <= maks / 5 && gjenstaar > 0) {
            state.varselSpilt = true;
            spillLyd(lydVarsel);
            if (nedtellingEl) nedtellingEl.classList.add('advarsel');
        }

        if (!state.tidUteSpilt && gjenstaar <= 0) {
            state.tidUteSpilt = true;
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
    lagreInnlegg(state);
    renderAlt();
}

// ---------- RENDER: DELTAKER-KORT ----------

function render() {
    if (!state.deltakere.length) {
        grid.innerHTML = '';
        tomMelding.hidden = false;
        return;
    }
    tomMelding.hidden = true;
    grid.innerHTML = '';

    state.deltakere.forEach(deltaker => {
        const kort = document.createElement('div');
        kort.className = 'deltaker-kort' + (deltaker.id === state.aktivDeltakerId ? ' active' : '');
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
        snakkBtn.textContent = deltaker.id === state.aktivDeltakerId ? 'Stopp' : 'Snakk';
        snakkBtn.addEventListener('click', () => startTale(deltaker.id));

        const innleggForTaler = finnInnleggForTaler(state, deltaker.id);
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

        const harKommentar = !!finnKommentarInnlegg(state, deltaker.id);
        const kommentarBtn = document.createElement('button');
        kommentarBtn.textContent = harKommentar ? 'Angre kommentar' : 'Tegn kommentar';
        const kanKommentere = harKommentar || !!state.aktivInnleggId;
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

        if (deltaker.id === state.aktivDeltakerId) {
            const gjenstaar = hentGjenstaaendeSekunder();
            if (gjenstaar !== null) {
                const nedtelling = document.createElement('div');
                nedtelling.className = 'deltaker-nedtelling';
                nedtelling.id = `nedtelling-${deltaker.id}`;
                nedtelling.textContent = formaterTid(gjenstaar);
                const maks = hentMaksTaleSekunder(state, state.nåværendeTaleType);
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
    const d = state.deltakere.find(dd => dd.id === deltakerId);
    const rad = document.createElement('div');
    rad.className = 'bb-taler ' + ekstraKlasse;
    if (state.aktivDeltakerId === deltakerId && state.nåværendeTaleType === foretrukketType) {
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

    const aktive = state.innleggListe.filter(i => i.status !== 'ferdig');
    if (!aktive.length) {
        const tom = document.createElement('div');
        tom.className = 'bb-tom';
        tom.textContent = 'Ingen forslag ennå. Tegn innlegg eller kommentar for å komme i gang.';
        forslagListe.appendChild(tom);
        return;
    }

    const aktiv = aktive.find(i => i.status === 'aktiv');
    const ventende = sorterVentendeInnlegg(state, aktive.filter(i => i.status === 'venter'));
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

            const sortert = sorterKommentarer(state, innlegg);
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

lastData(state);

bbAlgoritme.textContent = state.innstillinger.algoritme === 'smart' ? 'smart' : 'kø';

renderAlt();

window.addEventListener('beforeunload', () => {
    localStorage.setItem('deltakere', JSON.stringify(state.deltakere));
    lagreInnlegg(state);
});

varmOppLyd(lydVarsel, lydTidUte);