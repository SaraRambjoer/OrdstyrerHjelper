export function lastData(state) {
    const lagretDeltakere = localStorage.getItem('deltakere');
    if (lagretDeltakere) {
        try {
            state.deltakere = JSON.parse(lagretDeltakere).map(normaliserDeltaker);
        } catch (e) {
            console.error('Kunne ikke parse deltakere', e);
            state.deltakere = [];
        }
    }

    const lagretInnst = localStorage.getItem('moeteInnstillinger');
    if (lagretInnst) {
        try { 
            state.innstillinger = { ...state.innstillinger, ...JSON.parse(lagretInnst) }; 
        } catch (e) {}
    }

    const lagretInnlegg = localStorage.getItem('innleggListe');
    if (lagretInnlegg) {
        try {
            const data = JSON.parse(lagretInnlegg);
            state.innleggListe = (data.innleggListe || []).map(i => ({
                ...i,
                kommentarIder: normaliserKommentarIder(i.kommentarIder),
            }));
            state.aktivInnleggId = data.aktivInnleggId || null;
            state.innleggTeller = data.innleggTeller || 1;
        } catch (e) {}
    }
}

export function lagreInnlegg(state) {
    const object = {
        innleggListe: state.innleggListe, 
        aktivInnleggId: state.aktivInnleggId, 
        innleggTeller: state.innleggTeller,
    };
    localStorage.setItem(
        'innleggListe', 
        JSON.stringify(object)
    );
}


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