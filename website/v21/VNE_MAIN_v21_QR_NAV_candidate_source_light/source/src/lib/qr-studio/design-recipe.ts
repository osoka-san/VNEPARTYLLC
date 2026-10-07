import {
  engineForPattern,
  NEW_RENDERER_ENGINES,
  parsePattern,
  readPatternFile,
  supportsPatternEngine,
  type Pattern,
} from "./pattern";
export type QrDesignRecipe = { engineVersion: string; pattern: Pattern };
export function currentDesignRecipe(pattern: Pattern): QrDesignRecipe {
  const clean = parsePattern(pattern);
  return { engineVersion: engineForPattern(clean), pattern: clean };
}
export function savedDesignRecipe(value: {
  engineVersion: string;
  pattern: Pattern;
}): QrDesignRecipe {
  const pattern = parsePattern(value.pattern);
  if (!supportsPatternEngine(value.engineVersion, pattern))
    throw new Error("Версия оформления не поддерживается.");
  return { engineVersion: value.engineVersion, pattern };
}
export function importedDesignRecipe(value: unknown): QrDesignRecipe {
  const imported = readPatternFile(value);
  const engine =
    value && typeof value === "object" && "engineVersion" in value
      ? value.engineVersion
      : undefined;
  return typeof engine === "string" && supportsPatternEngine(engine, imported.pattern)
    ? savedDesignRecipe({ engineVersion: engine, pattern: imported.pattern })
    : currentDesignRecipe(imported.pattern);
}

export function isNewDesignChoice(recipe: QrDesignRecipe) {
  return (
    !!recipe.pattern.template &&
    Object.hasOwn(NEW_RENDERER_ENGINES, recipe.pattern.template) &&
    recipe.engineVersion === engineForPattern(recipe.pattern)
  );
}
