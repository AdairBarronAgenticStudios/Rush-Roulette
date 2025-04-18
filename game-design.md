# 🎮 Rush Roulette - Game Design Document

## 📋 Overview
Rush Roulette is a real-time, multiplayer web game where players race against each other in a scavenger hunt-style challenge powered by AI and webcam item recognition.

## 🎯 Core Mechanics

### Game Structure
- **Session Duration**: ~5-10 minutes
- **Players per Session**: Up to 8 players
- **Rounds per Session**: 3 rounds
- **Time per Round**: ~1-2 minutes

### Round Progression
1. **Round 1 - Common Items**
   - Items: Everyday household objects (spoon, pen, book, etc.)
   - Difficulty: Easy
   - Points: Base value (100 points for first place)

2. **Round 2 - Specific Items**
   - Items: More specific household objects (tape measure, candle, etc.)
   - Difficulty: Medium
   - Points: 1.5x multiplier (150 points for first place)

3. **Round 3 - Rare Items**
   - Items: Rare or specific items (birthday card, red screwdriver, etc.)
   - Difficulty: Hard
   - Points: 2x multiplier (200 points for first place)

### Game Flow
1. **Pre-Game**
   - Players join automatically through matchmaking
   - Room fills to capacity (max 8 players)
   - Brief introduction/tutorial for new players

2. **Round Start**
   - Countdown (3, 2, 1)
   - Item revealed to all players simultaneously
   - Timer starts

3. **Item Search**
   - Players search for the item in their environment
   - Real-time updates of other players' progress
   - Leaderboard updates as players complete the round

4. **Item Verification**
   - Player returns with item
   - Holds item in front of webcam
   - AI verifies item correctness
   - Points awarded based on completion time

5. **Round End**
   - All players complete or time runs out
   - Round summary shown
   - Brief pause before next round

6. **Game End**
   - Final scores calculated
   - Leaderboard displayed
   - Rewards distributed

### Scoring System
- **Base Points**: 100 points for first place
- **Time Bonus**: Additional points for faster completion
- **Round Multiplier**: 
  - Round 1: 1x
  - Round 2: 1.5x
  - Round 3: 2x
- **Placement Points**:
  - 1st: 100% of round points
  - 2nd: 80% of round points
  - 3rd: 60% of round points
  - 4th: 40% of round points
  - 5th-8th: 20% of round points

### Item Selection Criteria
1. **Common Items (Round 1)**
   - Found in most households
   - Easy to identify
   - Quick to locate
   - Examples: spoon, pen, book, cup

2. **Specific Items (Round 2)**
   - More specific characteristics
   - May require searching
   - Clear identification criteria
   - Examples: tape measure, candle, scissors

3. **Rare Items (Round 3)**
   - Specific attributes required
   - May be harder to find
   - Unique characteristics
   - Examples: birthday card, red screwdriver, specific book

### AI Verification System
- **Confidence Threshold**: 85% minimum for item recognition
- **Verification Time**: < 2 seconds
- **Feedback**:
  - Success: "Item verified! +X points"
  - Failure: "Item not recognized. Please try again."
  - Wrong Item: "Incorrect item. Please find: [item name]"

### Anti-Cheating Measures
1. **Time Validation**
   - Minimum time threshold for item retrieval
   - Maximum time limit per round

2. **Item Verification**
   - Multiple angle verification
   - Size/scale validation
   - Background context checking

3. **Player Behavior**
   - Unusual movement patterns detection
   - Multiple submission prevention
   - Network latency compensation

## 🎨 Visual Design
- **Color Scheme**: Bright, energetic colors
- **UI Elements**: Large, clear text and buttons
- **Animations**: Smooth transitions and feedback
- **Accessibility**: High contrast, readable fonts

## 🎮 Player Experience
- **Engagement**: Fast-paced, competitive gameplay
- **Feedback**: Clear, immediate response to actions
- **Progression**: Visible rewards and achievements
- **Social**: Real-time interaction with other players 