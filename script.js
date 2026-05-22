document.addEventListener("DOMContentLoaded", () => {
    const bouton = document.getElementById("btnExtraire");
    if (bouton) {
        bouton.addEventListener("click", extraireLabos);
    }
});

function extraireLabos() {
    const texte = document.getElementById("inputRapport").value;
    const resultat = processRapport(texte);
    document.getElementById("resultats").textContent = resultat;
    copierPressePapiers(resultat);
}

function normaliserValeur(val) {
    if (val === null || val === undefined) return null;
    const nettoyee = String(val).replace(/[\s\u00a0]/g, "").replace(",", ".").trim();
    if (!nettoyee) return null;
    return nettoyee.replace(/^0+(?=\d)/, "");
}

function nombreRegex() {
    return "([<>]?(?:=)?\\d+(?:[.,]\\d+)?)(?!\\s*\\/)";
}

function extraire(texte, regex) {
    const match = texte.match(regex);
    return match && match[1] ? normaliserValeur(match[1]) : null;
}

function extractValue(text, pattern, options = {}) {
    const { factor = 1, percentage = false, percentIfFraction = false } = options;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    const match = text.match(regex);

    if (!match || !match[1]) return null;

    let rawValue = match[1].replace(",", ".").replace(/[^\d.<>]/g, "").trim();
    const hasComparator = /^[<>]=?/.test(rawValue);
    rawValue = rawValue.replace(/^[<>]=?/, "");

    let value = parseFloat(rawValue);
    if (Number.isNaN(value)) return null;

    value *= factor;

    if (percentIfFraction) {
        let isFraction = false;
        if (value > 0 && value <= 1) {
            value *= 100;
            isFraction = true;
        }
        const fixedValue = isFraction || value % 1 !== 0 ? value.toFixed(1) : value.toFixed(0);
        return `${fixedValue}%`;
    }

    if (percentage) {
        return `${match[1].replace(",", ".")}%`;
    }

    const decimalPlaces = rawValue.includes(".") ? rawValue.split(".")[1].length : 0;
    const output = decimalPlaces > 0 || value % 1 !== 0
        ? value.toFixed(decimalPlaces > 2 ? 2 : decimalPlaces)
        : value.toString();

    return hasComparator ? `${match[1].trim().match(/^[<>]=?/)?.[0] || ""}${output}` : output;
}

function extractValueNearAnchor(text, anchorPattern, linesToSearch = 5) {
    const lines = text.split(/\r?\n/);
    const regex = anchorPattern instanceof RegExp ? anchorPattern : new RegExp(anchorPattern, "i");

    for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue;

        const sameLine = lines[i].match(/([<>]?(?:=)?\d+(?:[.,]\d+)?)/);
        if (sameLine && sameLine[1]) {
            return normaliserValeur(sameLine[1]);
        }

        const start = Math.max(0, i - linesToSearch);
        const end = Math.min(lines.length - 1, i + linesToSearch);

        for (let k = start; k <= end; k++) {
            if (k === i) continue;
            const line = lines[k].trim();
            if (/Idéal|Optimal|Contrôle|Chef|Page|Rapport|Légende|unité|Référence|Limite|^\s*$/i.test(line)) {
                continue;
            }
            const match = line.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)(?:\s*[LHB])?(?:\s+\S+.*)?$/i);
            if (match && match[1]) {
                return normaliserValeur(match[1]);
            }
        }
    }

    return null;
}

function fb(paramRx, uniteRx) {
    return new RegExp(
        paramRx + "\\s+" + nombreRegex() + "\\s+(?:<=|>=)?\\s*[\\d,. -]+\\s*" + uniteRx,
        "i"
    );
}

function extraireParUnite(texte, paramRegex, uniteRegex, fallbackRegex, formatB_regex) {
    const numSimple = nombreRegex();
    const numAvecFlag = "(?:[HLBA]\\s*)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)";

    const regexA = new RegExp(
        paramRegex + "\\s+" + uniteRegex + "[^\\n]*?AUTO[VHBCAX\\/]*\\s*" + numSimple,
        "i"
    );
    const mA = texte.match(regexA);
    if (mA) return normaliserValeur(mA[1]);

    if (formatB_regex) {
        const mB = texte.match(formatB_regex);
        if (mB) return normaliserValeur(mB[1]);
    }

    const regexC = new RegExp(
        paramRegex + "\\s+" + uniteRegex +
        "\\s+[A-Z]{2,}\\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\\s*" + numSimple,
        "i"
    );
    const mC = texte.match(regexC);
    if (mC) return normaliserValeur(mC[1]);

    const regexD = new RegExp(
        paramRegex + "\\s+" + numAvecFlag + "\\s+" + uniteRegex,
        "i"
    );
    const mD = texte.match(regexD);
    if (mD) return normaliserValeur(mD[1]);

    const regexE = new RegExp(
        paramRegex + "[^\\n]{0,40}?\\s+" + numAvecFlag + "\\s+" + uniteRegex,
        "i"
    );
    const mE = texte.match(regexE);
    if (mE) return normaliserValeur(mE[1]);

    if (fallbackRegex) return extraire(texte, fallbackRegex);
    return null;
}

function extraireFormatCompactRef(texte, paramRegex, uniteRegex) {
    const rx = new RegExp(
        "(?:^|\\n)\\s*(?:[<>]=?\\s*)?\\d+[.,]?\\d*(?:\\s*-\\s*\\d+[.,]?\\d*)?\\s*(?:" +
        paramRegex +
        ")\\s+(?:" +
        uniteRegex +
        ")\\s+AUTO[VHBCAX\\/]*\\s*" +
        nombreRegex(),
        "i"
    );
    const m = texte.match(rx);
    return m ? normaliserValeur(m[1]) : null;
}

function extraireDFGe(texte) {
    let m = texte.match(/DFG\s*Estim[ée][^\n]*?mL\/min\s+AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/DFG\s*Estim[ée][^\n]*?\s+([\d,.]+)\s+mL\/min/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/DFGe\s*\(CKD-EPI\)[^\d]*([0-9,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    return extractValueNearAnchor(texte, /DFGe\s*\(CKD-EPI\)|DFG\s*Estim[ée]/i, 6);
}

function extraireHb(texte) {
    const patterns = [
        /\bHb\b\s*(?:[HLB]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i,
        /H[ée]moglobine\s*(?:[HLB]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i,
        /\bHb\b[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i,
        /H[ée]moglobine[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    const lignes = texte.split(/\r?\n/);
    for (const ligne of lignes) {
        const propre = ligne.trim();
        if (!propre) continue;

        let match = propre.match(/^(?:Hb|H[ée]moglobine)\s+(?:[HLBA]\s+)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);

        match = propre.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b[\s\S]*?(?:Hb|H[ée]moglobine)\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return null;
}

function extraireVGM(texte) {
    const patterns = [
        /\bVGM\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*fL\b/i,
        /Volume glob\.\s*moyen\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*fL\b/i,
        /\bVGM\b[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extractValueNearAnchor(texte, /\bVGM\b|Volume glob\.\s*moyen/i, 6);
}

function extraireCreatinine(texte) {
    const patterns = [
        /Cr[ée]atinine\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*[uµμ](?:mol|M)\/L\b/i,
        /CREATININE\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*[uµμ](?:mol|M)\/L\b/i,
        /Cr[ée]atinine[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extractValueNearAnchor(texte, /Cr[ée]atinine|CREATININE/i, 6);
}

function extraireHemolysePotassium(texte) {
    const lignePotassium = texte.match(/Potassium[^\n]*/i);
    const zoneRecherche = lignePotassium
        ? texte.substring(
            Math.max(0, (lignePotassium.index || 0) - 250),
            Math.min(texte.length, (lignePotassium.index || 0) + lignePotassium[0].length + 250)
        )
        : texte;

    const match = zoneRecherche.match(/h[ée]molyse\s*(\d)\+/i);
    if (!match || !match[1]) return "";

    const niveau = parseInt(match[1], 10);
    if (Number.isNaN(niveau) || niveau <= 0) return "";
    return "+".repeat(Math.min(niveau, 3));
}

function extraireCT(texte) {
    let m = texte.match(/Cholest[ée]rol\s+total\s*[HB]?\s*([\d,.]+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol(?!\s+(?:HDL|LDL|non|total))\s+mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol\s*total[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol(?!\s*-\s*(?:HDL|LDL)|\s+(?:HDL|LDL|non-HDL|non HDL|total\/C-HDL))\s+([\d,.]+)\s+[\d,. -]*\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireApoB(texte) {
    let m = texte.match(/(?:Apolipoprot[ée]ine\s*B-?100|Apo\s*B)[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Apolipoprot[ée]ines?\s*B|Apolipoprot[ée]ine\s*B)(?:\s*-\s*100)?\s*(?:[HBA]\s*)?([\d,.]+)\s+(?:[\d,. -]+\s+)?g\/L\b/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Apolipoprot[ée]ine\s*B-?100|Apo\s*B)\s*(?:[HB]\s*)?([\d,.]+)(?:\s*g\/L)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/APOLIPOPROTEINES?\s*B\s+(?:[HBA]\s*)?(\d+[.,]\d+|\d+)\b/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireA1c(texte) {
    let m = texte.match(/HBA1c\s*[HB]?\s*([\d,.]+)/i);
    if (!m) m = texte.match(/HbA1c\s+%[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/HbA1c\s+[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/HbA1c\s+([\d,.]+)\s+[\d,. -]+\s*%/i);
    if (!m) m = texte.match(/HBA1c[^\n]*?([\d,]+)\s*%/i);

    let valeur = m && m[1] ? normaliserValeur(m[1]) : null;
    if (!valeur) {
        valeur = extractValueNearAnchor(texte, /HbA1C\s+\(glyquée\)|h[ée]moglobine glyqu[ée]e|HbA1c/i, 8);
    }
    if (!valeur) return null;

    return extractValue(valeur, /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/, { percentIfFraction: true });
}

function extractRacValue(text) {
    let sameLine = text.match(/(\d+[.,]\d+)\s+[HLB]?\s*[HLB]?\s*<?\d+[.,]?\d*\s+mg\/mmol\s+cr[ée]atinine\s+Microalbumine\s*\(\s*ratio\s*\)/i);
    if (sameLine && sameLine[1]) return normaliserValeur(sameLine[1]);

    sameLine = text.match(/Microalbumine\s*\(\s*ratio\s*\)[\s\S]{0,150}?(\d+[.,]\d+)/i);
    if (sameLine && sameLine[1]) return normaliserValeur(sameLine[1]);

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!/Microalbumine\s*\(\s*ratio\s*\)/i.test(lines[i])) continue;

        const lineMatch = lines[i].match(/(\d+[.,]\d+)/);
        if (lineMatch) return normaliserValeur(lineMatch[1]);

        for (let j = 1; j <= 10; j++) {
            if (i - j < 0) continue;
            const line = lines[i - j].trim();
            if (/[<>]/.test(line) || /mg\/mmol|cr[ée]atinine|Idéal|Optimal|Contrôle|Référence|Limite/i.test(line)) {
                continue;
            }
            const match = line.match(/^([0-9]+(?:[.,][0-9]+)?)(?:\s*[LHB]\s*)?$/i);
            if (match) return normaliserValeur(match[1]);
        }
        break;
    }

    return null;
}

function extraireRAC(texte) {
    let m = texte.match(/Microalbumine\/Cr[ée]at\s*;\s*Ur[\s\S]{0,120}?creat[\s\S]{0,40}?\b([\d,.]+)\b\s*(?:AH|AB|AN|CB|CH|XB|XH)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Microalbumine\s*\/\s*Cr[ée]at[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Microalbumine\s*\/\s*Cr[ée]at[\s\S]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Microalbumine\s*\(miction\).*?([\d,.]+)\s*mg\/mmolCRE/is);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Microalbumine\s*\/?\s*Cr[ée]at\s*;?\s*Ur[\s\S]{0,120}?([\d,.]+)\s*(?:AH|AB|AN|CB|CH|XB|XH)?\s*(?:mg\/mmol|AUTOV|20\d{2}\/\d{2}\/\d{2})/i);
    if (m) return normaliserValeur(m[1]);

    return extractRacValue(texte);
}

function extraireTSAT(texte) {
    let m = texte.match(/Saturation\s+en\s+fer[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/Saturation\s+en\s+fer\s+([\d,.]+)\s*%/i);
    if (!m) m = texte.match(/Indice de saturation[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/Indice de saturation[^\d-]*([\d,.]+)\s*%?/i);

    if (m) {
        return extractValue(m[1], /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/, { percentIfFraction: true });
    }

    return null;
}

function extraireLiStrict(texte) {
    let m = texte.match(/Lithium\s*s[ée]rique[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Lithium\s*s[ée]rique[^\d-]*([\d,.]+)(?:\s*mmol\/L)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/LITHIUM\s+(\d+[.,]\d+|\d+)\s/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireMg(texte) {
    let m = texte.match(/Magn[ée]sium\s+mmol\/L\s+[A-Z]{3,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium\s+mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium\s+([\d,.]+)\s+[\d,. -]+\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium[^\d-]*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/MAGNESIUM\s+(\d+[.,]\d+|\d+)\s/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireAlbumine(texte) {
    const patterns = [
        /ALBUMINE\s+(\d+[.,]?\d*)\s*g\/L/i,
        /Albumine[^\\d-]*(\d+[.,]?\d*)\s*g\/L/i,
        /ALBUMINE\s+(\d+[.,]?\d*)\s/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extraireParUnite(texte, "Albumine", "g\\/L", /Albumine[^\d-]*([\d,.]+)\s*g\/L/i, fb("Albumine", "g\\/L"));
}

function extraireAcideUrique(texte) {
    const patterns = [
        /ACIDE URIQUE\s+(\d+[.,]?\d*)\s*[BH]?\s*\d+-\d+\s*umol\/L/i,
        /ACIDE URIQUE\s+(\d+[.,]?\d*)\s*[BH]?/i,
        /A\.\s*URIQUE\s+(\d+[.,]?\d*)\s*[BH]?/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extraireParUnite(
        texte,
        "(?:Acide urique|Urate)",
        "(?:umol|mmol)\\/L",
        /(?:Acide urique|Urate)[^\d-]*([\d,.]+)/i,
        fb("(?:Acide urique|Urate)", "(?:umol|mmol)\\/L")
    );
}

function extraireVitB12(texte) {
    const patterns = [
        /VITAMINE B-12\s*(\d+[.,]?\d*)\s*pmol\/L/i,
        /(\d+[.,]?\d*)\s*pmol\/L[\s\S]{0,500}?VITAMINE B-12/i,
        /VITAMINE B-12[\s\S]{0,500}(\d+[.,]?\d*)\s*pmol\/L/i,
        /Vitamine B12\s+pmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i,
        /Vitamine B12\s+pmol\/L[^\n]*?[A-Z]{3,}[A-Z0-9]*?(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]{2,5}(?:[.,]\d+)?)/i,
        /Vitamine B12\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*pmol\/L/i,
        /Vitamine B12[^\d-]*([\d,.]+)\s*pmol\/L/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extractValueNearAnchor(texte, /VITAMINE B-?12|Vitamine B12/i, 10);
}

function extraireVitD(texte) {
    let match = texte.match(/(\d+[.,]?\d*)\s*nmol\/L[\s\S]{0,250}?25\s*OH[- ]?VITAMINE\s*D/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*OH[- ]?VITAMINE\s*D\s+(\d+[.,]?\d*)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*OH[- ]?VITAMINE\s*D\s+(\d+[.,]?\d*)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*[- ]?OH\s*[- ]?VITAMINED?\s+(\d+[.,]?\d*)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine\s*D\s*25\s*(?:\(\s*OH\s*\)|OH)[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine\s*D\s*25\s*(?:\(\s*OH\s*\)|OH)\s+([\d,.]+)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine D 25\(OH\)[^\d-]*([\d,.]+)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    return extractValueNearAnchor(texte, /25\s*OH[- ]?VITAMINE\s*D|Vitamine\s*D\s*25/i, 10);
}

function extraireRNI(texte) {
    let m = texte.match(/\bRNI\b[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bRNI\b[^\n]*?[A-Z]{3,}[A-Z0-9]*?(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bRNI\b\s+([\d,.]+)\b/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCaIonise(texte) {
    let m = texte.match(/Calcium\s+ionis[ée]\s+(\d+[.,]\d+|\d+)\s*(?:mmol\/L|L\b)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/CALCIUM IONIS[ÉE]\s+MESUR[ÉE][\s\S]{0,120}?Calcium ionis[ée]\s+(\d+[.,]\d+|\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium\s+ion(?:is[ée])?\s+pH\s*7[,\.]4\s+([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium\s+ion(?:is[ée])?(?![^\n]*pH)[^\n]*?([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ca\s*ionis[ée].*?([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCaCorrige(texte) {
    let m = texte.match(/Ca\+\+\s*corrig[ée]\s*pH\s*7[,.]4\s+(\d+[.,]\d+|\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ca\+\+\s*corrig[ée]\s*pH\s*7[,.]4[^\d]*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireUree(texte) {
    let m = texte.match(/Ur[ée]e\s+(?:[HLBA]\s*)?([\d,.]+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ur[ée]e\s+([\d,.]+)\s+[\d,. -]+\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ur[ée]e[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCK(texte) {
    let m = texte.match(/Cr[ée]atine\s+kinase[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cr[ée]atine\s+kinase\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*U\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCK\b[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCK\b\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*U\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireGB(texte) {
    let m = texte.match(/\bGB\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*10\*9\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Globules blancs[^\n]*?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*10\*9\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireLymphocytesAbs(texte) {
    const lignes = texte.split(/\r?\n/);

    for (const ligne of lignes) {
        if (!/Lymphocytes/i.test(ligne)) continue;

        const match = ligne.match(/Lymphocytes\s+(?:[HLBA]\s*)?[\d.,]+\s*\([^)]+\)\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    let m = texte.match(/Lymphocytes[^\n]*?\b(?:absolu|absolue|abs)\b[^\d]*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCRP(texte) {
    let m = texte.match(/Prot[ée]ine C r[ée]active\s*\(CRP\)\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mg\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCRP\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mg\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireGlucose(texte) {
    let m = texte.match(/Glucose(?:\s+non\s+[àa]\s+jeun)?\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bGLUCOSE\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireTroponine(texte) {
    let m = texte.match(/Troponine\s+I\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Troponine[^\n]*?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireBNP(texte) {
    let m = texte.match(/(?:^|[^\w])BNP\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:^|[^\w])BNP\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)(?!\s*roBNP)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireComplement(texte, type) {
    const regex = new RegExp(`Compl[ée]ment\\s+${type}\\s*(?:[HLBA]\\s*)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)\\s*g\\/L`, "i");
    const match = texte.match(regex);
    return match && match[1] ? normaliserValeur(match[1]) : null;
}

function extraireAntiADN(texte) {
    let m = texte.match(/Anti-ADN\s*\(anti-DS-DNA\)\s*:\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*UI\/mL/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/anti-DS-DNA[^\d]*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*UI\/mL/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCrithidia(texte) {
    const m = texte.match(/Crithidia\s+luciliae\s*:\s*(positif|n[ée]gatif|[ée]quivoque)/i);
    return m && m[1] ? m[1].toLowerCase() : null;
}

function extraireAntiENA(texte) {
    const m = texte.match(/Ac\s+anti-ENA\s*\(d[ée]pistage\)\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*Ratio/i);
    return m && m[1] ? normaliserValeur(m[1]) : null;
}

function normaliserAntibiotique(nom) {
    const map = {
        "Nitrofurantoine": "Nitrofurantoïne",
        "Fosfomycine": "Fosfomycine",
        "Ampicilline": "Ampicilline",
        "Amoxicilline+clavulanate": "Amoxicilline-clavulanate",
        "Piperacilline+tazobactam": "Pipéracilline-tazobactam",
        "Cefalexine": "Céfalexine",
        "Cefuroxime": "Céfuroxime",
        "Ceftriaxone": "Ceftriaxone",
        "Ceftazidime": "Ceftazidime",
        "Cefixime": "Cefixime",
        "Ertapenem": "Ertapénem",
        "Imipenem": "Imipénem",
        "Meropenem": "Méropénem",
        "Trimethoprime+sulfamethoxazole": "TMP-SMX (Trimethoprime+sulfamethoxazole)",
        "Gentamicine": "Gentamicine",
        "Tobramycine": "Tobramycine",
        "Ciprofloxacine": "Ciprofloxacine"
    };

    return map[nom] || nom;
}

function extraireDateCulture(texte) {
    const m = texte.match(/Urine\s*;\s*Culture\s+FINAL\s+(\d{4}\/\d{2}\/\d{2})/i);
    return m ? m[1] : null;
}

function extraireCultureUrinaireComplete(texte) {
    if (!/MICROBIOLOGIE/i.test(texte) || !/Urine\s*;\s*Culture/i.test(texte)) return null;

    const dateCulture = extraireDateCulture(texte) || extraireDate(texte);

    if (/Contamination probable/i.test(texte)) {
        return { type: "contamination", texte: "Culture urinaire: Contamination" };
    }

    const zoneCultureMatch = texte.match(
        /CULTURE MICROBIENNE[\s\S]*?Urine\s*;\s*Culture\s+FINAL[\s\S]*?(?=Organisme\s+ORG#|Révisé par:|ADRESSE DE LABORATOIRE|$)/i
    );
    const zoneCulture = zoneCultureMatch ? zoneCultureMatch[0] : texte;

    const orgMatch = zoneCulture.match(/^\((\d+)\)\s+(?:>=?\s*\S+\s+ufc\/L\s+)?(.+)$/im);
    const organisme = orgMatch ? orgMatch[2].trim() : null;
    const orgNo = orgMatch ? orgMatch[1] : null;
    if (!organisme) return null;

    let section = texte;
    if (orgNo) {
        const rx = new RegExp(
            "Organisme\\s+ORG#\\s*" + orgNo + "[\\s\\S]*?(?=L[ée]gende des r[ée]sultats:|-----COMMENTAIRES D'ANTIBIOTIQUE-----|R[ée]vis[ée] par:|ADRESSE DE LABORATOIRE|$)",
            "i"
        );
        const m = texte.match(rx);
        if (m) section = m[0];
    }

    const sensibles = [];
    const resistants = [];

    for (const ligneBrute of section.split(/\r?\n/)) {
        const ligne = ligneBrute.trim().replace(/^\*+\s*/, "");
        const m = ligne.match(/^(.+?)\s+(S|R|I|SDD)(?:\s+D\d+)?$/i);
        if (!m) continue;

        const antibiotique = normaliserAntibiotique(m[1].trim());
        const statut = m[2].toUpperCase();
        if (statut === "S") sensibles.push(antibiotique);
        if (statut === "R") resistants.push(antibiotique);
    }

    let resume = `${dateCulture}: ${organisme}`;
    if (sensibles.length > 0) resume += `\nSensible à : ${sensibles.join(", ")}`;
    if (resistants.length > 0) resume += `\nRésistance à : ${resistants.join(", ")}`;

    return { type: "culture", date: dateCulture, organisme, sensibles, resistants, texte: resume };
}

function extraireDate(texte) {
    let m = texte.match(/Prélevée (?:le|à la date du)?\s*(\d{4})[-/](\d{2})[-/](\d{2})/i);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/PR[ÉE]LEV[ÉE][^\n]*?(\d{4}[-\/]\d{2}[-\/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    m = texte.match(/PR[ÉE]LEV[ÉE][^\n]*?(\d{2})\/(\d{2})\/(\d{2})/i);
    if (m) return `20${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/Pr[ée]lev[ée]e?\s+le\s+(\d{4}[-\/]\d{2}[-\/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    m = texte.match(/Pr[ée]lev[ée]e?\s+le\s+(\d{2})\/(\d{2})\/(\d{2})/i);
    if (m) return `20${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/Prélevé le\s*(\d{4}[-/]\d{2}[-/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    const matches = [...texte.matchAll(/(\d{4})[/-](\d{2})[/-](\d{2})/g)];
    let meilleure = null;
    let max = "00000000";
    for (const match of matches) {
        const contexte = texte.substring(Math.max(0, match.index - 50), match.index + 50);
        if (/Rapport imprimable généré|Imprimé le|Date d'impression/i.test(contexte)) continue;
        const cle = `${match[1]}${match[2]}${match[3]}`;
        if (cle > max) {
            max = cle;
            meilleure = match;
        }
    }
    if (meilleure) return `${meilleure[1]}/${meilleure[2]}/${meilleure[3]}`;

    m = texte.match(/\b(\d{2})[/-](\d{2})[/-](\d{2})\b/);
    if (m) return `20${m[3]}/${m[2]}/${m[1]}`;

    return "????/??/??";
}

function extraireHeurePrelevement(texte) {
    let m = texte.match(/(?:Prélevé\s*le|Prélevée\s*le|Enregistré\s*le)[\s\S]*?\s*à\s*(\d{2})h(\d{2})m/i);
    if (m) return `${m[1]}h${m[2]}`;

    m = texte.match(/(?:Prélevé\s*le|Prélevée\s*le|Enregistré\s*le)[\s\S]*?\s*(\d{2}):(\d{2})(?::\d{2})?/i);
    if (m) return `${m[1]}h${m[2]}`;

    const shortText = texte.substring(0, 500);
    m = shortText.match(/(?:Prélevée\s+(?:le\s+\d{4}[-/]\d{2}[-/]\d{2}\s+)?(?:à\s+)?|Heure:\s*)(\d{1,2})[h:](\d{2})/i);
    if (m) return `${m[1].padStart(2, "0")}h${m[2].padStart(2, "0")}`;

    m = texte.match(/(\d{1,2})[h:](\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}h${m[2].padStart(2, "0")}`;

    return null;
}

function processRapport(texte) {
    texte = (texte || "").replace(/\b(AB|AH|AN|CB|CH|XB|XH)\b/g, "");

    if (!texte.trim()) return "Veuillez coller un rapport de laboratoire dans la zone de texte.";

    const num = "(\\d{1,3}(?:[\\s\u00a0]\\d{3})*(?:[.,]\\d+)?|\\d+[.,]\\d+|\\d+)";
    const motifHB = "(?:\\s*[HB])?\\s*";
    const motifParam = param => new RegExp(param + motifHB + num, "i");

    const albumine = extraireAlbumine(texte);
    const caCorrigeMesure = extraireCaCorrige(texte);
    const calciumTotal = extraireParUnite(
        texte,
        "Calcium(?:\\s+total)?",
        "mmol\\/L",
        motifParam("Calcium(?:\\s+total)?"),
        fb("Calcium(?:\\s+total)?(?!\\s+ion)", "mmol\\/L")
    ) || extractValue(texte, /CALCIUM TOTAL\s+(\d+[.,]\d+|\d+)/i);

    const valeurs = {
        GB: extraireGB(texte),
        Hb: extraireHb(texte) ||
            extraireParUnite(texte, "Hb|Hémoglobine", "g\\/L", /(?:Hb|H[ée]moglobine)\s+(\d+)\s/i, fb("Hb|Hémoglobine", "g\\/L")) ||
            extraireFormatCompactRef(texte, "Hb|Hémoglobine", "g\\/L") ||
            extractValue(texte, /(?:Hb|H[ée]moglobine)\s+(\d+)\s/i),
        VGM: extraireVGM(texte) ||
            extraireParUnite(texte, "VGM|Volume glob\\. moyen", "fL", /Volume glob\. moyen\s+(\d+[.,]\d+|\d+)\s/i, fb("VGM|Volume glob\\. moyen", "fL")) ||
            extraireFormatCompactRef(texte, "VGM|Volume glob\\. moyen", "fL") ||
            extractValue(texte, /\bVGM\b\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*fL/i),
        DVE: extraireParUnite(texte, "DVE|Indice dist\\. érythrocytaire", "%", /Indice dist\. érythrocytaire\s+(\d+[.,]\d+|\d+)\s/i, fb("DVE|Indice dist\\. érythrocytaire", "%")) ||
            extraireFormatCompactRef(texte, "DVE|Indice dist\\. érythrocytaire", "%") ||
            extractValue(texte, /\bDVE\b\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*%/i),
        RNI: extraireRNI(texte),
        "Créat": extraireCreatinine(texte) ||
            extraireParUnite(texte, "Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L", /CREATININE\s+(\d+)\s/i, fb("Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L")) ||
            extraireFormatCompactRef(texte, "Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L") ||
            extractValue(texte, /Cr[ée]atinine\s+(?:[HLBA]\s*)?(\d+)\s*[uµμ](?:mol|M)\/L/i) ||
            extractValue(texte, /CREATININE\s+(\d+)\s/i),
        DFGe: extraireDFGe(texte),
        "Urée": extraireUree(texte),
        Na: extraireParUnite(texte, "Sodium|SODIUM", "mmol\\/L", /SODIUM\s+(\d+)\s/i, fb("Sodium|SODIUM", "mmol\\/L")) ||
            extraireFormatCompactRef(texte, "Sodium|SODIUM", "mmol\\/L") ||
            extractValue(texte, /SODIUM\s+(\d+)\s/i),
        K: ((extraireParUnite(texte, "Potassium|POTASSIUM", "mmol\\/L", /POTASSIUM\s+(\d+[.,]\d+|\d+)\s/i, fb("Potassium|POTASSIUM", "mmol\\/L")) ||
            extraireFormatCompactRef(texte, "Potassium|POTASSIUM", "mmol\\/L") ||
            extractValue(texte, /POTASSIUM\s+(\d+[.,]\d+|\d+)\s/i)) || null),
        Cl: extraireParUnite(texte, "Chlor(?:ure|e)|CHLORURE", "mmol\\/L", /CHLORURE\s+(\d+)\s/i, fb("Chlor(?:ure|e)|CHLORURE", "mmol\\/L")) ||
            extraireFormatCompactRef(texte, "Chlor(?:ure|e)|CHLORURE", "mmol\\/L") ||
            extractValue(texte, /Chlor(?:ure|e)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /CHLORURE\s+(\d+)\s/i),
        Pi: extraireParUnite(texte, "Phosph(?:ore|ate)|PHOSPHORE", "mmol\\/L", /PHOSPHORE\s+(\d+[.,]\d+|\d+)\s/i, fb("Phosph(?:ore|ate)|PHOSPHORE", "mmol\\/L")) || extractValue(texte, /PHOSPHORE\s+(\d+[.,]\d+|\d+)\s/i),
        Mg: extraireMg(texte),
        Alb: albumine,
        "Pré-alb": extraireParUnite(texte, "Pr[ée]-albumine", "mg\\/L", /Pr[ée]-albumine[^\d-]*([\d,.]+)\s*mg\/L/i, fb("Pr[ée]-albumine", "mg\\/L")),
        Ca: calciumTotal,
        "Ca (corr.)": caCorrigeMesure,
        "Ca ionisé": extraireCaIonise(texte),
        "Ac. urique": extraireAcideUrique(texte),
        BiliT: extractValue(texte, /BILIRUBINE TOTALE\s+(\d+[.,]\d+|\d+)\s/i),
        ALT: extraireParUnite(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L", /ALT\s+\(GPT\)\s+(\d+)\s/i, fb("ALT|ALT\\s*\\(GPT\\)", "U\\/L")) ||
            extraireFormatCompactRef(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L") ||
            extractValue(texte, /\bALT\b\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i) ||
            extractValue(texte, /ALT\s+\(GPT\)\s+(\d+)\s/i),
        AST: extraireParUnite(texte, "AST|AST\\s*\\(GOT\\)", "U\\/L", /AST\s+\(GOT\)\s+(\d+)\s/i, fb("AST|AST\\s*\\(GOT\\)", "U\\/L")),
        CK: extraireCK(texte),
        GGT: extraireParUnite(texte, "(?:Glutamyltransf[ée]rase\\s*\\(GGT\\)|GGT)", "U\\/L", /GGT[^\d-]*([\d,.]+)/i, fb("GGT", "U\\/L")),
        LDH: extraireParUnite(texte, "Lactate d[ée]shydrog[ée]nase(?:\\s*\\(LDH\\))?|LD\\s*\\(LDH\\)", "U\\/L", /LD\s+\(LDH\)\s+(\d+)\s/i, fb("Lactate d[ée]shydrog[ée]nase|LD\\s*\\(LDH\\)", "U\\/L")),
        "Phosp. Alc": extraireParUnite(texte, "Phosphatase alcaline(?:\\s*\\([^)]*\\))?|PHOSPHATASE ALCALINE", "U\\/L", /PHOSPHATASE ALCALINE\s+(\d+)\s/i, fb("Phosphatase alcaline|PHOSPHATASE ALCALINE", "U\\/L")) ||
            extractValue(texte, /Phosphatase alcaline\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i),
        CRP: extraireCRP(texte),
        CT: extraireCT(texte) || extractValue(texte, /CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i),
        TG: extraireParUnite(texte, "Triglyc[ée]rides|TRIGLYCERIDES", "mmol\\/L", /TRIGLYCERIDES\s+(\d+[.,]\d+|\d+)\s/i, fb("Triglyc[ée]rides|TRIGLYCERIDES", "mmol\\/L")) ||
            extractValue(texte, /Triglyc[ée]rides\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /TRIGLYCERIDES\s+(\d+[.,]\d+|\d+)\s/i),
        HDL: extraireParUnite(texte, "Cholest[ée]rol(?:-|\\s+)HDL(?:\\s*\\(direct\\))?|HDL CHOLESTEROL", "mmol\\/L", /HDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i) ||
            extractValue(texte, /Cholest[ée]rol-HDL\s*\(direct\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /Cholest[ée]rol(?:-|\\s+)HDL(?:\\s*\\(direct\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /HDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i),
        LDL: extraireParUnite(texte, "Cholest[ée]rol(?:-|\\s+)LDL(?:\\s*\\(calc\\.\\))?|LDL CHOLESTEROL", "mmol\\/L", /LDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i) ||
            extractValue(texte, /Cholest[ée]rol-LDL\s*\(calc\.\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /Cholest[ée]rol(?:-|\\s+)LDL(?:\\s*\\(calc\\.\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /LDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i),
        "non-HDL": extraireParUnite(texte, "Cholest[ée]rol\\s+non(?:-|\\s)HDL(?:\\s*\\(calc\\.\\))?|CHOLESTEROL non-HDL", "mmol\\/L", /CHOLESTEROL non-HDL\s+(\d+[.,]\d+|\d+)\s/i) ||
            extractValue(texte, /Cholest[ée]rol\s+non-HDL\s*\(calc\.\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /Cholest[ée]rol\\s+non(?:-|\\s)HDL(?:\\s*\\(calc\\.\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
            extractValue(texte, /CHOLESTEROL non-HDL\s+(\d+[.,]\d+|\d+)\s/i),
        ApoB: extraireApoB(texte),
        TSH: extraireParUnite(texte, "(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L", /TSH\s+(\d+[.,]\d+|\d+)\s/i, fb("(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L")) ||
            extraireFormatCompactRef(texte, "(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L"),
        T4L: extraireParUnite(texte, "(?:Thyroxine\\s*libre\\s*\\(T4\\)|T4\\s*libre|T4 LIBRE)", "pmol\\/L", /T4 LIBRE\s+(\d+[.,]\d+|\d+)\s/i),
        "Vit. B12": extraireVitB12(texte),
        "Vit. D": extraireVitD(texte),
        HbA1c: extraireA1c(texte),
        RAC: extraireRAC(texte),
        TSAT: extraireTSAT(texte),
        Ferritine: extractValue(texte, /FERRITINE\s+(\d+)\s/i) || extraire(texte, /Ferritine[^\d-]*([\d,.]+)/i),
        BNP: extraireBNP(texte),
        NTproBNP: extraireParUnite(texte, "NTproBNP", "ng\\/L", /NTproBNP[^\d-]*([\d,.]+)\s*ng\/L/i),
        PSA: extractValue(texte, /PSA\s+(\d+[.,]\d+|\d+)\s/i),
        Li: extraireLiStrict(texte)
    };

    const suffixeHemolysePotassium = extraireHemolysePotassium(texte);
    if (valeurs.K && suffixeHemolysePotassium && !String(valeurs.K).endsWith(suffixeHemolysePotassium)) {
        valeurs.K = `${valeurs.K}${suffixeHemolysePotassium}`;
    }

    if (valeurs.Ca && valeurs.Alb) {
        const ca = parseFloat(valeurs.Ca);
        const alb = parseFloat(valeurs.Alb);
        valeurs["Ca (corr.)"] = (ca + 0.025 * (40 - alb)).toFixed(2);
    }

    const cultureComplete = extraireCultureUrinaireComplete(texte);
    const date = extraireDate(texte);
    const heure = extraireHeurePrelevement(texte);

    return formaterResultat(date, valeurs, heure, cultureComplete);
}

function formaterDVE(val) {
    if (!val) return null;
    return val.includes("%") ? val : `${val}%`;
}

function formaterResultat(date, valeurs, heure, cultureComplete) {
    const ordre = [
        "GB", "Hb", "VGM", "DVE", "RNI", "Créat", "DFGe", "Urée", "Na", "K", "Cl", "Pi", "Mg",
        "Alb", "Pré-alb", "Ca", "Ca (corr.)", "Ca ionisé", "Ac. urique",
        "BiliT", "ALT", "AST", "CK", "GGT", "LDH", "Phosp. Alc", "CRP",
        "CT", "TG", "HDL", "LDL", "non-HDL", "ApoB",
        "TSH", "T4L", "Vit. B12", "Vit. D", "HbA1c", "RAC", "TSAT",
        "Ferritine", "BNP", "NTproBNP", "PSA", "Li"
    ];

    const resultatsFormates = [];

    for (const param of ordre) {
        const val = valeurs[param];
        if (val === null || val === undefined || !String(val).trim()) continue;

        const affichage = param === "DVE" ? formaterDVE(String(val)) : String(val);

        if (param === "Li" && heure) {
            resultatsFormates.push(`${param} ${affichage} à ${heure}`);
        } else {
            resultatsFormates.push(`${param} ${affichage}`);
        }
    }

    let res = `(${date}) :\n${resultatsFormates.join(", ")}`;

    if (cultureComplete && cultureComplete.texte) {
        res += `\n${cultureComplete.texte}`;
    }

    return res;
}

function copierPressePapiers(txt) {
    if (navigator && navigator.clipboard && txt) {
        navigator.clipboard.writeText(txt).catch(() => {});
    }
}
