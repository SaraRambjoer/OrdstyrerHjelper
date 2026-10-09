import { hentMaksTaleSekunder } from "./moete-helpers.js";
import { sorterVentendeInnlegg } from "./scoring.js";

function beregnAvgInnleggSek(state) {
    let totalTid = 0, totalAntall = 0;
    for (const d of state.deltakere) {
        totalTid += d.innleggTaleTid || 0;
        totalAntall += d.innleggAntall || 0;
    }
    return totalAntall > 0 ? totalTid / totalAntall : null;
}

function beregnAvgKommentarSek(state) {
    let totalTid = 0, totalAntall = 0;
    for (const d of state.deltakere) {
        totalTid += d.kommentarTaleTid || 0;
        totalAntall += d.kommentarAntall || 0;
    }
    return totalAntall > 0 ? totalTid / totalAntall : null;
}

function beregnAvgKommentarerPerInnlegg(state) {
    const innlegg = state.innleggListe;
    if (!innlegg.length) return 0;
    let total = 0;
    for (const i of innlegg) total += i.kommentarData.length;
    return total / innlegg.length;
}

export function beregnGjenstaaendeForInnlegg(state, innlegg) {
    const maksInnleggSek = hentMaksTaleSekunder(state, 'innlegg');
    const maksKommentarSek = hentMaksTaleSekunder(state, 'kommentar');
    const avgInnleggSek = beregnAvgInnleggSek(state) ?? maksInnleggSek;
    const avgKommentarSek = beregnAvgKommentarSek(state) ?? maksKommentarSek;

    const erAktivInnlegg = state.aktivInnleggId === innlegg.id;
    const erAktivKommentar = erAktivInnlegg && state.nåværendeTaleType === 'kommentar';

    // Antall gjenstående kommentarer (ventende). Når man snakker en kommentar,
    // er den aktive ikke lenger 'venter', så N teller de andre.
    const N = innlegg.kommentarData.filter(k => k.status === 'venter').length;

    let gjenstaaendeMaks, gjenstaaendeAvg;

    if (erAktivKommentar) {
        const aktivKommentar = innlegg.kommentarData.find(k => k.status === 'aktiv');
        const spilt = aktivKommentar ? aktivKommentar.taleTid : 0;
        gjenstaaendeMaks = (maksKommentarSek - spilt) + N * maksKommentarSek;
        gjenstaaendeAvg  = (avgKommentarSek - spilt) + N * avgKommentarSek;
    } else {
        const spilt = innlegg.innleggTaleTid || 0;
        gjenstaaendeMaks = (maksInnleggSek - spilt) + N * maksKommentarSek;
        gjenstaaendeAvg  = (avgInnleggSek - spilt) + N * avgKommentarSek;
    }

    return {
        maks: Math.max(0, gjenstaaendeMaks),
        avg: Math.max(0, gjenstaaendeAvg),
    };
}

export function beregnTotalEstimater(state) {
    const maksInnleggSek = hentMaksTaleSekunder(state, 'innlegg');
    const avgInnleggSek = beregnAvgInnleggSek(state) ?? maksInnleggSek;
    const avgKommentarSek = beregnAvgKommentarSek(state) ?? hentMaksTaleSekunder(state, 'kommentar');
    const avgKommentarerPerInnlegg = beregnAvgKommentarerPerInnlegg(state);

    const aktive = state.innleggListe.filter(i => i.status !== 'ferdig');
    const aktiv = aktive.find(i => i.status === 'aktiv' || i.status === 'pause');
    const ventende = sorterVentendeInnlegg(state, aktive.filter(i => i.status === 'venter'));
    const rekkefølge = aktiv ? [aktiv, ...ventende] : ventende;

    if (!rekkefølge.length) return null;

    const current = rekkefølge[0];
    const M = rekkefølge.length - 1;
    const currentEst = beregnGjenstaaendeForInnlegg(state, current);

    const totalMaks = currentEst.maks + M * maksInnleggSek;
    const totalAvg = currentEst.avg + M * avgInnleggSek;
    const totalAvgMedKommentarer = currentEst.avg + M * avgInnleggSek + M * avgKommentarerPerInnlegg * avgKommentarSek;

    return { currentEst, M, totalMaks, totalAvg, totalAvgMedKommentarer };
}

