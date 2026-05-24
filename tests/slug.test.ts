import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercase + tirets", () => {
    expect(slugify("Jean Dupont")).toBe("jean-dupont");
  });

  it("strip les diacritiques", () => {
    expect(slugify("André Mêlée")).toBe("andre-melee");
    expect(slugify("Nordine Ganso")).toBe("nordine-ganso");
    expect(slugify("Émilie d'Ô")).toBe("emilie-d-o");
  });

  it("squash les tirets multiples", () => {
    expect(slugify("Hello   ---   World")).toBe("hello-world");
  });

  it("trim les tirets en bordure", () => {
    expect(slugify("---abc---")).toBe("abc");
  });

  it("retire la ponctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("string vide ou que ponctuation → string vide", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("renvoie le slug base si dispo", () => {
    expect(uniqueSlug("Jean Dupont", [])).toBe("jean-dupont");
    expect(uniqueSlug("Jean Dupont", ["autre", "machin"])).toBe("jean-dupont");
  });

  it("suffixe -2 si base déjà pris", () => {
    expect(uniqueSlug("Jean Dupont", ["jean-dupont"])).toBe("jean-dupont-2");
  });

  it("incrémente jusqu'à trouver un slug libre", () => {
    expect(
      uniqueSlug("Jean Dupont", ["jean-dupont", "jean-dupont-2", "jean-dupont-3"]),
    ).toBe("jean-dupont-4");
  });

  it("fallback 'x' si input se réduit à du vide", () => {
    expect(uniqueSlug("!!!", [])).toBe("x");
  });
});
