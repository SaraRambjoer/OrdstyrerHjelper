export function finnInnleggForTaler(state, deltakerId) {
    return state.innleggListe.find(i => i.talerId === deltakerId && i.status !== 'ferdig');
}


export function finnVentendeKommentar(state, deltakerId) {
    for (const innlegg of state.innleggListe) {
        if (innlegg.status === 'ferdig') continue;
        const kommentar = innlegg.kommentarData.find(k => k.id === deltakerId && k.status === 'venter');
        if (kommentar) return { innlegg, kommentar };
    }
    return null;
}

export function hentMaksTaleSekunder(state, type) {
    if (type === 'innlegg')   return (state.innstillinger.maksInnleggMin || 5) * 60;
    if (type === 'kommentar') return (state.innstillinger.maksKommentarMin || 2) * 60;
    return null;
}

export function hentGjenstaaendeSekunder(state) {
    const maks = hentMaksTaleSekunder(state, state.nåværendeTaleType);
    if (maks === null) return null;
    return maks - state.gjeldendeTaleSekunder;
}