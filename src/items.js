/**
 * Item database and selection logic for the game
 */

// Database of items that can be used in the game
// Each item has a name, difficulty level, and keywords for detection
const itemDatabase = [
  // Common household items (easy)
  { 
    name: "Coffee Mug", 
    difficulty: "easy",
    keywords: ["mug", "coffee mug", "cup"],
    description: "A container used for drinking hot beverages"
  },
  { 
    name: "Spoon", 
    difficulty: "easy",
    keywords: ["spoon", "tablespoon", "teaspoon"],
    description: "A utensil with a shallow bowl-shaped end"
  },
  { 
    name: "Book", 
    difficulty: "easy",
    keywords: ["book", "novel", "textbook"],
    description: "A set of printed pages bound together"
  },
  { 
    name: "Pen", 
    difficulty: "easy",
    keywords: ["pen", "ballpoint", "writing implement"],
    description: "A writing instrument using ink"
  },
  { 
    name: "Phone", 
    difficulty: "easy",
    keywords: ["phone", "smartphone", "mobile phone", "cell phone"],
    description: "A portable communication device"
  },
  { 
    name: "Water Bottle", 
    difficulty: "easy",
    keywords: ["bottle", "water bottle"],
    description: "A container for holding water"
  },
  { 
    name: "Headphones", 
    difficulty: "easy",
    keywords: ["headphones", "headset", "earphones"],
    description: "Audio device worn over or in the ears"
  },
  
  // Medium difficulty items
  { 
    name: "Tennis Ball", 
    difficulty: "medium",
    keywords: ["tennis ball", "ball"],
    description: "A rubber ball covered with felt, used in tennis"
  },
  { 
    name: "Sticky Notes", 
    difficulty: "medium",
    keywords: ["sticky note", "post-it", "note"],
    description: "Small pieces of paper with an adhesive strip"
  },
  { 
    name: "Scissors", 
    difficulty: "medium",
    keywords: ["scissors", "shears", "cutting tool"],
    description: "A cutting instrument with two blades"
  },
  { 
    name: "Remote Control", 
    difficulty: "medium",
    keywords: ["remote", "remote control", "tv remote"],
    description: "A device used to control electronics from a distance"
  },
  { 
    name: "Hat", 
    difficulty: "medium",
    keywords: ["hat", "cap", "beanie"],
    description: "A covering for the head"
  },
  { 
    name: "Umbrella", 
    difficulty: "medium",
    keywords: ["umbrella", "parasol"],
    description: "A device used for protection against rain or sun"
  },
  
  // Harder to find items
  { 
    name: "Ruler", 
    difficulty: "hard",
    keywords: ["ruler", "measuring stick", "measuring tool"],
    description: "A straight edge used for measuring or drawing straight lines"
  },
  { 
    name: "Tape Measure", 
    difficulty: "hard",
    keywords: ["tape measure", "measuring tape"],
    description: "A flexible ruler used to measure length or distance"
  },
  { 
    name: "Stapler", 
    difficulty: "hard",
    keywords: ["stapler", "staple"],
    description: "A device used to bind papers together with metal staples"
  },
  { 
    name: "Playing Cards", 
    difficulty: "hard",
    keywords: ["playing cards", "cards", "card deck"],
    description: "A set of cards used for playing games"
  },
  { 
    name: "Safety Pin", 
    difficulty: "hard",
    keywords: ["safety pin", "pin"],
    description: "A pin with a clasp and a point protected by a guard"
  },
  { 
    name: "Calculator", 
    difficulty: "hard",
    keywords: ["calculator", "calc"],
    description: "An electronic device used for mathematical calculations"
  },
  
  // Very specific or rare items (very hard)
  { 
    name: "Rubber Duck", 
    difficulty: "very hard",
    keywords: ["rubber duck", "duck", "bath toy"],
    description: "A small yellow rubber toy duck"
  },
  { 
    name: "Paper Clip", 
    difficulty: "very hard",
    keywords: ["paper clip", "paperclip", "clip"],
    description: "A bent wire used to hold papers together"
  },
  { 
    name: "Thimble", 
    difficulty: "very hard",
    keywords: ["thimble", "sewing thimble"],
    description: "A small hard cap worn on the finger during sewing"
  },
  { 
    name: "Guitar Pick", 
    difficulty: "very hard",
    keywords: ["guitar pick", "pick", "plectrum"],
    description: "A small flat tool used to pluck the strings of a guitar"
  },
  { 
    name: "Magnifying Glass", 
    difficulty: "very hard",
    keywords: ["magnifying glass", "magnifier"],
    description: "A convex lens used to produce a magnified image"
  }
];

/**
 * Gets difficulty mapping based on current round and total rounds
 * @param {number} currentRound - The current round number
 * @param {number} totalRounds - Total number of rounds in game
 * @return {Object} Difficulty weights for this round
 */
function getDifficultyWeights(currentRound, totalRounds) {
  // Calculate progress through the game (0 to 1)
  const progress = currentRound / totalRounds;
  
  if (progress < 0.2) {
    // First 20% of rounds - mostly easy items
    return { easy: 0.7, medium: 0.3, hard: 0, "very hard": 0 };
  } else if (progress < 0.5) {
    // 20-50% - mix of easy and medium
    return { easy: 0.4, medium: 0.5, hard: 0.1, "very hard": 0 };
  } else if (progress < 0.8) {
    // 50-80% - mostly medium with some hard
    return { easy: 0.1, medium: 0.5, hard: 0.4, "very hard": 0 };
  } else {
    // Final rounds - hard and very hard
    return { easy: 0, medium: 0.2, hard: 0.5, "very hard": 0.3 };
  }
}

/**
 * Gets a random item appropriate for the current round
 * @param {number} currentRound - The current round number
 * @param {number} totalRounds - Total number of rounds in game
 * @param {Array} previousItems - Optional array of previous items to avoid repeats
 * @return {Object} A randomly selected item
 */
function getRandomItem(currentRound = 1, totalRounds = 5, previousItems = []) {
  // Get difficulty weights for current round
  const weights = getDifficultyWeights(currentRound, totalRounds);
  
  // Create a pool of items based on weights
  const itemPool = [];
  
  Object.keys(weights).forEach(difficulty => {
    if (weights[difficulty] > 0) {
      // Get items of this difficulty that weren't used before
      const eligibleItems = itemDatabase.filter(item => 
        item.difficulty === difficulty && 
        !previousItems.some(prev => prev.name === item.name)
      );
      
      // Calculate how many items of this difficulty to add to pool
      const count = Math.round(weights[difficulty] * 10);
      
      // Add items to pool (can be duplicates to increase probability)
      for (let i = 0; i < count; i++) {
        itemPool.push(...eligibleItems);
      }
    }
  });
  
  // If no eligible items, return random item from database
  if (itemPool.length === 0) {
    const unusedItems = itemDatabase.filter(item => 
      !previousItems.some(prev => prev.name === item.name)
    );
    
    if (unusedItems.length > 0) {
      return unusedItems[Math.floor(Math.random() * unusedItems.length)];
    }
    
    // If all items used, just pick random from database
    return itemDatabase[Math.floor(Math.random() * itemDatabase.length)];
  }
  
  // Pick random item from pool
  return itemPool[Math.floor(Math.random() * itemPool.length)];
}

/**
 * Gets all items matching a specific difficulty level
 * @param {string} difficulty - The difficulty level
 * @return {Array} Array of items matching the difficulty
 */
function getItemsByDifficulty(difficulty) {
  return itemDatabase.filter(item => item.difficulty === difficulty);
}

/**
 * Get all available items
 * @return {Array} All items in the database
 */
function getAllItems() {
  return [...itemDatabase];
}

/**
 * Find an item by name
 * @param {string} name - The item name to find
 * @return {Object|null} The item if found, null otherwise
 */
function findItemByName(name) {
  return itemDatabase.find(item => 
    item.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

// Exports
export {
  getRandomItem,
  getItemsByDifficulty,
  getAllItems,
  findItemByName,
  itemDatabase
}; 