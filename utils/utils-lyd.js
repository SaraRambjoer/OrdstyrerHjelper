

export function spillLyd(lyd) {
    try {
        lyd.currentTime = 0;
        const p = lyd.play();
        if (p && p.catch) p.catch(() => {});
    } catch (_) {}
}

export function varmOppLyd(lydVarsel, lydTidUte) {
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
