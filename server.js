const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { Firestore } = require('@google-cloud/firestore');

// =================================================================
// INITIALIZATION
// =================================================================

// Initialize Firestore and Express
const firestore = new Firestore();
const app = express();
const server = http.createServer(app);

// Serve static files from the main directory and the 'uploads' directory
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint for cloud environments
app.get('/_ah/health', (req, res) => res.status(200).send('OK'));

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server });

// =================================================================
// CONSTANTS & MASTER DATA
// =================================================================

const ROSTER_SIZE = 42;
const EGO_BAN_COUNT = 5;

// --- Utility function to create URL-friendly slugs from names ---
function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/ryōshū/g, 'ryshu').replace(/öufi/g, 'ufi')
        .replace(/e\.g\.o::/g, 'ego-')
        .replace(/ & /g, ' ').replace(/[.'"]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[^\w-]+/g, '');
}

// --- Parse full ID data from CSV format ---
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

// --- Parse EGO data from text format ---
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

// --- Hardcoded game data (Single Source of Truth) ---
const idCsvData = `Name,Keywords,SinAffinities,Rarity
"LCB Sinner Yi Sang","Sinking","Gloom,Envy,Sloth","0"
"Seven Association South Section 6 Yi Sang","Rupture","Gloom,Gluttony,Sloth","00"
"Molar Office Fixer Yi Sang","Discard,Tremor","Lust,Sloth,Wrath","00"
"The Pequod First Mate Yi Sang","Bleed,Poise","Pride,Envy,Gluttony","00"
"Dieci Association South Section 4 Yi Sang","Aggro,Discard,Sinking","Gluttony,Lust,Sloth","00"
"LCE E.G.O::Lantern Yi Sang","Aggro,Rupture","Sloth,Envy,Gluttony","00"
"Blade Lineage Salsu Yi Sang","Poise","Pride,Envy,Sloth","000"
"Effloresced E.G.O::Spicebush Yi Sang","Sinking,Tremor","Gluttony,Sloth,Pride","000"
"W Corp. L3 Cleanup Agent Yi Sang","Charge,Rupture","Sloth,Gluttony,Gloom","000"
"The Ring Pointillist Student Yi Sang","Bleed,Random","Gloom,Lust,Sloth","000"
"Lobotomy E.G.O::Solemn Lament Yi Sang","Ammo,Sinking","Pride,Gloom,Sloth","000"
"Liu Association South Section 3 Yi Sang","Burn","Sloth,Wrath,Envy","000"
"N Corp. E.G.O::Fell Bullet Yi Sang","Bleed,Poise","Wrath,Lust,Pride","000"
"LCB Sinner Faust","","Pride,Sloth,Gluttony","0"
"W Corp. L2 Cleanup Agent Faust","Charge","Envy,Gloom,Wrath","00"
"Lobotomy Corp. Remnant Faust","Poise,Rupture","Sloth,Gloom,Envy","000"
"Zwei Association South Section 4 Faust","Aggro","Envy,Gloom,Lust","00"
"Wuthering Heights Butler Faust","Sinking","Gloom,Lust,Wrath","00"
"The One Who Grips Faust","Bleed","Envy,Lust,Pride","000"
"Seven Association South Section 4 Faust","Rupture","Envy,Gloom,Gluttony","000"
"Lobotomy E.G.O::Regret Faust","Tremor","Sloth,Pride,Wrath","000"
"Blade Lineage Salsu Faust","Bleed,Poise","Sloth,Pride,Gloom","000"
"MultiCrack Office Rep Faust","Charge","Lust,Envy,Gluttony","000"
"LCE E.G.O::Ardor Blossom Star Faust","Burn","Sloth,Pride,Wrath","000"
"Heishou Pack - Mao Branch Adept Faust","Rupture","Sloth,Pride,Gluttony","000"
"LCB Sinner Don Quixote","Bleed","Lust,Envy,Gluttony","0"
"Shi Association South Section 5 Director Don Quixote","Poise","Wrath,Envy,Lust","00"
"N Corp. Mittelhammer Don Quixote","Bleed,Tremor","Lust,Gluttony,Wrath","00"
"Lobotomy E.G.O::Lantern Don Quixote","Aggro,Rupture","Gluttony,Lust,Gloom","00"
"Blade Lineage Salsu Don Quixote","Poise","Pride,Envy,Sloth","00"
"W Corp. L3 Cleanup Agent Don Quixote","Charge,Rupture","Sloth,Gloom,Envy","000"
"Cinq Association South Section 5 Director Don Quixote","","Lust,Gloom,Pride","000"
"The Middle Little Sister Don Quixote","Bleed","Wrath,Envy,Pride","000"
"T Corp. Class 3 Collection Staff Don Quixote","Aggro,Tremor","Gluttony,Pride,Sloth","000"
"The Manager of La Manchaland Don Quixote","Bleed","Sloth,Wrath,Lust","000"
"Cinq Association East Section 3 Don Quixote","Burn,Poise","Gluttony,Wrath,Pride","000"
"LCB Sinner Ryōshū","Poise","Gluttony,Lust,Pride","0"
"Seven Association South Section 6 Ryōshū","Rupture","Sloth,Pride,Gluttony","00"
"LCCB Assistant Manager Ryōshū","Ammo,Poise,Rupture,Tremor","Lust,Gluttony,Pride","00"
"Liu Association South Section 4 Ryōshū","Burn","Gluttony,Wrath,Lust","00"
"District 20 Yurodivy Ryōshū","Tremor","Lust,Sloth,Gluttony","00"
"Kurokumo Clan Wakashu Ryōshū","Bleed","Gluttony,Pride,Lust","000"
"R.B. Chef de Cuisine Ryōshū","Bleed","Wrath,Envy,Lust","000"
"W Corp. L3 Cleanup Agent Ryōshū","Charge","Lust,Pride,Envy","000"
"Edgar Family Chief Butler Ryōshū","Poise","Lust,Pride,Wrath","000"
"Lobotomy E.G.O::Red Eyes & Penitence Ryōshū","Bleed","Envy,Gloom,Lust","000"
"Heishou Pack - Mao Branch Ryōshū","Rupture","Lust,Gluttony,Pride","00"
"LCB Sinner Meursault","Tremor","Sloth,Pride,Gloom","0"
"Liu Association South Section 6 Meursault","Burn","Lust,Sloth,Wrath","00"
"Rosespanner Workshop Fixer Meursault","Charge,Tremor","Gloom,Pride,Sloth","00"
"The Middle Little Brother Meursault","Bleed","Sloth,Envy,Wrath","00"
"Dead Rabbits Boss Meursault","Rupture","Lust,Wrath,Gluttony","00"
"W Corp. L2 Cleanup Agent Meursault","Charge,Rupture","Envy,Gluttony,Pride","000"
"N Corp. Großhammer Meursault","Aggro,Bleed","Sloth,Wrath,Pride","000"
"R Corp. 4th Pack Rhino Meursault","Bleed,Charge","Envy,Gloom,Lust","000"
"Blade Lineage Mentor Meursault","Poise","Pride,Pride,Wrath","000"
"Dieci Association South Section 4 Director Meursault","Discard,Sinking","Gluttony,Sloth,Gloom","000"
"Cinq Association West Section 3 Meursault","Poise,Rupture","Pride,Gluttony,Gloom","000"
"The Thumb East Capo IIII Meursault","Ammo,Burn,Tremor","Sloth,Lust,Wrath","000"
"LCB Sinner Hong Lu","Rupture,Sinking","Pride,Sloth,Lust","0"
"Kurokumo Clan Wakashu Hong Lu","Bleed","Lust,Pride,Sloth","00"
"Liu Association South Section 5 Hong Lu","Burn","Gloom,Lust,Wrath","00"
"W Corp. L2 Cleanup Agent Hong Lu","Charge,Rupture","Pride,Wrath,Gluttony","00"
"Hook Office Fixer Hong Lu","Bleed","Wrath,Lust,Pride","00"
"Fanghunt Office Fixer Hong Lu","Rupture","Gluttony,Pride,Wrath","00"
"Tingtang Gang Gangleader Hong Lu","Bleed","Envy,Lust,Gluttony","000"
"K Corp. Class 3 Excision Staff Hong Lu","Aggro,Rupture","Pride,Gluttony,Sloth","000"
"Dieci Association South Section 4 Hong Lu","Discard,Sinking","Wrath,Gloom,Sloth","000"
"District 20 Yurodivy Hong Lu","Tremor","Gloom,Sloth,Gluttony","000"
"Full-Stop Office Rep Hong Lu","Ammo,Poise","Sloth,Gloom,Pride","000"
"R Corp. 4th Pack Reindeer Hong Lu","Charge,Sinking","Gluttony,Envy,Wrath","000"
"LCB Sinner Heathcliff","Tremor","Envy,Wrath,Lust","0"
"Shi Association South Section 5 Heathcliff","Poise","Lust,Wrath,Envy","00"
"N Corp. Kleinhammer Heathcliff","Bleed","Envy,Gloom,Lust","00"
"Seven Association South Section 4 Heathcliff","Rupture","Wrath,Envy,Gluttony","00"
"MultiCrack Office Fixer Heathcliff","Charge","Wrath,Envy,Gloom","00"
"R Corp. 4th Pack Rabbit Heathcliff","Ammo,Bleed,Rupture","Wrath,Gluttony,Envy","000"
"Lobotomy E.G.O::Sunshower Heathcliff","Rupture,Sinking,Tremor","Envy,Gloom,Sloth","000"
"The Pequod Harpooneer Heathcliff","Aggro,Bleed,Poise","Pride,Envy,Envy","000"
"Öufi Association South Section 3 Heathcliff","Tremor","Envy,Gloom,Pride","000"
"Wild Hunt Heathcliff","Sinking","Wrath,Envy,Gloom","000"
"Full-Stop Office Fixer Heathcliff","Ammo,Poise","Gloom,Envy,Pride","000"
"Kurokumo Clan Wakashu Heathcliff","Bleed","Wrath,Pride,Lust","000"
"LCB Sinner Ishmael","Tremor","Wrath,Gluttony,Gloom","0"
"Shi Association South Section 5 Ishmael","Poise","Envy,Lust,Wrath","00"
"LCCB Assistant Manager Ishmael","Aggro,Rupture,Tremor","Gluttony,Gloom,Pride","00"
"Lobotomy E.G.O::Sloshing Ishmael","Aggro,Rupture,Tremor","Gloom,Wrath,Gluttony","00"
"Edgar Family Butler Ishmael","Poise,Sinking","Sloth,Gluttony,Gloom","00"
"R Corp. 4th Pack Reindeer Ishmael","Charge,Sinking","Gloom,Envy,Wrath","000"
"Liu Association South Section 4 Ishmael","Burn","Lust,Wrath,Envy","000"
"Molar Boatworks Fixer Ishmael","Sinking,Tremor","Pride,Sloth,Gloom","000"
"The Pequod Captain Ishmael","Aggro,Bleed,Burn","Envy,Pride,Wrath","000"
"Zwei Association West Section 3 Ishmael","Aggro,Tremor","Pride,Envy,Gluttony","000"
"Kurokumo Clan Captain Ishmael","Bleed","Envy,Pride,Lust","000"
"Family Hierarch Candidate Ishmael","Poise,Rupture","Gloom,Gluttony,Envy","000"
"LCB Sinner Rodion","Bleed","Gluttony,Pride,Wrath","0"
"LCCB Assistant Manager Rodion","","Pride,Gluttony,Envy","00"
"N Corp. Mittelhammer Rodion","Bleed","Pride,Lust,Wrath","00"
"Zwei Association South Section 5 Rodion","Aggro,Poise","Wrath,Sloth,Gloom","00"
"T Corp. Class 2 Collection Staff Rodion","Tremor","Envy,Wrath,Sloth","00"
"Kurokumo Clan Wakashu Rodion","Bleed,Poise","Gluttony,Lust,Pride","000"
"Rosespanner Workshop Rep Rodion","Charge,Tremor","Pride,Gloom,Envy","000"
"Dieci Association South Section 4 Rodion","Aggro,Discard,Sinking","Gloom,Envy,Sloth","000"
"Liu Association South Section 4 Director Rodion","Burn","Pride,Wrath,Lust","000"
"Devyat' Association North Section 3 Rodion","Rupture","Lust,Wrath,Gluttony","000"
"The Princess of La Manchaland Rodion","Bleed,Rupture","Pride,Envy,Lust","000"
"Heishou Pack - Si Branch Rodion","Poise,Rupture","Envy,Gluttony,Gloom","000"
"LCB Sinner Sinclair","Rupture","Pride,Wrath,Envy","0"
"Zwei Association South Section 6 Sinclair","Aggro,Tremor","Gloom,Wrath,Sloth","00"
"Los Mariachis Jefe Sinclair","Poise,Sinking","Sloth,Envy,Gloom","00"
"Lobotomy E.G.O::Red Sheet Sinclair","Rupture","Gluttony,Pride,Lust","00"
"Molar Boatworks Fixer Sinclair","Tremor","Gloom,Envy,Gluttony","00"
"Zwei Association West Section 3 Sinclair","Aggro,Tremor","Lust,Gloom,Sloth","00"
"Blade Lineage Salsu Sinclair","Bleed,Poise","Gluttony,Wrath,Pride","000"
"The One Who Shall Grip Sinclair","Bleed,Burn","Gloom,Lust,Wrath","000"
"Cinq Association South Section 4 Director Sinclair","Poise","Gluttony,Pride,Lust","000"
"Dawn Office Fixer Sinclair","Bleed","Gloom,Envy,Wrath","000"
"Devyat' Association North Section 3 Sinclair","Rupture","Lust,Gluttony,Wrath","000"
"The Middle Little Brother Sinclair","Aggro,Bleed","Lust,Gluttony,Wrath","000"
"The Thumb East Soldato II Sinclair","Ammo,Burn,Tremor","Lust,Sloth,Wrath","000"
"LCB Sinner Outis","Rupture","Sloth,Pride,Gloom","0"
"Blade Lineage Salsu Outis","Poise","Wrath,Lust,Pride","00"
"G Corp. Head Manager Outis","Sinking","Sloth,Gluttony,Gloom","00"
"Cinq Association South Section 4 Outis","Aggro,Poise","Pride,Gloom,Lust","00"
"The Ring Pointillist Student Outis","Bleed,Random","Lust,Wrath,Gluttony","00"
"Seven Association South Section 6 Director Outis","Rupture","Gluttony,Sloth,Lust","000"
"Molar Office Fixer Outis","Discard,Tremor","Wrath,Lust,Sloth","000"
"Lobotomy E.G.O::Magic Bullet Outis","Burn","Wrath,Pride,Pride","000"
"Wuthering Heights Chief Butler Outis","Sinking","Pride,Gloom,Lust","000"
"W Corp. L3 Cleanup Captain Outis","Charge,Rupture","Pride,Envy,Gloom","000"
"The Barber of La Manchaland Outis","Bleed","Gluttony,Lust,Wrath","000"
"Heishou Pack - Mao Branch Outis","Rupture","Sloth,Gluttony,Gloom","000"
"LCB Sinner Gregor","Rupture","Gloom,Gluttony,Sloth","0"
"Liu Association South Section 6 Gregor","Burn","Wrath,Lust,Sloth","00"
"R.B. Sous-chef Gregor","Bleed","Lust,Gluttony,Envy","00"
"Rosespanner Workshop Fixer Gregor","Rupture,Tremor","Gluttony,Envy,Gloom","00"
"Kurokumo Clan Captain Gregor","Bleed","Sloth,Lust,Gloom","00"
"G Corp. Manager Corporal Gregor","Rupture","Gluttony,Sloth,Lust","000"
"Zwei Association South Section 4 Gregor","Aggro","Sloth,Gluttony,Gloom","000"
"Twinhook Pirates First Mate Gregor","Ammo,Bleed,Poise","Sloth,Pride,Gloom","000"
"Edgar Family Heir Gregor","Sinking","Envy,Pride,Lust","000"
"The Priest of La Manchaland Gregor","Aggro,Bleed,Rupture","Gluttony,Pride,Lust","000"
"Firefist Office Survivor Gregor","Burn","Lust,Wrath,Wrath","000"
"Heishou Pack - Si Branch Gregor","Poise,Rupture","Pride,Gluttony,Envy","000"
`;
const egoData = `Crow's Eye View Yi Sang - ZAYIN - Sloth - Yellow
Bygone Days Yi Sang - ZAYIN - Gloom - Blue
4th Match Flame Yi Sang - TETH - Wrath - Red
Wishing Cairn Yi Sang - TETH - Sloth - Yellow
Dimension Shredder Yi Sang - HE - Pride - Indigo
Fell Bullet Yi Sang - HE - Pride - Indigo
Sunshower Yi Sang - WAW - Sloth - Yellow
Representation Emitter Faust - ZAYIN - Pride - Indigo
Hex Nail Faust - TETH - Envy - Purple
9:2 Faust - TETH - Lust - Orange
Lasso Faust - TETH - Gluttony - Green
Fluid Sac Faust - HE - Gloom - Blue
Telepole Faust - HE - Envy - Purple
Thoracalgia Faust - HE - Pride - Indigo
Everlasting Faust - WAW - Sloth - Yellow
La Sangre de Sancho Don Quixote - ZAYIN - Lust - Orange
Lifetime Stew Don Quixote - TETH - Lust - Orange
Wishing Cairn Don Quixote - TETH - Sloth - Yellow
Electric Screaming Don Quixote - TETH - Envy - Purple
Fluid Sac Don Quixote - HE - Gloom - Blue
Telepole Don Quixote - HE - Envy - Purple
Red Sheet Don Quixote - HE - Gluttony - Green
Yearning-Mircalla Don Quixote - WAW - Lust - Orange
In the Name of Love and Hate Don Quixote - WAW - Envy - Purple
Forest for the Flames Ryōshū - ZAYIN - Lust - Orange
Soda Ryōshū - ZAYIN - Gloom - Blue
Red Eyes Ryōshū - TETH - Lust - Orange
Blind Obsession Ryōshū - TETH - Pride - Indigo
4th Match Flame Ryōshū - HE - Wrath - Red
Red Eyes (Open) Ryōshū - HE - Envy - Purple
Thoracalgia Ryōshū - HE - Pride - Indigo
Contempt, Awe Ryōshū - WAW - Lust - Orange
Chains of Others Meursault - ZAYIN - Pride - Indigo
Screwloose Wallop Meursault - TETH - Envy - Purple
Regret Meursault - TETH - Wrath - Red
Electric Screaming Meursault - TETH - Envy - Purple
Pursuance Meursault - HE - Sloth - Yellow
Capote Meursault - HE - Wrath - Red
Yearning-Mircalla Meursault - WAW - Lust - Orange
Land of Illusion Hong Lu - ZAYIN - Gloom - Blue
Roseate Desire Hong Lu - TETH - Lust - Orange
Soda Hong Lu - TETH - Gloom - Blue
Cavernous Wailing Hong Lu - TETH - Sloth - Yellow
Lasso Hong Lu - TETH - Gluttony - Green
Dimension Shredder Hong Lu - HE - Pride - Indigo
Effervescent Corrosion Hong Lu - HE - Gluttony - Green
Tears of the Tarnished Blood [汚血泣淚] Hong Lu - WAW - Gluttony - Green
Bodysack Heathcliff - ZAYIN - Envy - Purple
Holiday Heathcliff - ZAYIN - Gluttony - Green
AEDD Heathcliff - TETH - Gloom - Blue
Fell Bullet Heathcliff - TETH - Pride - Indigo
Telepole Heathcliff - HE - Envy - Purple
Ya Śūnyatā Tad Rūpam Heathcliff - HE - Lust - Orange
Asymmetrical Inertia Heathcliff - HE - Sloth - Yellow
Binds Heathcliff - WAW - Gloom - Blue
Snagharpoon Ishmael - ZAYIN - Gloom - Blue
Hundred-Footed Death Maggot [蝍蛆殺] Ishmael - ZAYIN - Gloom - Blue
Roseate Desire Ishmael - TETH - Lust - Orange
Capote Ishmael - TETH - Wrath - Red
Bygone Days Ishmael - TETH - Gloom - Blue
Ardor Blossom Star Ishmael - HE - Wrath - Red
Wingbeat Ishmael - HE - Gluttony - Green
Christmas Nightmare Ishmael - HE - Gluttony - Green
Blind Obsession Ishmael - WAW - Pride - Indigo
What is Cast Rodion - ZAYIN - Pride - Indigo
Rime Shank Rodion - TETH - Gloom - Blue
Effervescent Corrosion Rodion - TETH - Gluttony - Green
4th Match Flame Rodion - HE - Wrath - Red
Pursuance Rodion - HE - Sloth - Yellow
Hex Nail Rodion - HE - Envy - Purple
Sanguine Desire Rodion - HE - Lust - Orange
Indicant's Trial Rodion - WAW - Wrath - Red
Branch of Knowledge Sinclair - ZAYIN - Gluttony - Green
Cavernous Wailing Sinclair - HE - Gloom - Blue
Impending Day Sinclair - TETH - Wrath - Red
Lifetime Stew Sinclair - TETH - Lust - Orange
Hex Nail Sinclair - TETH - Envy - Purple
Lantern Sinclair - HE - Gluttony - Green
9:2 Sinclair - HE - Lust - Orange
Tears of the Tarnished Blood [汚血泣淚] Sinclair - WAW - Gluttony - Green
To Páthos Máthos Outis - ZAYIN - Pride - Indigo
Ya Śūnyatā Tad Rūpam Outis - WAW - Lust - Orange
Sunshower Outis - TETH - Gluttony - Green
Ebony Stem Outis - HE - Gluttony - Green
Holiday Outis - HE - Wrath - Red
Dimension Shredder Outis - HE - Envy - Purple
Magic Bullet Outis - HE - Pride - Indigo
Binds Outis - WAW - Pride - Indigo
Suddenly, One Day Gregor - ZAYIN - Sloth - Yellow
Legerdemain Gregor - ZAYIN - Gluttony - Green
Lantern Gregor - TETH - Gluttony - Green
Bygone Days Gregor - TETH - Gloom - Blue
AEDD Gregor - HE - Gloom - Blue
Solemn Lament Gregor - HE - Gloom - Blue
Christmas Nightmare Gregor - HE - Sloth - Yellow
Garden of Thorns Gregor - WAW - Lust - Orange`;

const masterIDList = parseIDCSV(idCsvData);
const masterEGOList = parseEGOData(egoData);
const allIdSlugs = masterIDList.map(item => item.id);

// =================================================================
// DRAFT LOGIC & STATE MANAGEMENT
// =================================================================

// --- Defines the entire sequence of the draft ---
const DRAFT_WORKFLOW = [
    { phase: "egoBan", turn: 'p1', bans: EGO_BAN_COUNT },
    { phase: "egoBan", turn: 'p2', bans: EGO_BAN_COUNT },
    { phase: "ban", turn: 'p1', count: 1 }, { phase: "ban", turn: 'p2', count: 1 },
    { phase: "ban", turn: 'p1', count: 1 }, { phase: "ban", turn: 'p2', count: 1 },
    { phase: "ban", turn: 'p1', count: 1 }, { phase: "ban", turn: 'p2', count: 1 },
    { phase: "ban", turn: 'p1', count: 1 }, { phase: "ban", turn: 'p2', count: 1 },
    { phase: "pick", turn: 'p1', count: 1 }, { phase: "pick", turn: 'p2', count: 2 },
    { phase: "pick", turn: 'p1', count: 2 }, { phase: "pick", turn: 'p2', count: 2 },
    { phase: "pick", turn: 'p1', count: 2 }, { phase: "pick", turn: 'p2', count: 2 },
    { phase: "pick", turn: 'p1', count: 1 },
    { phase: "midBan", turn: 'p1', count: 1 }, { phase: "midBan", turn: 'p2', count: 1 },
    { phase: "midBan", turn: 'p1', count: 1 }, { phase: "midBan", turn: 'p2', count: 1 },
    { phase: "midBan", turn: 'p1', count: 1 }, { phase: "midBan", turn: 'p2', count: 1 },
    { phase: "pick2", turn: 'p2', count: 1 }, { phase: "pick2", turn: 'p1', count: 2 },
    { phase: "pick2", turn: 'p2', count: 2 }, { phase: "pick2", turn: 'p1', count: 2 },
    { phase: "pick2", turn: 'p2', count: 2 }, { phase: "pick2", turn: 'p1', count: 2 },
    { phase: "pick2", turn: 'p2', count: 1 },
    { phase: "complete" }
];

// --- Function to advance the draft to the next step ---
function advanceDraft(draft) {
    const nextStepIndex = draft.step + 1;
    if (nextStepIndex >= DRAFT_WORKFLOW.length) {
        draft.phase = "complete";
        return draft;
    }

    const nextStep = DRAFT_WORKFLOW[nextStepIndex];
    draft.step = nextStepIndex;
    draft.phase = nextStep.phase;
    draft.currentPlayer = nextStep.turn || "";
    draft.actionCount = nextStep.count || 0;
    
    // For EGO Ban phase, the action count is the number of bans remaining
    if (draft.phase === 'egoBan') {
        draft.actionCount = EGO_BAN_COUNT - (draft.egoBans[draft.currentPlayer]?.length || 0);
    }
    
    return draft;
}

// --- Creates the initial state for a new lobby ---
function createNewLobbyState() {
    return {
        participants: {
            p1: { name: "Player 1", status: "disconnected", ready: false },
            p2: { name: "Player 2", status: "disconnected", ready: false },
            ref: { name: "Referee", status: "disconnected" }
        },
        roster: { p1: [], p2: [] },
        draft: {
            step: -1, // Starts at -1, so the first advance goes to step 0
            phase: "roster",
            currentPlayer: "",
            actionCount: 0,
            available: { p1: [], p2: [] },
            idBans: { p1: [], p2: [] },
            egoBans: { p1: [], p2: [] },
            picks: { p1: [], p2: [] }
        }
    };
}

// =================================================================
// COMMUNICATION & UTILITIES
// =================================================================

// --- Generates a unique 6-character code for a new lobby ---
async function generateUniqueLobbyCode() {
    let code;
    let docExists;
    do {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const doc = await firestore.collection('lobbies').doc(code).get();
        docExists = doc.exists;
    } while (docExists);
    return code;
}

// --- Broadcasts the current lobby state to all connected clients in that lobby ---
async function broadcastState(lobbyCode) {
    try {
        const lobbyRef = firestore.collection('lobbies').doc(lobbyCode);
        const lobbyDoc = await lobbyRef.get();
        if (!lobbyDoc.exists) return;

        const lobbyData = lobbyDoc.data();
        const message = JSON.stringify({ type: 'stateUpdate', state: lobbyData });

        wss.clients.forEach(client => {
            if (client.lobbyCode === lobbyCode && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    } catch (error) {
        console.error(`Failed to broadcast state for lobby ${lobbyCode}:`, error);
    }
}

// =================================================================
// MAIN WEBSOCKET LOGIC
// =================================================================

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        let incomingData;
        try {
            incomingData = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        const { type, lobbyCode, role, player, id, action, payload, name, egoId, roster } = incomingData;
        const lobbyRef = lobbyCode ? firestore.collection('lobbies').doc(lobbyCode.toUpperCase()) : null;

        try {
            switch (type) {
                case 'createLobby': {
                    const newLobbyCode = await generateUniqueLobbyCode();
                    const newLobbyState = createNewLobbyState();
                    ws.lobbyCode = newLobbyCode;
                    ws.userRole = 'ref';
                    if (name) newLobbyState.participants.ref.name = name;
                    newLobbyState.participants.ref.status = "connected";
                    
                    await firestore.collection('lobbies').doc(newLobbyCode).set(newLobbyState);
                    
                    ws.send(JSON.stringify({ type: 'init', masterIDList, masterEGOList }));
                    ws.send(JSON.stringify({ type: 'lobbyCreated', code: newLobbyCode, state: newLobbyState }));
                    break;
                }

                case 'joinLobby': {
                    if (!lobbyRef || !role) return;
                    
                    await firestore.runTransaction(async (transaction) => {
                        const doc = await transaction.get(lobbyRef);
                        if (!doc.exists) throw new Error('Lobby not found.');
                        
                        const lobbyData = doc.data();
                        if (lobbyData.participants[role]?.status === 'connected') throw new Error(`Role ${role.toUpperCase()} is taken.`);

                        ws.lobbyCode = lobbyCode.toUpperCase();
                        ws.userRole = role;
                        
                        const updates = { [`participants.${role}.status`]: 'connected' };
                        if (name) updates[`participants.${role}.name`] = name;
                        transaction.update(lobbyRef, updates);
                    });
                    
                    ws.send(JSON.stringify({ type: 'init', masterIDList, masterEGOList }));
                    const updatedDoc = await lobbyRef.get();
                    ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyCode: ws.lobbyCode, role, state: updatedDoc.data() }));
                    await broadcastState(ws.lobbyCode);
                    break;
                }

                case 'rosterSelect': {
                    if (!lobbyRef || !player || !id) return;
                    await firestore.runTransaction(async (t) => {
                        const doc = await t.get(lobbyRef);
                        if (!doc.exists) throw new Error("Lobby not found");
                        const data = doc.data();
                        if (data.participants[player].ready) return; // Cannot edit when ready
                        
                        const currentRoster = data.roster[player] || [];
                        const index = currentRoster.indexOf(id);
                        if (index === -1) {
                            if (currentRoster.length < ROSTER_SIZE) currentRoster.push(id);
                        } else {
                            currentRoster.splice(index, 1);
                        }
                        t.update(lobbyRef, { [`roster.${player}`]: currentRoster });
                    });
                    await broadcastState(lobbyCode.toUpperCase());
                    break;
                }

                case 'rosterSet':
                case 'rosterRandomize': {
                    if (!lobbyRef || !player) return;
                     await firestore.runTransaction(async (t) => {
                        const doc = await t.get(lobbyRef);
                        if (!doc.exists) throw new Error("Lobby not found");
                        if (doc.data().participants[player].ready) return;

                        let newRoster = [];
                        if (type === 'rosterSet' && Array.isArray(roster) && roster.length === ROSTER_SIZE) {
                            newRoster = roster;
                        } else if (type === 'rosterRandomize') {
                            const shuffled = [...allIdSlugs].sort(() => 0.5 - Math.random());
                            newRoster = shuffled.slice(0, ROSTER_SIZE);
                        }
                        
                        if (newRoster.length > 0) {
                           t.update(lobbyRef, { [`roster.${player}`]: newRoster });
                        }
                    });
                    await broadcastState(lobbyCode.toUpperCase());
                    break;
                }

                case 'updateReady': {
                    if (!lobbyRef || !player) return;
                    await firestore.runTransaction(async (t) => {
                        const doc = await t.get(lobbyRef);
                        if (!doc.exists) throw new Error("Lobby not found");
                        const data = doc.data();
                        const currentReadyState = data.participants[player].ready;
                        if (!currentReadyState && data.roster[player].length !== ROSTER_SIZE) return; // Must have full roster to ready up
                        t.update(lobbyRef, { [`participants.${player}.ready`]: !currentReadyState });
                    });
                    await broadcastState(lobbyCode.toUpperCase());
                    break;
                }
                
                case 'draftControl': {
                    if (!lobbyRef || ws.userRole !== 'ref') return;
                    await firestore.runTransaction(async (t) => {
                        const doc = await t.get(lobbyRef);
                        if (!doc.exists) throw new Error("Lobby not found");
                        let data = doc.data();
                        let draft = data.draft;

                        if (action === 'startEgoBan') {
                            if (data.participants.p1.ready && data.participants.p2.ready && draft.phase === 'roster') {
                                // Initialize available rosters for the draft
                                draft.available.p1 = [...data.roster.p1];
                                draft.available.p2 = [...data.roster.p2];
                                draft = advanceDraft(draft);
                            }
                        } else if (action === 'complete') {
                            draft.phase = 'complete';
                        }
                        
                        t.update(lobbyRef, { draft });
                    });
                    await broadcastState(lobbyCode.toUpperCase());
                    break;
                }

                case 'egoBan':
                case 'draftSelect': {
                    if (!lobbyRef || (!egoId && !payload)) return;
                     await firestore.runTransaction(async (t) => {
                        const doc = await t.get(lobbyRef);
                        if (!doc.exists) throw new Error("Lobby not found");
                        let data = doc.data();
                        let draft = data.draft;
                        const { currentPlayer } = draft;
                        
                        // Check if it's the correct user's turn
                        if (ws.userRole !== currentPlayer && ws.userRole !== 'ref') return;

                        let shouldAdvance = false;

                        if (type === 'egoBan' && draft.phase === 'egoBan') {
                            const playerBans = draft.egoBans[currentPlayer] || [];
                            const allBans = [...(draft.egoBans.p1 || []), ...(draft.egoBans.p2 || [])];
                            if (playerBans.length < EGO_BAN_COUNT && !allBans.includes(egoId)) {
                                playerBans.push(egoId);
                                draft.egoBans[currentPlayer] = playerBans;
                                draft.actionCount--;
                                if (draft.actionCount <= 0) shouldAdvance = true;
                            }
                        } else if (type === 'draftSelect' && ['ban', 'pick', 'midBan', 'pick2'].includes(draft.phase)) {
                            const selectedId = payload.id;
                            const isBan = draft.phase.includes('ban');
                            const targetList = isBan ? draft.idBans[currentPlayer] : draft.picks[currentPlayer];
                            
                            targetList.push(selectedId);

                            // Remove from both available pools
                            let p1Index = draft.available.p1.indexOf(selectedId);
                            if(p1Index > -1) draft.available.p1.splice(p1Index, 1);
                            let p2Index = draft.available.p2.indexOf(selectedId);
                            if(p2Index > -1) draft.available.p2.splice(p2Index, 1);
                            
                            draft.actionCount--;
                            if (draft.actionCount <= 0) shouldAdvance = true;
                        }
                        
                        if (shouldAdvance) {
                            draft = advanceDraft(draft);
                        }

                        t.update(lobbyRef, { draft });
                    });
                    await broadcastState(lobbyCode.toUpperCase());
                    break;
                }
            }
        } catch (error) {
            console.error(`Error processing message type ${type}:`, error);
            ws.send(JSON.stringify({ type: 'error', message: error.message || 'An internal error occurred.' }));
        }
    });

    ws.on('close', async () => {
        console.log('Client disconnected');
        const { lobbyCode, userRole } = ws;
        if (lobbyCode && userRole) {
            const lobbyRef = firestore.collection('lobbies').doc(lobbyCode);
            try {
                await firestore.runTransaction(async (t) => {
                    const doc = await t.get(lobbyRef);
                    if (doc.exists) {
                         t.update(lobbyRef, {
                            [`participants.${userRole}.status`]: 'disconnected',
                            [`participants.${userRole}.ready`]: false,
                        });
                    }
                });
                await broadcastState(lobbyCode);
            } catch (error) {
                console.error(`Error on client disconnect for lobby ${lobbyCode}:`, error);
            }
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
