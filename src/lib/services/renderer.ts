import crypto from "crypto";

/**
 * Deterministic spintax parser.
 * Uses a seed (hash of contact email + step id) to pick the same variant every time.
 *
 * Syntax: {variant1|variant2|variant3}
 * Supports nesting: {Hi|{Hey|Hello}} {{first_name}}
 */
export function resolveSpintax(text: string, seed: string): string {
  // Create a deterministic random generator from seed
  let hash = seedToNumber(seed);

  function nextRandom(): number {
    // Simple LCG (Linear Congruential Generator)
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return hash / 0x7fffffff;
  }

  // Resolve from innermost to outermost
  let result = text;
  let maxIterations = 100; // prevent infinite loops with malformed spintax

  while (result.includes("{") && maxIterations > 0) {
    maxIterations--;
    // Find innermost { } that doesn't contain another {
    result = result.replace(/\{([^{}]+)\}/g, (match, group) => {
      // Check if this is a template variable like {{var}} — skip it
      // Template variables use double braces; spintax uses single
      if (match.startsWith("{{")) return match;

      const variants = group.split("|");
      if (variants.length === 1) return variants[0]; // not spintax, just braces
      const index = Math.floor(nextRandom() * variants.length);
      return variants[index];
    });
  }

  return result;
}

function seedToNumber(seed: string): number {
  const hash = crypto.createHash("md5").update(seed).digest();
  return hash.readUInt32BE(0);
}

/**
 * Replace template variables: {{variable_name}} or {{variable_name | default("fallback")}}
 */
export function resolveVariables(
  text: string,
  variables: Record<string, string | null | undefined>
): string {
  return text.replace(/\{\{(\s*[\w.]+\s*(?:\|\s*default\([^)]*\))?\s*)\}\}/g, (match, expr) => {
    const trimmed = expr.trim();

    // Check for default syntax: variable | default("value")
    const defaultMatch = trimmed.match(/^([\w.]+)\s*\|\s*default\(\s*["']([^"']*)["']\s*\)/);
    if (defaultMatch) {
      const varName = defaultMatch[1];
      const defaultValue = defaultMatch[2];
      const value = variables[varName];
      return value != null && value !== "" ? value : defaultValue;
    }

    // Simple variable
    const value = variables[trimmed];
    return value != null ? value : "";
  });
}

/**
 * Full template rendering pipeline:
 * 1. Resolve spintax (deterministic per contact+step)
 * 2. Resolve variables
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | null | undefined>,
  seed: string
): string {
  const afterSpintax = resolveSpintax(template, seed);
  return resolveVariables(afterSpintax, variables);
}

/**
 * Build the variable context for a contact
 */
export function buildContactVariables(
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    title: string | null;
    customFields: Record<string, string> | null;
  }
): Record<string, string | null> {
  return {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    company: contact.company,
    title: contact.title,
    // Spread custom fields
    ...(contact.customFields || {}),
  };
}
