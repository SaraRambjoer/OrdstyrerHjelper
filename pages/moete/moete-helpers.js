export function finnInnleggForTaler(state, deltakerId) {
    return state.innleggListe.find(i => i.talerId === deltakerId && i.status !== 'ferdig');
}

export function finnKommentarInnlegg(state, deltakerId) {
    return state.innleggListe.find(i =>
        i.status !== 'ferdig' && i.kommentarIder.some(k => k.id === deltakerId)
    );
}

export function hentMaksTaleSekunder(state, type) {
    if (type === 'innlegg')   return (state.innstillinger.maksInnleggMin || 5) * 60;
    if (type === 'kommentar') return (state.innstillinger.maksKommentarMin || 2) * 60;
    return null;
}

export function hentGjenstaaendeSekunder(state) {
    const maks = hentMaksTaleSekunder(state.nåværendeTaleType);
    if (maks === null) return null;
    return maks - state.gjeldendeTaleSekunder;
}