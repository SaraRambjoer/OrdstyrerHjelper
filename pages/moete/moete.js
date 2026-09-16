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
        kommentarData: [],
        status: 'venter',
        opprettet: Date.now(),
        startet: null,
        tittel: '',
        innleggTaleTid: 0,
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
        if (innlegg && innlegg.status === 'venter') {
            if (state.aktivInnleggId && state.aktivInnleggId !== innlegg.id) {
                const prev = state.innleggListe.find(i => i.id === state.aktivInnleggId);
                if (prev) {
                    prev.status = 'ferdig';
                }
            }
            innlegg.status = 'aktiv';
            innlegg.startet = Date.now()
            state.aktivInnleggId = innlegg.id;
        }
    } else if (type === 'kommentar') {
        const funnet = finnVentendeKommentar(state, deltakerId);
        if (funnet) funnet.kommentar.status = 'aktiv';
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

    const aktiv = aktive.find(i => i.status === 'aktiv');
    const ventende = sorterVentendeInnlegg(state, aktive.filter(i => i.status === 'venter'));
    const rekkefølge = aktiv ? [aktiv, ...ventende] : ventende;

    rekkefølge.forEach((innlegg) => {
        const box = document.createElement('div');
        box.className = 'bb-innlegg' + (innlegg.status === 'aktiv' ? ' bb-aktiv' : '');

        const header = document.createElement('div');
        header.className = 'bb-innlegg-header';
        if (innlegg.status === 'aktiv') {
            header.textContent = '▶ Innlegg (aktiv)';
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

        const ventendeKommentarer = innlegg.kommentarData.filter(k => k.status === 'venter');
        if (ventendeKommentarer.length) {
            const kHeader = document.createElement('div');
            kHeader.className = 'bb-kommentar-header';
            kHeader.textContent = `Kommentarer (${ventendeKommentarer.length}):`;
            box.appendChild(kHeader);

            const sortert = sorterKommentarer(state, innlegg).filter(k => k.status === 'venter');
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

function computeDialogContent(state) {
    const lines = [];
    let currentIndent = 0;

    let womenCommentCount = 0;
    let nonbinaryCommentCount = 0;
    let maleCommentCount = 0;
    let ikkedefinertCommentCount = 0;

    let womenCommentTaleTid = 0;
    let nonbinaryCommentTaleTid = 0;
    let maleCommentTaleTid = 0;
    let ikkedefinertCommentTaleTid = 0;

    let womenCommentIkkeAktivert = 0;
    let nonbinaryCommentIkkeAktivert = 0;
    let maleCommentIkkeAktivert = 0;
    let ikkedefinertCommentIkkeAktivert = 0;

    let womenInnleggCount = 0;
    let nonbinaryInnleggCount = 0;
    let maleInnleggCount = 0;
    let ikkedefinertInnleggCount = 0;

    let womenInnleggTaleTid = 0;
    let nonbinaryInnleggTaleTid = 0;
    let maleInnleggTaleTid = 0;
    let ikkedefinertInnleggTaleTid = 0;

    let womenInnleggIkkeAktivert = 0;
    let nonbinaryInnleggIkkeAktivert = 0;
    let maleInnleggIkkeAktivert = 0;
    let ikkedefinertInnleggIkkeAktivert = 0;

    const addLine = (text = '') => {
        lines.push('\t'.repeat(currentIndent) + text);
    };

    addLine("Innlegg i møte:");
    currentIndent += 1;

    state.innleggListe.forEach((innlegg) => {
        addLine(`Innlegg: ${innlegg.id}`);
        currentIndent += 1;

        addLine(`Tittel: ${innlegg.tittel}`);
        const displayStatus = innlegg.status === "aktiv" ? "ferdig" : innlegg.status; // the last innlegg is "active" but that is confusing in export
        addLine(`Status: ${displayStatus}`);
        addLine(`Opprettet tid: ${new Date(innlegg.opprettet).toISOString()}`);

        if (innlegg.startet != null) {
            addLine(`Startet tid: ${new Date(innlegg.startet).toISOString()}`);
        }

        const innleggDeltaker = state.deltakere.find(x => x.id === innlegg.talerId);
        const innleggKjonn = innleggDeltaker.gender;

        addLine(`Innleggsholder: ${innleggDeltaker.navn}`);
        addLine(`Innleggsholder kjønn: ${innleggKjonn}`);
        addLine(`Innleggsholder taletid: ${formaterTid(innlegg.innleggTaleTid)}`);

        const hasComments = innlegg.kommentarData && innlegg.kommentarData.length > 0;
        const showCommentDetails = innlegg.status !== 'venter' && hasComments;

        if (showCommentDetails) {
            addLine('Kommentarer: ');
            currentIndent += 1;
        }

        let womenCommentCount_Innlegg = 0;
        let nonbinaryCommentCount_Innlegg = 0;
        let maleCommentCount_Innlegg = 0;
        let ikkedefinertCommentCount_Innlegg = 0;

        let womenCommentTaleTid_Innlegg = 0;
        let nonbinaryCommentTaleTid_Innlegg = 0;
        let maleCommentTaleTid_Innlegg = 0;
        let ikkedefinertCommentTaleTid_Innlegg = 0;

        let womenCommentIkkeAktivert_Innlegg = 0;
        let nonbinaryCommentIkkeAktivert_Innlegg = 0;
        let maleCommentIkkeAktivert_Innlegg = 0;
        let ikkedefinertCommentIkkeAktivert_Innlegg = 0;

        (innlegg.kommentarData ?? []).forEach((data) => {
            const kommentator = state.deltakere.find(x => x.id === data.id);
            const kommentatorKjonn = kommentator.gender;

            if (showCommentDetails) {
                addLine(`Kommentator: ${kommentator.navn}`);
                addLine(`Kommentator kjønn: ${kommentatorKjonn}`);
                addLine(`Ønske om kommentartid registrert: ${new Date(data.opprettet).toISOString()}`);
                addLine(`Kommentartid: ${formaterTid(data.taleTid)}`);
                addLine(`Kommentarstatus: ${data.status}`);
            }

            if (kommentatorKjonn === 'Kvinne') {
                womenCommentCount_Innlegg += 1;
                womenCommentTaleTid_Innlegg += data.taleTid;
                if (data.status === 'venter') womenCommentIkkeAktivert_Innlegg += 1;
            } else if (kommentatorKjonn === 'Mann') {
                maleCommentCount_Innlegg += 1;
                maleCommentTaleTid_Innlegg += data.taleTid;
                if (data.status === 'venter') maleCommentIkkeAktivert_Innlegg += 1;
            } else if (kommentatorKjonn === 'Ikke-binær/Annet') {
                nonbinaryCommentCount_Innlegg += 1;
                nonbinaryCommentTaleTid_Innlegg += data.taleTid;
                if (data.status === 'venter') nonbinaryCommentIkkeAktivert_Innlegg += 1;
            } else {
                ikkedefinertCommentCount_Innlegg += 1;
                ikkedefinertCommentTaleTid_Innlegg += data.taleTid;
                if (data.status === 'venter') ikkedefinertCommentIkkeAktivert_Innlegg += 1;
            }
        });

        if (showCommentDetails) {
            currentIndent -= 1;

            addLine(`Antall kommentatorer (kvinne): ${womenCommentCount_Innlegg}`);
            addLine(`Antall kommentatorer (menn): ${maleCommentCount_Innlegg}`);
            addLine(`Antall kommentatorer (ikke-binær/annet): ${nonbinaryCommentCount_Innlegg}`);
            addLine(`Antall kommentatorer (ikke definert): ${ikkedefinertCommentCount_Innlegg}`);

            addLine(`Antall kommentatorer ikke aktivert (kvinne): ${womenCommentIkkeAktivert_Innlegg}`);
            addLine(`Antall kommentatorer ikke aktivert (menn): ${maleCommentIkkeAktivert_Innlegg}`);
            addLine(`Antall kommentatorer ikke aktivert (ikke-binær/annet): ${nonbinaryCommentIkkeAktivert_Innlegg}`);
            addLine(`Antall kommentatorer ikke aktivert (ikke definert): ${ikkedefinertCommentIkkeAktivert_Innlegg}`);

            addLine(`Kommentartid (kvinne): ${formaterTid(womenCommentTaleTid_Innlegg)}`);
            addLine(`Kommentartid (menn): ${formaterTid(maleCommentTaleTid_Innlegg)}`);
            addLine(`Kommentartid (ikke-binær/annet): ${formaterTid(nonbinaryCommentTaleTid_Innlegg)}`);
            addLine(`Kommentartid (ikke definert): ${formaterTid(ikkedefinertCommentTaleTid_Innlegg)}`);

            const sumKommentarTid_Innlegg =
                womenCommentTaleTid_Innlegg +
                maleCommentTaleTid_Innlegg +
                nonbinaryCommentTaleTid_Innlegg +
                ikkedefinertCommentTaleTid_Innlegg;

            addLine(`Total kommentartid: ${formaterTid(sumKommentarTid_Innlegg)}`);
            addLine(`Total innleggstid (innlegg + kommentarer): ${formaterTid(innlegg.innleggTaleTid + sumKommentarTid_Innlegg)}`);
        }

        womenCommentCount += womenCommentCount_Innlegg;
        maleCommentCount += maleCommentCount_Innlegg;
        nonbinaryCommentCount += nonbinaryCommentCount_Innlegg;
        ikkedefinertCommentCount += ikkedefinertCommentCount_Innlegg;

        womenCommentTaleTid += womenCommentTaleTid_Innlegg;
        maleCommentTaleTid += maleCommentTaleTid_Innlegg;
        nonbinaryCommentTaleTid += nonbinaryCommentTaleTid_Innlegg;
        ikkedefinertCommentTaleTid += ikkedefinertCommentTaleTid_Innlegg;

        womenCommentIkkeAktivert += womenCommentIkkeAktivert_Innlegg;
        maleCommentIkkeAktivert += maleCommentIkkeAktivert_Innlegg;
        nonbinaryCommentIkkeAktivert += nonbinaryCommentIkkeAktivert_Innlegg;
        ikkedefinertCommentIkkeAktivert += ikkedefinertCommentIkkeAktivert_Innlegg;

        if (innleggKjonn === 'Kvinne') {
            womenInnleggCount += 1;
            womenInnleggTaleTid += innlegg.innleggTaleTid;
            if (innlegg.status === 'venter') womenInnleggIkkeAktivert += 1;
        } else if (innleggKjonn === 'Mann') {
            maleInnleggCount += 1;
            maleInnleggTaleTid += innlegg.innleggTaleTid;
            if (innlegg.status === 'venter') maleInnleggIkkeAktivert += 1;
        } else if (innleggKjonn === 'Ikke-binær/Annet') {
            nonbinaryInnleggCount += 1;
            nonbinaryInnleggTaleTid += innlegg.innleggTaleTid;
            if (innlegg.status === 'venter') nonbinaryInnleggIkkeAktivert += 1;
        } else {
            ikkedefinertInnleggCount += 1;
            ikkedefinertInnleggTaleTid += innlegg.innleggTaleTid;
            if (innlegg.status === 'venter') ikkedefinertInnleggIkkeAktivert += 1;
        }

        currentIndent -= 1;
    });

    currentIndent = 0;

    addLine('Statistikk:');

    currentIndent = 1;
    addLine(`Antall innlegg (kvinne): ${womenInnleggCount}`);
    addLine(`Antall innlegg (menn): ${maleInnleggCount}`);
    addLine(`Antall innlegg (ikke-binær/annet): ${nonbinaryInnleggCount}`);
    addLine(`Antall innlegg (ikke definert): ${ikkedefinertInnleggCount}`);

    addLine(`Antall innlegg ikke aktivert (kvinne): ${womenInnleggIkkeAktivert}`);
    addLine(`Antall innlegg ikke aktivert (menn): ${maleInnleggIkkeAktivert}`);
    addLine(`Antall innlegg ikke aktivert (ikke-binær/annet): ${nonbinaryInnleggIkkeAktivert}`);
    addLine(`Antall innlegg ikke aktivert (ikke definert): ${ikkedefinertInnleggIkkeAktivert}`);

    addLine(`Antall kommentarer (kvinne): ${womenCommentCount}`);
    addLine(`Antall kommentarer (menn): ${maleCommentCount}`);
    addLine(`Antall kommentarer (ikke-binær/annet): ${nonbinaryCommentCount}`);
    addLine(`Antall kommentarer (ikke definert): ${ikkedefinertCommentCount}`);

    addLine(`Antall kommentarer ikke aktivert (kvinne): ${womenCommentIkkeAktivert}`);
    addLine(`Antall kommentarer ikke aktivert (menn): ${maleCommentIkkeAktivert}`);
    addLine(`Antall kommentarer ikke aktivert (ikke-binær/annet): ${nonbinaryCommentIkkeAktivert}`);
    addLine(`Antall kommentarer ikke aktivert (ikke definert): ${ikkedefinertCommentIkkeAktivert}`);

    addLine(`Taletid innlegg (kvinne): ${formaterTid(womenInnleggTaleTid)}`);
    addLine(`Taletid innlegg (menn): ${formaterTid(maleInnleggTaleTid)}`);
    addLine(`Taletid innlegg (ikke-binær/annet): ${formaterTid(nonbinaryInnleggTaleTid)}`);
    addLine(`Taletid innlegg (ikke definert): ${formaterTid(ikkedefinertInnleggTaleTid)}`);

    addLine(`Taletid kommentarer (kvinne): ${formaterTid(womenCommentTaleTid)}`);
    addLine(`Taletid kommentarer (menn): ${formaterTid(maleCommentTaleTid)}`);
    addLine(`Taletid kommentarer (ikke-binær/annet): ${formaterTid(nonbinaryCommentTaleTid)}`);
    addLine(`Taletid kommentarer (ikke definert): ${formaterTid(ikkedefinertCommentTaleTid)}`);

    addLine(`Taletid totalt (kvinne): ${formaterTid(womenInnleggTaleTid + womenCommentTaleTid)}`);
    addLine(`Taletid totalt (menn): ${formaterTid(maleInnleggTaleTid + maleCommentTaleTid)}`);
    addLine(`Taletid totalt (ikke-binær/annet): ${formaterTid(nonbinaryInnleggTaleTid + nonbinaryCommentTaleTid)}`);
    addLine(`Taletid totalt (ikke definert): ${formaterTid(ikkedefinertInnleggTaleTid + ikkedefinertCommentTaleTid)}`);

    addLine('Taletid per person:');

    state.deltakere.forEach((d) => {
        currentIndent = 2;
        addLine("Person: ");
        currentIndent = 3;
        addLine("Navn: " + d.navn)
        addLine("Kjønn: " + d.gender);
        addLine("Total taletid: " + formaterTid(d.taleTid));
        addLine("Total taletid (innlegg): " + formaterTid(d.innleggTaleTid));
        addLine("Total taletid (kommentar): " + formaterTid(d.kommentarTaleTid));
    });

    return lines.join('\n');
}

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