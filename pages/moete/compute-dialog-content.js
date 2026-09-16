import { formaterTid } from "../../utils/utils-display.js";

export function computeDialogContent(state) {
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
        const displayStatus = innlegg.status === "aktiv" || innlegg.status === 'pause' ? "ferdig" : innlegg.status; // the last innlegg is "active" or "pause" but that is confusing in export
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
