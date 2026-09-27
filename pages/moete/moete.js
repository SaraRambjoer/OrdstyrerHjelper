import { spillLyd, varmOppLyd } from '../../utils/utils-lyd.js';
import { lagreInnlegg, lastData } from './moete-load-save.js';
import { formaterTid } from '../../utils/utils-display.js';
import { 
    finnInnleggForTaler, 
    finnVentendeKommentar,
    hentMaksTaleSekunder, 
    hentGjenstaaendeSekunder,
}
from './moete-helpers.js';

import {
    sorterKommentarer, 
    sorterVentendeInnlegg, 
}
from './scoring.js';
import { downloadFile } from '../../utils/utils-input-output.js';
import { computeDialogContent } from './compute-dialog-content.js';


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
    // Eksplisitt kø-tracking (brukt av scoring.js som tiebreak)
    innleggQueueTeller: 1,
    kommentarQueueTeller: 1,
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
        kommentarData: [],
        status: 'venter',
        opprettet: Date.now(),
        startet: null,
        tittel: '',
        innleggTaleTid: 0,
        queuePosition: state.innleggQueueTeller++,
    });
    lagreInnlegg(state);
    renderAlt();
}

function tegnKommentar(deltakerId) {
    for (const innlegg of state.innleggListe) {
        if (innlegg.status === 'ferdig') continue;
        const idx = innlegg.kommentarData.findIndex(k => k.id === deltakerId && k.status === 'venter');
        if (idx !== -1) {
            innlegg.kommentarData.splice(idx, 1);
            lagreInnlegg(state);
            renderAlt();
            return;
        }
    }
    if (!state.aktivInnleggId) return;
    const innlegg = state.innleggListe.find(i => i.id === state.aktivInnleggId);
    if (!innlegg) return;
    innlegg.kommentarData.push({
        id: deltakerId,
        opprettet: Date.now(),
        taleTid: 0,
        status: 'venter',
        queuePosition: state.kommentarQueueTeller++,
    });
    lagreInnlegg(state);
    renderAlt();
}

// ---------- SPEAKING ----------

function avsluttAktivTale() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }

    if (state.aktivDeltakerId && state.nåværendeTaleType === 'kommentar') {
        for (const innlegg of state.innleggListe) {
            if (innlegg.status === 'ferdig') continue;
            const k = innlegg.kommentarData.find(k => k.id === state.aktivDeltakerId && k.status === 'aktiv');
            if (k) {
                k.status = 'ferdig';
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

    if (type === 'kommentar' && !finnVentendeKommentar(state, deltakerId)) {
        type = null;
    }
    if (type === 'innlegg' && !finnInnleggForTaler(state, deltakerId)) {
        type = null;
    }

    if (!type) {
        if (finnVentendeKommentar(state, deltakerId)) {
            type = 'kommentar';
        } else if (finnInnleggForTaler(state, deltakerId)) {
            type = 'innlegg';
        } else {
            type = state.aktivInnleggId ? 'kommentar' : 'innlegg';
        }
    }

    if (type === 'innlegg') {
        const innlegg = finnInnleggForTaler(state, deltakerId);
        if (innlegg && (innlegg.status === 'venter' || innlegg.status === 'pause')) {
            if (state.aktivInnleggId && state.aktivInnleggId !== innlegg.id) {
                const prev = state.innleggListe.find(i => i.id === state.aktivInnleggId);
                if (prev) {
                    prev.status = 'ferdig';
                }
            }
            if (innlegg.status === 'venter') {
                innlegg.startet = Date.now();
            }
            innlegg.status = 'aktiv';
            state.aktivInnleggId = innlegg.id;
        }
    } else if (type === 'kommentar') {
        const funnet = finnVentendeKommentar(state, deltakerId);
        if (funnet) funnet.kommentar.status = 'aktiv';
        // Someone is speaking again — un-pause the current innlegg
        if (state.aktivInnleggId) {
            const innlegg = state.innleggListe.find(i => i.id === state.aktivInnleggId);
            if (innlegg && innlegg.status === 'pause') {
                innlegg.status = 'aktiv';
            }
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

        const innlegg = state.innleggListe.find(i => i.id === state.aktivInnleggId);
        if (innlegg) {
            if (state.nåværendeTaleType === 'innlegg') {
                innlegg.innleggTaleTid += 1;
            } else if (state.nåværendeTaleType === 'kommentar') {
                const kom = innlegg.kommentarData.find(k => k.id === delt.id);
                if (kom) kom.taleTid += 1;
            }
        }

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
    // If an innlegg is currently active, park it in "pause" instead of leaving it "aktiv"
    if (state.aktivInnleggId) {
        const innlegg = state.innleggListe.find(i => i.id === state.aktivInnleggId);
        if (innlegg && innlegg.status === 'aktiv') {
            innlegg.status = 'pause';
        }
    }
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
        } else if (innleggForTaler.status === 'pause') {
            innleggBtn.textContent = 'Innlegg pause';
            innleggBtn.disabled = true;
        } else {
            innleggBtn.textContent = 'Angre innlegg';
        }
        innleggBtn.addEventListener('click', () => tegnInnlegg(deltaker.id));

        const harKommentar = !!finnVentendeKommentar(state, deltaker.id);
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
            const gjenstaar = hentGjenstaaendeSekunder(state);
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

function lagInnleggRad(innlegg) {
    const d = state.deltakere.find(dd => dd.id === innlegg.talerId);
    const rad = document.createElement('div');
    rad.className = 'bb-taler bb-innlegg-taler';
    if (state.aktivDeltakerId === innlegg.talerId && state.nåværendeTaleType === 'innlegg') {
        rad.classList.add('bb-taler-aktiv');
    }
    const n = document.createElement('span');
    n.textContent = d ? d.navn : '???';
    rad.appendChild(n);
    rad.title = 'Klikk for å starte taletid';
    rad.addEventListener('click', () => startTale(innlegg.talerId, 'innlegg'));
    return rad;
}

function lagKommentarRad(kommentar, nummer) {
    const d = state.deltakere.find(dd => dd.id === kommentar.id);
    const rad = document.createElement('div');
    rad.className = 'bb-taler bb-kommentar-taler';
    if (state.aktivDeltakerId === kommentar.id && state.nåværendeTaleType === 'kommentar') {
        rad.classList.add('bb-taler-aktiv');
    }
    const p = document.createElement('span');
    p.className = 'bb-num';
    p.textContent = `${nummer}.`;
    rad.appendChild(p);
    const n = document.createElement('span');
    n.textContent = d ? d.navn : '???';
    rad.appendChild(n);
    rad.title = 'Klikk for å starte taletid';
    rad.addEventListener('click', () => startTale(kommentar.id, 'kommentar'));
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

    const aktiv = aktive.find(i => i.status === 'aktiv' || i.status === 'pause');
    const ventende = sorterVentendeInnlegg(state, aktive.filter(i => i.status === 'venter'));
    const rekkefølge = aktiv ? [aktiv, ...ventende] : ventende;

    rekkefølge.forEach((innlegg) => {
        const box = document.createElement('div');
        box.className = 'bb-innlegg' + (
            innlegg.status === 'aktiv' ? ' bb-aktiv' :
            innlegg.status === 'pause' ? ' bb-pause' : ''
        );

        const header = document.createElement('div');
        header.className = 'bb-innlegg-header';
        if (innlegg.status === 'aktiv') {
            header.textContent = '▶ Innlegg (aktiv)';
        } else if (innlegg.status === 'pause') {
            header.textContent = '⏸ Innlegg (pause)';
        } else if (!aktiv && rekkefølge.indexOf(innlegg) === 0) {
            header.textContent = 'Innlegg (start)';
        } else {
            header.textContent = 'Innlegg (neste)';
        }
        box.appendChild(header);

        box.appendChild(lagInnleggRad(innlegg));

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Tema for innlegg";
        input.className = "bb-input";
        input.value = innlegg.tittel ?? '';
        input.addEventListener("input", (e) => {
            innlegg.tittel = e.target.value;
            lagreInnlegg(state);
        });

        box.appendChild(input);

        const ventendeKommentarer = innlegg.kommentarData.filter(k => k.status === 'venter' || k.status == 'aktiv');
        if (ventendeKommentarer.length) {
            const kHeader = document.createElement('div');
            kHeader.className = 'bb-kommentar-header';
            kHeader.textContent = `Kommentarer (${ventendeKommentarer.length}):`;
            box.appendChild(kHeader);

            let sortert = sorterKommentarer(state, innlegg).filter(k => k.status === 'venter');
            if (innlegg.kommentarData.filter(x => x.status === 'aktiv').length > 0) {
                const aktivKommentar = innlegg.kommentarData.find(x => x.status === 'aktiv');
                sortert = [aktivKommentar, ...sortert];
            }
            console.log(sortert);
            sortert.forEach((k, i) => {
                box.appendChild(lagKommentarRad(k, i + 1));
            });
        }

        forslagListe.appendChild(box);
    });
}

function renderAlt() {
    render();
    renderBottomBar();
}

// ---------- DIALOG ----------

const dialog = document.getElementById("innlegg-modal");
const dialogExport = document.getElementById("eksporter");
const dialogClose = document.getElementById("lukk")
const dialogOpen = document.getElementById("aapne-modal");
const dialogContent = document.getElementById("modal-innhold");

dialogOpen.addEventListener("click", () => {
    dialog.showModal();
    const content = computeDialogContent(state);
    dialogContent.textContent = content;
});

dialogExport.addEventListener("click", () => {
    const content = computeDialogContent(state);
    downloadFile(content, "Møteeksport_" + new Date(Date.now()).toISOString() + ".yaml", "application/yaml");
});

dialogClose.addEventListener("click", () => {
    dialog.close();
});

// ---------- INIT ----------

lastData(state);

bbAlgoritme.textContent = state.innstillinger.algoritme === 'smart' ? 'smart' : 'kø';

renderAlt();

window.addEventListener('beforeunload', () => {
    localStorage.setItem('deltakere', JSON.stringify(state.deltakere));
    lagreInnlegg(state);
});

varmOppLyd(lydVarsel, lydTidUte);