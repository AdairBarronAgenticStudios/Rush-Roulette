export const itemDatabase = {
    common: [
        {
            name: "tennis ball",
            keywords: ["ball", "sport", "yellow", "round"],
            synonyms: ["yellow ball", "sports ball", "tennis"]
        },
        {
            name: "spoon",
            keywords: ["utensil", "silverware", "eating", "kitchen"],
            synonyms: ["teaspoon", "tablespoon", "soup spoon", "eating utensil"]
        },
        {
            name: "book",
            keywords: ["reading", "text", "publication", "literature", "printed"],
            synonyms: ["novel", "textbook", "paperback", "hardcover", "reading material"]
        },
        {
            name: "pen",
            keywords: ["writing", "office", "stationery"],
            synonyms: ["ballpoint", "ink pen", "writing instrument"]
        },
        {
            name: "mechanical pencil",
            keywords: ["writing", "office", "stationery", "drawing"],
            synonyms: ["LED pencil", "automatic pencil", "clicking pencil", "drafting pencil"]
        },
        {
            name: "cup",
            keywords: ["drinking", "container", "mug"],
            synonyms: ["mug", "glass", "drinking vessel"]
        }
    ],
    specific: [
        {
            name: "scissors",
            keywords: ["tool", "cutting", "blade", "office"],
            synonyms: ["shears", "cutting tool", "clippers", "cutting implement"]
        },
        {
            name: "rubiks cube",
            keywords: ["puzzle", "toy", "cube", "game"],
            synonyms: ["cube puzzle", "rubix cube", "magic cube", "puzzle cube"]
        },
        {
            name: "tape measure",
            keywords: ["tool", "measurement", "length"],
            synonyms: ["measuring tape", "ruler", "yardstick"]
        },
        {
            name: "candle",
            keywords: ["light", "wax", "flame"],
            synonyms: ["tealight", "pillar", "wax candle"]
        },
        {
            name: "remote control",
            keywords: ["electronic", "TV", "device"],
            synonyms: ["remote", "clicker", "TV remote"]
        }
    ],
    rare: [
        {
            name: "birthday card",
            keywords: ["greeting", "paper", "celebration"],
            synonyms: ["greeting card", "celebration card", "wishes card"]
        },
        {
            name: "red screwdriver",
            keywords: ["tool", "red", "hardware"],
            synonyms: ["red-handled screwdriver", "crimson screwdriver"]
        },
        {
            name: "specific book",
            keywords: ["reading", "title", "author"],
            synonyms: ["named book", "particular book"]
        },
        {
            name: "blue toothbrush",
            keywords: ["hygiene", "blue", "dental"],
            synonyms: ["blue-handled toothbrush", "cyan toothbrush"]
        },
        {
            name: "water bottle",
            keywords: ["container", "drink", "beverage", "plastic"],
            synonyms: ["bottle", "drinking bottle", "reusable bottle", "drink container"]
        }
    ]
};

export function getRandomItem(difficulty) {
    const items = itemDatabase[difficulty];
    if (!items || items.length === 0) {
        throw new Error(`No items found for difficulty: ${difficulty}`);
    }
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
}

export function getAllKeywords(item) {
    const keywords = [...item.keywords];
    if (item.synonyms) {
        keywords.push(...item.synonyms);
    }
    return keywords;
}

export function findItemByName(name) {
    // Search through all difficulties
    for (const difficulty of Object.keys(itemDatabase)) {
        const item = itemDatabase[difficulty].find(item => 
            item.name.toLowerCase() === name.toLowerCase() ||
            (item.synonyms && item.synonyms.some(syn => syn.toLowerCase() === name.toLowerCase()))
        );
        if (item) {
            return { ...item, difficulty };
        }
    }
    return null;
} 