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
        }
    ],
    rare: [
        // This category is currently empty - will be populated with new items
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