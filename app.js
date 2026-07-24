window.cachedMarketData = [];
const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/";

// --- STABILIZED TUNING CONFIGURATION ---
const BATCH_SIZE = 35;        // Lighter queries prevent server timeouts
const CONCURRENCY_LIMIT = 4;  // Prevents choking the server's back-end worker threads

function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const timestamp = new Date(utcDateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

function getQualityNumber(val) {
  const str = String(val).toLowerCase().trim();
  if (str === '1' || str === 'normal') return 1;
  if (str === '2' || str === 'good') return 2;
  if (str === '3' || str === 'outstanding') return 3;
  if (str === '4' || str === 'excellent') return 4;
  if (str === '5' || str === 'masterpiece') return 5;
  return Number(val) || 1;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

const nameMap = {
    // --- CLOTH ARMOR SETS ---
    "ARMOR_CLOTH_SET1": "Scholar Robe",
    "HEAD_CLOTH_SET1": "Scholar Cowl",
    "SHOES_CLOTH_SET1": "Scholar Sandals",
    "ARMOR_CLOTH_SET2": "Cleric Robe",
    "HEAD_CLOTH_SET2": "Cleric Cowl",
    "SHOES_CLOTH_SET2": "Cleric Sandals",
    "ARMOR_CLOTH_SET3": "Mage Robe",
    "HEAD_CLOTH_SET3": "Mage Cowl",
    "SHOES_CLOTH_SET3": "Mage Sandals",
    "ARMOR_CLOTH_ROYAL": "Royal Robe",
    "HEAD_CLOTH_ROYAL": "Royal Cowl",
    "SHOES_CLOTH_ROYAL": "Royal Sandals",
    "ARMOR_CLOTH_KEEPER": "Druid Robe",
    "HEAD_CLOTH_KEEPER": "Druid Cowl",
    "SHOES_CLOTH_KEEPER": "Druid Sandals",
    "ARMOR_CLOTH_HELL": "Fiend Robe",
    "HEAD_CLOTH_HELL": "Fiend Cowl",
    "SHOES_CLOTH_HELL": "Fiend Sandals",
    "ARMOR_CLOTH_MORGANA": "Cultist Robe",
    "HEAD_CLOTH_MORGANA": "Cultist Cowl",
    "SHOES_CLOTH_MORGANA": "Cultist Sandals",
    "ARMOR_CLOTH_FEY": "Feyscale Robe",
    "HEAD_CLOTH_FEY": "Feyscale Hat",
    "SHOES_CLOTH_FEY": "Feyscale Sandals",
    "ARMOR_CLOTH_AVALON": "Robe of Purity",
    "HEAD_CLOTH_AVALON": "Cowl of Purity",
    "SHOES_CLOTH_AVALON": "Sandals of Purity",

    // --- LEATHER ARMOR SETS ---
    "ARMOR_LEATHER_SET1": "Mercenary Jacket",
    "HEAD_LEATHER_SET1": "Mercenary Hood",
    "SHOES_LEATHER_SET1": "Mercenary Shoes",
    "ARMOR_LEATHER_SET2": "Hunter Jacket",
    "HEAD_LEATHER_SET2": "Hunter Hood",
    "SHOES_LEATHER_SET2": "Hunter Shoes",
    "ARMOR_LEATHER_SET3": "Assassin Jacket",
    "HEAD_LEATHER_SET3": "Assassin Hood",
    "SHOES_LEATHER_SET3": "Assassin Shoes",
    "ARMOR_LEATHER_ROYAL": "Royal Jacket",
    "HEAD_LEATHER_ROYAL": "Royal Hood",
    "SHOES_LEATHER_ROYAL": "Royal Shoes",
    "ARMOR_LEATHER_MORGANA": "Stalker Jacket",
    "HEAD_LEATHER_MORGANA": "Stalker Hood",
    "SHOES_LEATHER_MORGANA": "Stalker Shoes",
    "ARMOR_LEATHER_HELL": "Hellion Jacket",
    "HEAD_LEATHER_HELL": "Hellion Hood",
    "SHOES_LEATHER_HELL": "Hellion Shoes",
    "ARMOR_LEATHER_KEEPER": "Specter Jacket",
    "HEAD_LEATHER_KEEPER": "Specter Hood",
    "SHOES_LEATHER_KEEPER": "Specter Shoes",
    "ARMOR_LEATHER_FEY": "Mistwalker Jacket",
    "HEAD_LEATHER_FEY": "Mistwalker Hood",
    "SHOES_LEATHER_FEY": "Mistwalker Shoes",
    "ARMOR_LEATHER_AVALON": "Jacket of Tenacity",
    "HEAD_LEATHER_AVALON": "Hood of Tenacity",
    "SHOES_LEATHER_AVALON": "Shoes of Tenacity",

    // --- PLATE ARMOR SETS ---
    "ARMOR_PLATE_SET1": "Soldier Armor",
    "HEAD_PLATE_SET1": "Soldier Helmet",
    "SHOES_PLATE_SET1": "Soldier Boots",
    "ARMOR_PLATE_SET2": "Knight Armor",
    "HEAD_PLATE_SET2": "Knight Helmet",
    "SHOES_PLATE_SET2": "Knight Boots",
    "ARMOR_PLATE_SET3": "Guardian Armor",
    "HEAD_PLATE_SET3": "Guardian Helmet",
    "SHOES_PLATE_SET3": "Guardian Boots",
    "ARMOR_PLATE_ROYAL": "Royal Armor",
    "HEAD_PLATE_ROYAL": "Royal Helmet",
    "SHOES_PLATE_ROYAL": "Royal Boots",
    "ARMOR_PLATE_UNDEAD": "Graveguard Armor",
    "HEAD_PLATE_UNDEAD": "Graveguard Helmet",
    "SHOES_PLATE_UNDEAD": "Graveguard Boots",
    "ARMOR_PLATE_HELL": "Demon Armor",
    "HEAD_PLATE_HELL": "Demon Helmet",
    "SHOES_PLATE_HELL": "Demon Boots",
    "ARMOR_PLATE_KEEPER": "Judicator Armor",
    "HEAD_PLATE_KEEPER": "Judicator Helmet",
    "SHOES_PLATE_KEEPER": "Judicator Boots",
    "ARMOR_PLATE_FEY": "Duskweaver Armor",
    "HEAD_PLATE_FEY": "Duskweaver Helmet",
    "SHOES_PLATE_FEY": "Duskweaver Boots",
    "ARMOR_PLATE_AVALON": "Armor of Valor",
    "HEAD_PLATE_AVALON": "Helmet of Valor",
    "SHOES_PLATE_AVALON": "Boots of Valor",

    // --- SWORDS ---
    "MAIN_SWORD": "Broadsword",
    "2H_SWORD": "Claymore",
    "MAIN_SCIMITAR_MORGANA": "Dual Swords",
    "2H_SCIMITAR_MORGANA": "Carving Sword",
    "MAIN_NINJASWORD": "Clarent Blade",
    "2H_CLEAVER_HELL": "Galatine Pair",
    "2H_DUALSCIMITAR_AVALON": "Kingmaker",
    "2H_SWORD_FEY": "Infinity Blade",

    // --- AXES ---
    "MAIN_AXE": "Battleaxe",
    "2H_AXE": "Greataxe",
    "2H_HALBERD": "Halberd",
    "2H_HALBERD_MORGANA": "Carrioncaller",
    "2H_COMPOSITEAXE_KEEPER": "Infernal Scythe",
    "2H_SCYTHE_HELL": "Realmbreaker",
    "2H_AXE_AVALON": "Bear Paws",
    "2H_AXE_FEY": "Crystal Reaper",

    // --- MACES ---
    "MAIN_MACEMORGANA": "Mace",
    "2H_MACE": "Heavy Mace",
    "2H_MACE_KEEPER": "Morning Star",
    "MAIN_MACE_HELL": "Bedrock Mace",
    "2H_ROCKMACE_KEEPER": "Incubus Mace",
    "2H_MACE_AVALON": "Camlann Mace",
    "2H_MACE_FEY": "Oathkeepers",
    "MAIN_MACE_FEY": "Dreadstorm Monarch",

    // --- HAMMERS ---
    "MAIN_HAMMER": "Hammer",
    "2H_HAMMER": "Polehammer",
    "2H_POLEHAMMER_KEEPER": "Great Hammer",
    "2H_HAMMER_HELL": "Tombhammer",
    "2H_HAMMER_AVALON": "Hand of Justice",
    "2H_RAM_AVALON": "Truebolt Hammer",
    "2H_HAMMER_FEY": "Forge Hammers",
    "2H_HAMMER_CRYSTAL": "Crystal Hammer",

    // --- WAR GLOVES ---
    "2H_WARGLOVE": "Brawler Gloves",
    "2H_WARGLOVE_AVALON": "Fists of Avalon",
    "2H_COMBAT_MORGANA": "Battle Bracers",
    "2H_COMBAT_HELL": "Spiked Gauntlets",
    "2H_WARGLOVE_KEEPER": "Ursine Maulers",
    "2H_WARGLOVE_FEY": "Forcepulse Bracers",
    "2H_WARGLOVE_CRYSTAL1": "Crystal Fist",
    "2H_WARGLOVE_CRYSTAL2": "Crystal Brawler",

    // --- SPEARS ---
    "MAIN_SPEAR": "Spear",
    "2H_SPEAR": "Pike",
    "2H_SPEAR_KEEPER": "Glaive",
    "MAIN_SPEAR_LANCER": "Heron Spear",
    "2H_HARPOON_HELL": "Spirithunter",
    "2H_SPEAR_AVALON": "Daybreaker",
    "2H_SPEAR_FEY": "Rift Glaive",
    "2H_SPEAR_CRYSTAL": "Crystal Spear",

    // --- BOWS ---
    "MAIN_BOW": "Bow",
    "2H_WARBOW": "Warbow",
    "2H_LONGBOW": "Longbow",
    "2H_COMPOSITEBOW_KEEPER": "Badon Bow",
    "2H_BOW_HELL": "Whispering Bow",
    "2H_BOW_AVALON": "Wailing Bow",
    "2H_BOW_FEY": "Mistpiercer",
    "2H_BOW_CRYSTAL": "Crystal Bow",

    // --- CROSSBOWS ---
    "2H_CROSSBOW": "Crossbow",
    "2H_CROSSBOWLARGE": "Heavy Crossbow",
    "2H_LIGHTCROSSBOW": "Light Crossbow",
    "2H_REPEATINGCROSSBOW_MORGANA": "Weeping Repeater",
    "2H_CROSSBOW_HELL": "Boltcasters",
    "2H_CROSSBOW_AVALON": "Energy Shaper",
    "2H_CROSSBOW_FEY": "Archlight Blasters",
    "2H_CROSSBOW_CRYSTAL": "Crystal Crossbow",

    // --- DAGGERS ---
    "MAIN_DAGGER": "Dagger",
    "2H_DAGGER_PAIR": "Dagger Pair",
    "2H_CLAW": "Claws",
    "MAIN_DAGGER_UNDEAD": "Bloodletter",
    "2H_DAGGER_MORGANA": "Deathgivers",
    "MAIN_DAGGER_HELL": "Demonfang",
    "2H_DAGGER_AVALON": "Bridled Fury",
    "2H_DAGGER_FEY": "Twin Slayers",

    // --- QUARTERSTAFFS ---
    "2H_QUARTERSTAFF": "Quarterstaff",
    "2H_IRONCLADEDSTAFF": "Iron-clad Staff",
    "2H_DOUBLEBLADEDSTAFF": "Double Bladed Staff",
    "2H_STATIONARY_STAFF": "Black Monk Stave",
    "2H_QUARTERSTAFF_HELL": "Soulscythe",
    "2H_QUARTERSTAFF_AVALON": "Grailseeker",
    "2H_QUARTERSTAFF_FEY": "Phantom Twinblade",
    "2H_QUARTERSTAFF_CRYSTAL": "Crystal Quarterstaff",

    // --- FIRE STAVES ---
    "MAIN_FIRESTAFF": "Fire Staff",
    "2H_FIRESTAFF": "Great Fire Staff",
    "2H_INFERNO_STAFF": "Infernal Staff",
    "MAIN_FIRESTAFF_MORGANA": "Wildfire Staff",
    "2H_FIRESTAFF_HELL": "Dawnsong",
    "2H_FIRESTAFF_FEY": "Firewalker Staff",
    "MAIN_FIRESTAFF_CRYSTAL": "Crystal Fire Staff",
    "2H_FIRESTAFF_CRYSTAL": "Crystal Pyromancer",

    // --- HOLY STAVES ---
    "MAIN_HOLYSTAFF": "Holy Staff",
    "2H_HOLYSTAFF": "Great Holy Staff",
    "2H_DIVINESTAFF": "Divine Staff",
    "MAIN_HOLYSTAFF_LANCER": "Lifetouch Staff",
    "2H_HOLYSTAFF_HELL": "Fallen Staff",
    "2H_HOLYSTAFF_AVALON": "Exalted Staff",
    "2H_HOLYSTAFF_FEY": "Hallowfall",
    "2H_HOLYSTAFF_CRYSTAL": "Crystal Holy Staff",

    // --- NATURE STAVES ---
    "MAIN_NATURESTAFF": "Nature Staff",
    "2H_NATURESTAFF": "Great Nature Staff",
    "2H_NATURESTAFF_KEEPER": "Wild Staff",
    "MAIN_NATURESTAFF_LANCER": "Druidic Staff",
    "2H_NATURESTAFF_HELL": "Blight Staff",
    "2H_NATURESTAFF_AVALON": "Forgebark Staff",
    "2H_NATURESTAFF_FEY": "Rampant Staff",
    "2H_NATURESTAFF_CRYSTAL": "Crystal Nature Staff",

    // --- CURSED STAVES ---
    "MAIN_CURSEDSTAFF": "Cursed Staff",
    "2H_CURSEDSTAFF": "Great Cursed Staff",
    "2H_DEMONIC_STAFF": "Demonic Staff",
    "MAIN_CURSEDSTAFF_MORGANA": "Lifecurse Staff",
    "2H_CURSEDSTAFF_HELL": "Cursed Skull",
    "2H_CURSEDSTAFF_AVALON": "Rotcaller Staff",
    "2H_CURSEDSTAFF_FEY": "Damnation Staff",
    "2H_CURSEDSTAFF_CRYSTAL": "Crystal Cursed Staff",

    // --- FROST STAVES ---
    "MAIN_FROSTSTAFF": "Frost Staff",
    "2H_FROSTSTAFF": "Great Frost Staff",
    "2H_GLACIAL_STAFF": "Glacial Staff",
    "MAIN_FROSTSTAFF_KEEPER": "Arctic Staff",
    "2H_FROSTSTAFF_HELL": "Icicle Staff",
    "2H_FROSTSTAFF_AVALON": "Permafrost Prism",
    "2H_FROSTSTAFF_FEY": "Chillhowl",
    "2H_FROSTSTAFF_CRYSTAL": "Crystal Frost Staff",

    // --- ARCANE STAVES ---
    "MAIN_ARCANESTAFF": "Arcane Staff",
    "2H_ARCANESTAFF": "Great Arcane Staff",
    "2H_ENIGMATICSTAFF": "Enigmatic Staff",
    "MAIN_ARCANESTAFF_MORGANA": "Witchwork Staff",
    "2H_ARCANESTAFF_HELL": "Occult Staff",
    "2H_ARCANESTAFF_AVALON": "Astral Staff",
    "2H_ARCANESTAFF_FEY": "Evensong",
    "2H_ARCANESTAFF_CRYSTAL": "Crystal Arcane Staff",

    // --- SHAPESHIFTERS ---
    "2H_SHAPESHIFTER_SET1": "Prowling Staff",
    "2H_SHAPESHIFTER_SET2": "Bloodmoon Staff",
    "2H_SHAPESHIFTER_SET3": "Lightcaller",
    "2H_SHAPESHIFTER_SET4": "Stillgaze Staff",
    "2H_SHAPESHIFTER_SET5": "Hellspawn Staff",
    "2H_SHAPESHIFTER_SET6": "Earthrune Staff",
    "2H_SHAPESHIFTER_AVALON": "Rootbound Staff",
    "2H_SHAPESHIFTER_CRYSTAL": "Crystal Shapeshifter Staff",

    // --- CAPES ---
    "CAPE_STANDARD_LIMHURST": "Lymhurst Cape",
    "CAPE_STANDARD_BRIDGELAND": "Bridgewatch Cape",
    "CAPE_STANDARD_FORTSTERLING": "Fort Sterling Cape",
    "CAPE_STANDARD_MARTLOCK": "Martlock Cape",
    "CAPE_STANDARD_THETFORD": "Thetford Cape",
    "CAPE_STANDARD_CAERLEON": "Caerleon Cape",
    "CAPE_MORGANA": "Morgana Cape",
    "CAPE_KEEPER": "Keeper Cape",
    "CAPE_BRECILIEN": "Brecilien Cape",
    "CAPE_HERETIC": "Heretic Cape",
    "CAPE_UNDEAD": "Undead Cape",
    "CAPE_DEMON": "Demon Cape",
    "CAPE_AVALON": "Avalonian Cape",
    "CAPE_SMUGGLER": "Smuggler Cape"
};

function formatItemName(itemId) {
  if (!itemId) return "";
  
  let enchantment = "";
  let cleanId = itemId;
  if (itemId.includes("@")) {
    const partsAt = itemId.split("@");
    cleanId = partsAt[0];
    enchantment = `.${partsAt[1]}`;
  }

  const parts = cleanId.split("_");
  const tier = parts[0];
  const baseKey = parts.slice(1).join("_").trim().toUpperCase();

  let baseName = "";
  if (nameMap[baseKey]) {
    baseName = nameMap[baseKey];
  } else {
    baseName = parts.slice(1).map(part => {
      if (part.startsWith("SET")) return "Set " + part.replace("SET", "");
      return part.charAt(0) + part.slice(1).toLowerCase();
    }).join(" ");
  }

  return `${tier}${enchantment} ${baseName}`;
}

function getUIFilters() {
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));

  let tiers = checkboxes
    .map(cb => cb.value.toUpperCase().trim())
    .filter(val => /^T[4-8]$/.test(val) || ['4','5','6','7','8'].includes(val))
    .map(val => val.startsWith('T') ? val : `T${val}`);
  
  if (tiers.length === 0) tiers = ["T4", "T5", "T6", "T7", "T8"];

  let qualities = checkboxes
    .map(cb => getQualityNumber(cb.value))
    .filter(val => val >= 1 && val <= 5);
  if (qualities.length === 0) qualities = [1, 2, 3, 4, 5];

  let enchantments = checkboxes
    .map(cb => {
      const val = cb.value.trim();
      if (/^[0-4]$/.test(val)) return Number(val);
      if (/^\.[0-4]$/.test(val)) return Number(val.substring(1));
      if (/^@?[0-4]$/.test(val)) return Number(val.replace('@', ''));
      return null;
    })
    .filter(val => val !== null && val >= 0 && val <= 4);

  if (enchantments.length === 0) enchantments = [0, 1, 2, 3];

  const knownCities = ["Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Thetford", "Caerleon", "Brecilien", "Black Market"];
  let locations = checkboxes
    .map(cb => cb.value)
    .filter(val => knownCities.some(city => city.toLowerCase() === val.toLowerCase()));
  if (locations.length === 0) locations = knownCities;

  const budgetInput = document.getElementById('budget') || document.querySelector('input[type="number"]');
  const maxBudget = budgetInput ? Number(budgetInput.value) || Infinity : Infinity;

  return { tiers, qualities, enchantments, locations, maxBudget };
}

function generateItemIds(tiers, enchantments) {
  const weaponCategories = [
    "MAIN_SWORD", "2H_SWORD", "MAIN_SCIMITAR_MORGANA", "2H_SCIMITAR_MORGANA", "MAIN_NINJASWORD", "2H_CLEAVER_HELL", "2H_DUALSCIMITAR_AVALON", "2H_SWORD_FEY",
    "MAIN_AXE", "2H_AXE", "2H_HALBERD", "2H_HALBERD_MORGANA", "2H_COMPOSITEAXE_KEEPER", "2H_SCYTHE_HELL", "2H_AXE_AVALON", "2H_AXE_FEY",
    "MAIN_MACEMORGANA", "2H_MACE", "2H_MACE_KEEPER", "MAIN_MACE_HELL", "2H_ROCKMACE_KEEPER", "2H_MACE_AVALON", "2H_MACE_FEY", "MAIN_MACE_FEY",
    "MAIN_HAMMER", "2H_HAMMER", "2H_POLEHAMMER_KEEPER", "2H_HAMMER_HELL", "2H_HAMMER_AVALON", "2H_RAM_AVALON", "2H_HAMMER_FEY", "2H_HAMMER_CRYSTAL",
    "2H_WARGLOVE", "2H_WARGLOVE_AVALON", "2H_COMBAT_MORGANA", "2H_COMBAT_HELL", "2H_WARGLOVE_KEEPER", "2H_WARGLOVE_FEY", "2H_WARGLOVE_CRYSTAL1", "2H_WARGLOVE_CRYSTAL2",
    "MAIN_SPEAR", "2H_SPEAR", "2H_SPEAR_KEEPER", "MAIN_SPEAR_LANCER", "2H_HARPOON_HELL", "2H_SPEAR_AVALON", "2H_SPEAR_FEY", "2H_SPEAR_CRYSTAL",
    "MAIN_BOW", "2H_WARBOW", "2H_LONGBOW", "2H_COMPOSITEBOW_KEEPER", "2H_BOW_HELL", "2H_BOW_AVALON", "2H_BOW_FEY", "2H_BOW_CRYSTAL",
    "2H_CROSSBOW", "2H_CROSSBOWLARGE", "2H_LIGHTCROSSBOW", "2H_REPEATINGCROSSBOW_MORGANA", "2H_CROSSBOW_HELL", "2H_CROSSBOW_AVALON", "2H_CROSSBOW_FEY", "2H_CROSSBOW_CRYSTAL",
    "MAIN_DAGGER", "2H_DAGGER_PAIR", "2H_CLAW", "MAIN_DAGGER_UNDEAD", "2H_DAGGER_MORGANA", "MAIN_DAGGER_HELL", "2H_DAGGER_AVALON", "2H_DAGGER_FEY",
    "2H_QUARTERSTAFF", "2H_IRONCLADEDSTAFF", "2H_DOUBLEBLADEDSTAFF", "2H_STATIONARY_STAFF", "2H_QUARTERSTAFF_HELL", "2H_QUARTERSTAFF_AVALON", "2H_QUARTERSTAFF_FEY", "2H_QUARTERSTAFF_CRYSTAL",
    "MAIN_FIRESTAFF", "2H_FIRESTAFF", "2H_INFERNO_STAFF", "MAIN_FIRESTAFF_MORGANA", "2H_FIRESTAFF_HELL", "2H_FIRESTAFF_FEY", "MAIN_FIRESTAFF_CRYSTAL", "2H_FIRESTAFF_CRYSTAL",
    "MAIN_HOLYSTAFF", "2H_HOLYSTAFF", "2H_DIVINESTAFF", "MAIN_HOLYSTAFF_LANCER", "2H_HOLYSTAFF_HELL", "2H_HOLYSTAFF_AVALON", "2H_HOLYSTAFF_FEY", "2H_HOLYSTAFF_CRYSTAL",
    "MAIN_NATURESTAFF", "2H_NATURESTAFF", "2H_NATURESTAFF_KEEPER", "MAIN_NATURESTAFF_LANCER", "2H_NATURESTAFF_HELL", "2H_NATURESTAFF_AVALON", "2H_NATURESTAFF_FEY", "2H_NATURESTAFF_CRYSTAL",
    "MAIN_CURSEDSTAFF", "2H_CURSEDSTAFF", "2H_DEMONIC_STAFF", "MAIN_CURSEDSTAFF_MORGANA", "2H_CURSEDSTAFF_HELL", "2H_CURSEDSTAFF_AVALON", "2H_CURSEDSTAFF_FEY", "2H_CURSEDSTAFF_CRYSTAL",
    "MAIN_FROSTSTAFF", "2H_FROSTSTAFF", "2H_GLACIAL_STAFF", "MAIN_FROSTSTAFF_KEEPER", "2H_FROSTSTAFF_HELL", "2H_FROSTSTAFF_AVALON", "2H_FROSTSTAFF_FEY", "2H_FROSTSTAFF_CRYSTAL",
    "MAIN_ARCANESTAFF", "2H_ARCANESTAFF", "2H_ENIGMATICSTAFF", "MAIN_ARCANESTAFF_MORGANA", "2H_ARCANESTAFF_HELL", "2H_ARCANESTAFF_AVALON", "2H_ARCANESTAFF_FEY", "2H_ARCANESTAFF_CRYSTAL",
    "2H_SHAPESHIFTER_SET1", "2H_SHAPESHIFTER_SET2", "2H_SHAPESHIFTER_SET3", "2H_SHAPESHIFTER_SET4", "2H_SHAPESHIFTER_SET5", "2H_SHAPESHIFTER_SET6", "2H_SHAPESHIFTER_AVALON", "2H_SHAPESHIFTER_CRYSTAL"
  ];

  const armorCategories = [
    "ARMOR_CLOTH_SET1", "HEAD_CLOTH_SET1", "SHOES_CLOTH_SET1",
    "ARMOR_CLOTH_SET2", "HEAD_CLOTH_SET2", "SHOES_CLOTH_SET2",
    "ARMOR_CLOTH_SET3", "HEAD_CLOTH_SET3", "SHOES_CLOTH_SET3",
    "ARMOR_CLOTH_ROYAL", "HEAD_CLOTH_ROYAL", "SHOES_CLOTH_ROYAL",
    "ARMOR_CLOTH_KEEPER", "HEAD_CLOTH_KEEPER", "SHOES_CLOTH_KEEPER",
    "ARMOR_CLOTH_HELL", "HEAD_CLOTH_HELL", "SHOES_CLOTH_HELL",
    "ARMOR_CLOTH_MORGANA", "HEAD_CLOTH_MORGANA", "SHOES_CLOTH_MORGANA",
    "ARMOR_CLOTH_FEY", "HEAD_CLOTH_FEY", "SHOES_CLOTH_FEY",
    "ARMOR_CLOTH_AVALON", "HEAD_CLOTH_AVALON", "SHOES_CLOTH_AVALON",

    "ARMOR_LEATHER_SET1", "HEAD_LEATHER_SET1", "SHOES_LEATHER_SET1",
    "ARMOR_LEATHER_SET2", "HEAD_LEATHER_SET2", "SHOES_LEATHER_SET2",
    "ARMOR_LEATHER_SET3", "HEAD_LEATHER_SET3", "SHOES_LEATHER_SET3",
    "ARMOR_LEATHER_ROYAL", "HEAD_LEATHER_ROYAL", "SHOES_LEATHER_ROYAL",
    "ARMOR_LEATHER_MORGANA", "HEAD_LEATHER_MORGANA", "SHOES_LEATHER_MORGANA",
    "ARMOR_LEATHER_HELL", "HEAD_LEATHER_HELL", "SHOES_LEATHER_HELL",
    "ARMOR_LEATHER_KEEPER", "HEAD_LEATHER_KEEPER", "SHOES_LEATHER_KEEPER",
    "ARMOR_LEATHER_FEY", "HEAD_LEATHER_FEY", "SHOES_LEATHER_FEY",
    "ARMOR_LEATHER_AVALON", "HEAD_LEATHER_AVALON", "SHOES_LEATHER_AVALON",

    "ARMOR_PLATE_SET1", "HEAD_PLATE_SET1", "SHOES_PLATE_SET1",
    "ARMOR_PLATE_SET2", "HEAD_PLATE_SET2", "SHOES_PLATE_SET2",
    "ARMOR_PLATE_SET3", "HEAD_PLATE_SET3", "SHOES_PLATE_SET3",
    "ARMOR_PLATE_ROYAL", "HEAD_PLATE_ROYAL", "SHOES_PLATE_ROYAL",
    "ARMOR_PLATE_UNDEAD", "HEAD_PLATE_UNDEAD", "SHOES_PLATE_UNDEAD",
    "ARMOR_PLATE_HELL", "HEAD_PLATE_HELL", "SHOES_PLATE_HELL",
    "ARMOR_PLATE_KEEPER", "HEAD_PLATE_KEEPER", "SHOES_PLATE_KEEPER",
    "ARMOR_PLATE_FEY", "HEAD_PLATE_FEY", "SHOES_PLATE_FEY",
    "ARMOR_PLATE_AVALON", "HEAD_PLATE_AVALON", "SHOES_PLATE_AVALON"
  ];

  const accessories = [
    "BAG", 
    "CAPE_STANDARD_LIMHURST", "CAPE_STANDARD_BRIDGELAND", "CAPE_STANDARD_FORTSTERLING", 
    "CAPE_STANDARD_MARTLOCK", "CAPE_STANDARD_THETFORD", "CAPE_STANDARD_CAERLEON", 
    "CAPE_MORGANA", "CAPE_KEEPER", "CAPE_BRECILIEN", "CAPE_HERETIC", 
    "CAPE_UNDEAD", "CAPE_DEMON", "CAPE_AVALON", "CAPE_SMUGGLER"
  ];

  const allBaseTypes = [...weaponCategories, ...armorCategories, ...accessories];
  const items = [];

  tiers.forEach(tier => {
    allBaseTypes.forEach(base => {
      enchantments.forEach(enc => {
        if (enc === 0) {
          items.push(`${tier}_${base}`);
        } else {
          items.push(`${tier}_${base}@${enc}`);
        }
      });
    });
  });

  return Array.from(new Set(items));
}

async function fetchAndMergeData(rawItemIds, progressCallback) {
  if (!rawItemIds) return [];

  let cleanItemIds = [];
  if (typeof rawItemIds === 'string') {
    cleanItemIds = rawItemIds.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(rawItemIds)) {
    cleanItemIds = rawItemIds
      .flat(Infinity)
      .flatMap(item => typeof item === 'string' ? item.split(',') : item)
      .map(s => String(s).trim())
      .filter(Boolean);
  }

  cleanItemIds = Array.from(new Set(cleanItemIds));
  if (cleanItemIds.length === 0) return [];

  const batches = chunkArray(cleanItemIds, BATCH_SIZE);
  const allResults = [];
  const queue = [...batches];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (!batch || batch.length === 0) break;

      const itemString = batch.join(",");
      const requestUrl = `${AODP_EUROPE_URL}${itemString}.json`;

      let success = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 3;

      while (!success && attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          // 8-second request timeout controller
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(requestUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const parsed = data.map(item => ({
              itemId: item.item_id || item.ItemId,
              city: item.city || item.City,
              quality: item.quality || item.Quality || 1,
              buyPrice: item.sell_price_min ?? item.SellPriceMin ?? 0,
              sellPrice: item.buy_price_max ?? item.BuyPriceMax ?? 0,
              updatedAt: Math.max(
                parseApiDate(item.sell_price_min_date || item.SellPriceMinDate), 
                parseApiDate(item.buy_price_max_date || item.BuyPriceMaxDate)
              )
            }));
            allResults.push(...parsed);
            success = true;
          }
        } catch (err) {
          if (attempts < MAX_ATTEMPTS) {
            // Wait briefly before retrying (400ms delay)
            await new Promise(r => setTimeout(r, 400 * attempts));
          } else {
            console.warn(`[DEBUG] Batch failed after ${MAX_ATTEMPTS} retries. Skipping.`);
          }
        }
      }

      completed++;
      if (progressCallback) {
        progressCallback(Math.round((completed / batches.length) * 100), completed, batches.length);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, batches.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const freshestMap = new Map();
  allResults.forEach(entry => {
    if (entry.buyPrice <= 0 && entry.sellPrice <= 0) return;
    const key = `${entry.itemId}_${entry.city}_${entry.quality}`;
    if (!freshestMap.has(key) || entry.updatedAt > freshestMap.get(key).updatedAt) {
      freshestMap.set(key, entry);
    }
  });

  return Array.from(freshestMap.values());
}

window.calculateAdvisor = async function() {
  const tableBody = document.getElementById('tableBody');
  const { tiers, enchantments } = getUIFilters();
  const targetItems = generateItemIds(tiers, enchantments);
  const totalBatches = Math.ceil(targetItems.length / BATCH_SIZE);

  if (tableBody) {
    tableBody.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f59e0b;">
        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 8px;">
          Searching Albion Europe Database: <span id="searchPercent">0%</span>
        </div>
        <div style="color: #94a3b8; font-size: 0.9rem;">
          Batch progress: <span id="searchBatches">0/${totalBatches}</span>
        </div>
      </div>
    `;
  }

  try {
    window.cachedMarketData = await fetchAndMergeData(targetItems, (percent, done, total) => {
      const percentEl = document.getElementById('searchPercent');
      const batchesEl = document.getElementById('searchBatches');
      if (percentEl) percentEl.textContent = `${percent}%`;
      if (batchesEl) batchesEl.textContent = `${done}/${total}`;
    });
  } catch (e) {
    console.error("Failed to fetch data inside calculateAdvisor:", e);
  }

  renderTable();
};

window.renderTable = function() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  if (!window.cachedMarketData || window.cachedMarketData.length === 0) {
    tableBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #f59e0b;">Click <strong>RUN</strong> above to search for market deals.</div>`;
    return;
  }

  const isPremium = document.getElementById('hasPremium')?.value === 'true' || 
                    document.getElementById('hasPremium')?.value?.includes('4%');
  const sortBy = document.getElementById('sortBy')?.value || 'margin';
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  const { qualities, locations, maxBudget } = getUIFilters();

  let tradeRoutes = [];
  const itemsGrouped = {};

  window.cachedMarketData.forEach(entry => {
    if (!qualities.includes(Number(entry.quality))) return;
    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  Object.values(itemsGrouped).forEach(cityList => {
    for (let buyEntry of cityList) {
      for (let sellEntry of cityList) {
        if (buyEntry.city === sellEntry.city) continue;
        if (buyEntry.buyPrice <= 0 || sellEntry.sellPrice <= 0) continue;

        const buyCityMatch = locations.some(l => l.toLowerCase() === buyEntry.city.toLowerCase());
        const sellCityMatch = locations.some(l => l.toLowerCase() === sellEntry.city.toLowerCase());
        if (!buyCityMatch || !sellCityMatch) continue;

        const totalCost = buyEntry.buyPrice * (1 + setupFee);
        if (totalCost > maxBudget) continue;

        const netRevenue = sellEntry.sellPrice * (1 - setupFee - taxRate);
        const profit = netRevenue - totalCost;
        
        if (profit <= 0) continue;

        const profitMargin = (profit / totalCost) * 100;

        tradeRoutes.push({
          itemId: buyEntry.itemId,
          quality: buyEntry.quality,
          fromCity: buyEntry.city,
          toCity: sellEntry.city,
          buyPrice: buyEntry.buyPrice,
          sellPrice: sellEntry.sellPrice,
          profit: profit,
          profitMargin: profitMargin,
          updatedAt: Math.min(buyEntry.updatedAt, sellEntry.updatedAt)
        });
      }
    }
  });

  const bestRoutesMap = new Map();
  tradeRoutes.forEach(route => {
    const groupKey = `${route.itemId}|${route.quality}|${route.toCity}`;
    if (!bestRoutesMap.has(groupKey)) {
      bestRoutesMap.set(groupKey, route);
    } else {
      const existing = bestRoutesMap.get(groupKey);
      if (
        route.profitMargin > existing.profitMargin || 
        (route.profitMargin === existing.profitMargin && route.profit > existing.profit)
      ) {
        bestRoutesMap.set(groupKey, route);
      }
    }
  });
  tradeRoutes = Array.from(bestRoutesMap.values());

  if (sortBy.toLowerCase().includes('name')) {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy.toLowerCase().includes('update')) {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #f59e0b;">No profitable trade routes match your current filters.</div>`;
    return;
  }

  tradeRoutes.forEach((route) => {
    let ageDisplay = "Age: Unknown";
    if (route.updatedAt > 0) {
      const minsAgo = Math.floor((Date.now() - route.updatedAt) / 60000);
      if (minsAgo <= 0) {
        ageDisplay = "Age: Just now";
      } else if (minsAgo < 60) {
        ageDisplay = `Age: ${minsAgo}m`;
      } else {
        const hours = Math.floor(minsAgo / 60);
        const mins = minsAgo % 60;
        ageDisplay = `Age: ${hours}h ${mins}m`;
      }
    }

    const profitClass = route.profit >= 0 ? 'profit-positive' : 'profit-negative';
    const readableName = formatItemName(route.itemId);

    const rowHTML = `
      <div class="table-row">
        <div class="item-title-container">
          <div class="item-title">${readableName}</div>
          <div class="item-subtext" style="font-size: 0.75rem; color: #64748b;">ID: ${route.itemId} | Quality: ${route.quality}</div>
        </div>
        <div><span class="badge-update">${ageDisplay}</span></div>
        <div class="price-cell">
          <div class="city-info">${route.fromCity}</div>
          <div class="price-val">${Math.round(route.buyPrice).toLocaleString()} silver</div>
        </div>
        <div class="price-cell">
          <div class="city-info">${route.toCity}</div>
          <div class="price-val">${Math.round(route.sellPrice).toLocaleString()} silver</div>
        </div>
        <div class="${profitClass}">${Math.round(route.profit).toLocaleString()} silver</div>
        <div class="margin-val">${route.profitMargin.toFixed(2)} %</div>
      </div>
    `;
    tableBody.innerHTML += rowHTML;
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('runBtn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      window.calculateAdvisor();
    });
  }
  
  window.renderTable();
});
