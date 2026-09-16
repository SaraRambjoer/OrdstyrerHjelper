import { copyTextToClipboard, readTextFromClipboard } from './utils.js';


const genderOptions = ["Mann", "Kvinne", "Ikke-binær/Annet", "Ikke oppgitt"];
let idCounter = 1;
let deltakere = [
    {id: "deltaker" + idCounter++, navn: "", gender: "Ikke oppgitt"}
];

let deltakereDiv = document.getElementById("møte-deltakere-innhold");
let nyDeltakerKnapp = document.getElementById("legg-til-deltaker");
let lagreKnapp = document.getElementById("lagre");

// --- Innstillinger ---
const feministiskCheckbox = document.getElementById("feministisk");
const feministiskFaktorInput = document.getElementById("feministisk-faktor");

feministiskCheckbox.checked = true;

feministiskCheckbox.addEventListener("change", () => {
    feministiskFaktorInput.disabled = !feministiskCheckbox.checked;
});
feministiskFaktorInput.disabled = !feministiskCheckbox.checked;

function hentInnstillinger() {
    return {
        algoritme: document.getElementById("algoritme").value,
        feministisk: feministiskCheckbox.checked,
        feministiskFaktor: parseFloat(feministiskFaktorInput.value) || 1.2,
        moeteLengdeMin: parseInt(document.getElementById("moete-lengde").value, 10) || 60,
        maksInnleggMin: parseInt(document.getElementById("maks-innlegg").value, 10) || 5,
        maksKommentarMin: parseInt(document.getElementById("maks-kommentar").value, 10) || 2,
    };
}
// --- /Innstillinger ---

nyDeltakerKnapp.addEventListener("click", () => {
    deltakere.push({id: "deltaker" + idCounter++, navn: "", gender: "Ikke oppgitt"});
    rekalkulerDeltakerliste();
})

lagreKnapp.addEventListener("click", () => {
    save();
})


rekalkulerDeltakerliste();


function rekalkulerDeltakerliste() {
    deltakereDiv.replaceChildren();

    deltakere.forEach(deltaker => {
        const row = document.createElement("div");
        row.className = "row";
        row.id = deltaker.id + "row";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = deltaker.navn;
        nameInput.id = deltaker.id + "navn";
        nameInput.title = "Navn";
        nameInput.name = "Navn"
        nameInput.placeholder = "Skriv inn navn her"

        nameInput.addEventListener("input", (event) => {
            updateDeltakerNameById(deltaker.id, event.target.value);
        });

        const genderInput = document.createElement("select");
        genderInput.id = deltaker.id + "dropdown";
        genderInput.name = "Kjønn";
        genderInput.title = "Kjønn";

        genderOptions.forEach(x => {
            const option = document.createElement("option");
            option.value = x;
            option.text = x;
            genderInput.appendChild(option);
        });

        genderInput.value = deltaker.gender;

        genderInput.addEventListener("change", (event) => {
            updateDeltakerGender(deltaker.id, event.target.value);
        });

        const removeButton = document.createElement("button");
        removeButton.id = deltaker.id + "removebutton";
        removeButton.textContent = "Fjern";
        removeButton.addEventListener("click", () =>  {
            removeDeltakerById(deltaker.id);
        });

        row.appendChild(nameInput);
        row.appendChild(genderInput);
        row.appendChild(removeButton);

        deltakereDiv.appendChild(row);
    });

    refreshButtonRender();
}

function refreshButtonRender() {
    const lagreButton = document.getElementById("lagre");
    const writeClipboardButton = document.getElementById("skriv-clipboard");
    
    if (deltakere.length === 0) {
        lagreButton.disabled = true;
        lagreButton.textContent = "Kan ikke starte møte uten deltakere";
        writeClipboardButton.disabled = true;
    }
    else if (deltakere.filter(x => x.navn === null || x.navn === undefined || x.navn.trim() === "").length > 0) {
        lagreButton.disabled = true;
        lagreButton.textContent = "En eller flere deltakere har ikke registrert navn";
        writeClipboardButton.disabled = true;
    }
    else {
        lagreButton.disabled = false;
        lagreButton.textContent = "Start møte";
        writeClipboardButton.disabled = false;
    }
}

function removeDeltakerById(id) {
    if (deltakere.map(x => x.id).includes(id)) {
        deltakere = deltakere.filter(x => x.id !== id);
        rekalkulerDeltakerliste();
    }
}

function updateDeltakerNameById(id, navn) {
    if (deltakere.map(x => x.id).includes(id)) {
        let deltaker = deltakere.find(x => x.id === id);
        deltaker.navn = navn;
        refreshButtonRender();
    }
}

function updateDeltakerGender(id, gender) {
    if (deltakere.map(x => x.id).includes(id)) {
        let deltaker = deltakere.find(x => x.id === id);
        deltaker.gender = gender;
        refreshButtonRender();
    }
}

function save() {
    const lagretDeltakere = deltakere.map(x => {
        return {
            ...x,
            antallGangerTalt: 0,
            taleTid: 0,
        }
    });

    localStorage.setItem("deltakere", JSON.stringify(lagretDeltakere));
    localStorage.setItem("moeteInnstillinger", JSON.stringify(hentInnstillinger()));
    window.location.href = "./moete.html";
}

// -------------------------- read/write contestants to clipboard ------------------------------

async function exportToClipboard() {
    const deltakerString = JSON.stringify(deltakere);
    await copyTextToClipboard(deltakerString);
}

async function importFromClipboard() {
    const textFromClipboard = await readTextFromClipboard();
    let deltakereFromClipboard = undefined;
    try {
        deltakereFromClipboard = JSON.parse(textFromClipboard);
    }
    catch (_) {
        return false;
    }

    // type checking sort of
    if (!Array.isArray(deltakereFromClipboard)) {
        return false;
    }
    if (deltakereFromClipboard.length === 0) {
        return false;
    }
    if (deltakereFromClipboard.filter(x => x['navn'] == null || x['gender'] == null || x['id'] == null).length > 0) {
        return false;
    }

    deltakere = deltakereFromClipboard;
    rekalkulerDeltakerliste();
    idCounter = deltakere.length+1;
    return true;
}

const readClipboardButton = document.getElementById("les-clipboard");
const writeClipboardButton = document.getElementById("skriv-clipboard");

readClipboardButton.addEventListener("click", async () => {
    const success = await importFromClipboard();
    if (!success) {
        readClipboardButton.textContent = "Mislykket!";
        readClipboardButton.disabled = true;
        setTimeout(() => {
            readClipboardButton.textContent = "(Forsøk) les deltakere fra utklippsverktøy";
            readClipboardButton.disabled = false;
        }, 2000);
    }
    else {
        readClipboardButton.textContent = "Vellykket!";
        readClipboardButton.disabled = true;
        setTimeout(() => {
            readClipboardButton.textContent = "(Forsøk) les deltakere fra utklippsverktøy";
            readClipboardButton.disabled = false;
        }, 2000);
    }
});

writeClipboardButton.addEventListener("click", () => {
    exportToClipboard();
    writeClipboardButton.textContent = "Suksess!";
    writeClipboardButton.disabled = true;
    setTimeout(() => {
        writeClipboardButton.textContent = "Skriv deltakere til utklippsverktøy";
        writeClipboardButton.disabled = false;
    },
    2000);
})