// =================================================================================
// FILE: server_data.js
// DESCRIPTION: Handles loading and parsing of all static game data (IDs, EGOs)
//              for the server. This ensures data is parsed only once on startup.
// =================================================================================
const fs = require('fs');
const path = require('path');

// Helper function to create a URL-friendly slug from a name
function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

// Parses the ID data from the provided CSV-like string
function parseIDCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.match(regex) || [];
        if (values.length !== headers.length) continue;
        const obj = {};
        headers.forEach((header, idx) => {
            let value = values[idx].trim();
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            obj[header] = value;
        });

        const name = obj.Name;
        const sinnerMatch = name.match(/(Yi Sang|Faust|Don Quixote|Ryōshū|Meursault|Hong Lu|Heathcliff|Ishmael|Rodion|Sinclair|Outis|Gregor)/);
        
        result.push({
            id: createSlug(name), 
            name: name,
            keywords: obj.Keywords ? obj.Keywords.split(',').map(k => k.trim()) : [],
            sinAffinities: obj.SinAffinities ? obj.SinAffinities.split(',').map(s => s.trim()) : [],
            rarity: obj.Rarity,
            imageFile: `${createSlug(name)}.webp`, 
            sinner: sinnerMatch ? sinnerMatch[0] : "Unknown",
        });
    }
    return result;
}

// Parses the EGO data from the provided string
function parseEGOData(data) {
    const lines = data.trim().split('\n');
    const egoList = [];
    const bgColorMap = { 
        'Yellow': 'var(--sin-sloth-bg)', 'Blue': 'var(--sin-gloom-bg)', 'Red': 'var(--sin-wrath-bg)',
        'Indigo': 'var(--sin-pride-bg)', 'Purple': 'var(--sin-envy-bg)', 'Orange': 'var(--sin-lust-bg)',
        'Green': 'var(--sin-gluttony-bg)'
    };
    
    lines.forEach(line => {
        if (!line.includes(' - ')) return;
        const parts = line.split(' - ');
        if (parts.length < 4) return;

        const nameAndSinner = parts[0];
        const rarity = parts[1].trim();
        const sin = parts[2].trim();
        const color = parts[3].trim();

        const sinners = ["Yi Sang", "Faust", "Don Quixote", "Ryōshū", "Meursault", "Hong Lu", "Heathcliff", "Ishmael", "Rodion", "Sinclair", "Outis", "Gregor"];
        let sinner = "Unknown";
        let name = nameAndSinner;

        for (const s of sinners) {
            if (nameAndSinner.includes(s)) {
                sinner = s;
                name = nameAndSinner.replace(s, '').trim();
                break;
            }
        }
        
        egoList.push({
            id: createSlug(`${name} ${sinner}`),
            name: `${name} (${sinner})`, sinner, rarity, sin, color,
            cssColor: bgColorMap[color] || 'rgba(128, 128, 128, 0.7)'
        });
    });
    return egoList;
}

// Main function to read data files and export parsed data
function initializeData() {
    try {
        const dataFilePath = path.join(__dirname, 'data.js');
        const dataFileContent = fs.readFileSync(dataFilePath, 'utf8');

        // Extract the raw string data from the data.js file
        const idCsvDataMatch = dataFileContent.match(/const idCsvData = `([\s\S]*?)`;/);
        const egoDataMatch = dataFileContent.match(/const egoData = `([\s\S]*?)`;/);

        if (!idCsvDataMatch || !egoDataMatch) {
            throw new Error("Could not find idCsvData or egoData in data.js");
        }

        const idCsvData = idCsvDataMatch[1];
        const egoData = egoDataMatch[1];

        const masterIDList = parseIDCSV(idCsvData);
        const masterEGOList = parseEGOData(egoData);

        return {
            masterIDList,
            masterEGOList,
            allIds: masterIDList.map(item => item.id)
        };
    } catch (error) {
        console.error("Failed to initialize game data:", error);
        // Exit the process if essential data cannot be loaded
        process.exit(1);
    }
}

module.exports = { initializeData };
