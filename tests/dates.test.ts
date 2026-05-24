import { describe, it, expect } from "vitest";
import {
  calendarDate,
  toUtcMidi,
  firstOfMonth,
  isSameCalendarDay,
  parseCalendarDate,
  formatFr,
  formatEur,
} from "@/lib/dates";

describe("calendarDate", () => {
  it("retourne UTC midi du jour donné", () => {
    const d = calendarDate(2026, 4, 9); // 9 mai 2026
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(9);
    expect(d.getUTCHours()).toBe(12);
  });

  it("est stable peu importe le fuseau du serveur", () => {
    const a = calendarDate(2026, 4, 9);
    const b = calendarDate(2026, 4, 9);
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("toUtcMidi", () => {
  it("normalise une Date à 12:00 UTC sur le même jour-calendrier", () => {
    const input = new Date(Date.UTC(2026, 4, 9, 23, 30, 0));
    const out = toUtcMidi(input);
    expect(out.getUTCDate()).toBe(9);
    expect(out.getUTCHours()).toBe(12);
    expect(out.getUTCMinutes()).toBe(0);
  });
});

describe("firstOfMonth", () => {
  it("retourne le 1er du mois UTC midi", () => {
    const d = firstOfMonth(2026, 5); // juin (index 5)
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCHours()).toBe(12);
  });
});

describe("isSameCalendarDay", () => {
  it("vrai si même jour-calendrier UTC", () => {
    const a = new Date(Date.UTC(2026, 4, 9, 6));
    const b = new Date(Date.UTC(2026, 4, 9, 22));
    expect(isSameCalendarDay(a, b)).toBe(true);
  });

  it("faux si jour différent", () => {
    const a = new Date(Date.UTC(2026, 4, 9));
    const b = new Date(Date.UTC(2026, 4, 10));
    expect(isSameCalendarDay(a, b)).toBe(false);
  });

  it("null-safe : null vs null = true", () => {
    expect(isSameCalendarDay(null, null)).toBe(true);
  });

  it("null-safe : null vs date = false", () => {
    expect(isSameCalendarDay(null, new Date())).toBe(false);
  });
});

describe("parseCalendarDate", () => {
  it("parse une ISO en UTC midi", () => {
    const d = parseCalendarDate("2026-05-09");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(9);
    expect(d.getUTCHours()).toBe(12);
  });
});

describe("formatFr", () => {
  it("short = 'sam 9 mai' (ish, dépend de date-fns)", () => {
    const d = calendarDate(2026, 4, 9);
    expect(formatFr(d, "short")).toMatch(/sam\.? 9 mai/i);
  });

  it("long = 'samedi 9 mai 2026'", () => {
    const d = calendarDate(2026, 4, 9);
    expect(formatFr(d, "long")).toBe("samedi 9 mai 2026");
  });

  it("monthYear = 'Mai 2026' (capitalize)", () => {
    const d = calendarDate(2026, 4, 1);
    expect(formatFr(d, "monthYear")).toBe("Mai 2026");
  });

  it("monthShort = 'Mai'", () => {
    const d = calendarDate(2026, 4, 1);
    expect(formatFr(d, "monthShort")).toBe("Mai");
  });

  it("iso = '2026-05-09'", () => {
    const d = calendarDate(2026, 4, 9);
    expect(formatFr(d, "iso")).toBe("2026-05-09");
  });
});

describe("formatEur", () => {
  it("formate les nombres en EUR français", () => {
    expect(formatEur(1234.56)).toMatch(/1\s?234,56\s?€/);
  });

  it("renvoie '—' pour null/undefined/NaN", () => {
    expect(formatEur(null)).toBe("—");
    expect(formatEur(undefined)).toBe("—");
    expect(formatEur("")).toBe("—");
    expect(formatEur("not a number")).toBe("—");
  });

  it("accepte les strings numériques", () => {
    expect(formatEur("1234")).toMatch(/1\s?234\s?€/);
  });
});
