// DM Response Examples

function describeScene(location, mood) {
  // Example: Dramatic scene setting
  if (location === 'tavern') {
    return "The tavern door swings open with a groan. Inside, flickering firelight dances across weathered faces. A bard strums a melancholy tune in the corner.";
  }
}

function handlePlayerAction(action, context) {
  // Example: Responding to player creativity
  if (action.type === 'unconventional') {
    return {
      allowed: true,
      consequence: "I love it! Let's see how this plays out...",
      dcCheck: calculateDC(action.difficulty)
    };
  }
}

function createNPC(role, personality) {
  return {
    name: generateName(role),
    voice: personality === 'gruff' ? 'deep and gravelly' : 'light and quick',
    motivation: 'protect their secret',
    secret: 'knows location of fragment'
  };
}
