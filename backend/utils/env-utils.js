function parseEnvFile(content) {
  const vars = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        vars[key] = cleanValue;
      }
    }
  }
  
  return vars;
}

function maskEnvValue(value) {
  if (!value) return '';
  
  // Truncate long values to keep display clean
  const maxDisplayLength = 20;
  
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  
  if (value.length <= maxDisplayLength) {
    const firstTwo = value.substring(0, 2);
    const lastTwo = value.substring(value.length - 2);
    const middle = '*'.repeat(Math.max(0, value.length - 4));
    return firstTwo + middle + lastTwo;
  }
  
  // For very long values, just show first 2 chars + asterisks + last 2 chars
  const firstTwo = value.substring(0, 2);
  const lastTwo = value.substring(value.length - 2);
  const middleLength = Math.min(12, maxDisplayLength - 4); // Cap at reasonable length
  return firstTwo + '*'.repeat(middleLength) + lastTwo;
}

module.exports = {
  parseEnvFile,
  maskEnvValue
};