import { hentMaksTaleSekunder } from "./moete-helpers.js";

function typiskTaleSekunder(state, type) {
    const tidKey    = type === 'innlegg' ? 'innleggTaleTid' : 'kommentarTaleTid';
    const antallKey = type === 'innlegg' ? 'innleggAntall'  : 'kommentarAntall';

    const totalTid    = state.deltakere.reduce((s, x) => s + (x[tidKey]    || 0), 0);
    const totalAntall = state.deltakere.reduce((s, x) => s + (x[antallKey] || 0), 0);

    const maks = hentMaksTaleSekunder(state, type) ?? 300;

    if (totalAntall === 0) return maks * 0.5;
    if (totalAntall > 10)  return totalTid / totalAntall;
    return (totalTid / totalAntall) * 0.5 + maks * 0.5;
}

// lavere jo bedre
function beregnScore(state, deltakerId, type, opprettet, nå = Date.now()) {
    const d = state.deltakere.find(dd => dd.id === deltakerId);
    if (!d) return Infinity;

    const typiskSek = typiskTaleSekunder(state, type);

    // Basis: hvor mye har de snakket — begge typer samlet
    let score = (d.innleggTaleTid || 0) + (d.kommentarTaleTid || 0);

    // Bonus for folk som ikke har hatt innlegg ennå
    if ((d.innleggAntall || 0) === 0) {
        score -= typiskSek / 5;
    }

    // Feministisk — additivt og capped
    const prioritert = state.innstillinger.feministisk &&
        (d.gender === 'Kvinne' || d.gender === 'Ikke-binær/Annet');
    if (prioritert) {
        const faktor = Math.max(0, (state.innstillinger.feministiskFaktor || 1.2) - 1);
        score -= typiskSek * faktor;
    }

    // Urgency — ventet > 1/10 av møtet gir ekstra prioritet, capped
    const moeteSek = (state.innstillinger.moeteLengdeMin || 60) * 60;
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

// Hvis scorene er nærmere enn dette (i sekunder), avgjør køposisjon.
const NÆR_SCORE_TERSKEL_SEK = 120;

// Feministisk modifikator på køposisjon (kun for tiebreak).
const FEMINISTISK_KØ_BONUS = 2;

// Effektiv køposisjon. Kvinner/ikke-binære får -2 når feministisk er på.
function effektivKøposisjon(state, deltakerId, queuePosition) {
    let pos = queuePosition ?? 0;
    if (state.innstillinger.feministisk) {
        const d = state.deltakere.find(dd => dd.id === deltakerId);
        if (d && (d.gender === 'Kvinne' || d.gender === 'Ikke-binær/Annet')) {
            pos -= FEMINISTISK_KØ_BONUS;
        }
    }
    return pos;
}

// Sammenlign to kø-elementer (innlegg eller kommentar). Negativ => a først.
function sammenlign(state, a, b, type, nå) {
    const aId = type === 'innlegg' ? a.talerId : a.id;
    const bId = type === 'innlegg' ? b.talerId : b.id;

    const scoreA = beregnScore(state, aId, type, a.opprettet, nå);
    const scoreB = beregnScore(state, bId, type, b.opprettet, nå);
    const diff = scoreA - scoreB;

    // Vesentlig forskjell — la score avgjøre.
    if (Math.abs(diff) >= NÆR_SCORE_TERSKEL_SEK) return diff;

    // Nær score — bruk (feministisk-justert) køposisjon.
    const qA = effektivKøposisjon(state, aId, a.queuePosition);
    const qB = effektivKøposisjon(state, bId, b.queuePosition);
    return qA - qB;
}

export function sorterKommentarer(state, innlegg) {
    if (state.innstillinger.algoritme !== 'smart') {
        return [...innlegg.kommentarData];
    }
    const nå = Date.now();
    return [...innlegg.kommentarData].sort((a, b) =>
        sammenlign(state, a, b, 'kommentar', nå)
    );
}

export function sorterVentendeInnlegg(state, liste) {
    if (state.innstillinger.algoritme !== 'smart') {
        return [...liste];
    }
    const nå = Date.now();
    return [...liste].sort((a, b) =>
        sammenlign(state, a, b, 'innlegg', nå)
    );
}