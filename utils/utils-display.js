export function formaterTid(sekunder) {
    const neg = sekunder < 0;
    const abs = Math.abs(sekunder);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return neg ? '-' + str : str;
}