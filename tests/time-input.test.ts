import { describe, expect, it } from "vitest";
import { addMinutes, parseTimeInput } from "@/lib/time-input";

describe("parseTimeInput", () => {
  it("passes 24-hour times through, padding the hour", () => {
    expect(parseTimeInput("13:00")).toBe("13:00");
    expect(parseTimeInput("08:30")).toBe("08:30");
    expect(parseTimeInput("8:30")).toBe("08:30");
    expect(parseTimeInput("0:05")).toBe("00:05");
  });

  it("converts 12-hour times with AM/PM to 24-hour", () => {
    expect(parseTimeInput("1:00 PM")).toBe("13:00");
    expect(parseTimeInput("1:00PM")).toBe("13:00");
    expect(parseTimeInput("1:00 pm")).toBe("13:00");
    expect(parseTimeInput("8:30 AM")).toBe("08:30");
    expect(parseTimeInput("8:30am")).toBe("08:30");
    expect(parseTimeInput("12:00 AM")).toBe("00:00");
    expect(parseTimeInput("12:00 PM")).toBe("12:00");
    expect(parseTimeInput("2:30 p.m.")).toBe("14:30");
  });

  it("accepts a bare hour with AM/PM", () => {
    expect(parseTimeInput("1pm")).toBe("13:00");
    expect(parseTimeInput("1 PM")).toBe("13:00");
    expect(parseTimeInput("8am")).toBe("08:00");
    expect(parseTimeInput("12am")).toBe("00:00");
  });

  it("rejects impossible or unreadable times instead of guessing", () => {
    expect(parseTimeInput("13:00 PM")).toBeNull();
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("8:75")).toBeNull();
    expect(parseTimeInput("half past eight")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("1:00 XM")).toBeNull();
  });

  it("understands time-of-day words in English, Bangla and Banglish", () => {
    expect(parseTimeInput("morning")).toBe("09:00");
    expect(parseTimeInput("afternoon")).toBe("14:00");
    expect(parseTimeInput("evening")).toBe("17:00");
    expect(parseTimeInput("night")).toBe("20:00");
    expect(parseTimeInput("noon")).toBe("12:00");
    expect(parseTimeInput("midnight")).toBe("00:00");
    expect(parseTimeInput("sokal")).toBe("09:00");
    expect(parseTimeInput("bekal")).toBe("16:00");
    expect(parseTimeInput("bikal")).toBe("16:00");
    expect(parseTimeInput("sondha")).toBe("18:00");
    expect(parseTimeInput("raat")).toBe("20:00");
    expect(parseTimeInput("সকাল")).toBe("09:00");
    expect(parseTimeInput("বিকাল")).toBe("16:00");
    expect(parseTimeInput("রাত")).toBe("20:00");
  });

  it("understands a number with a time-of-day word", () => {
    expect(parseTimeInput("9 in the evening")).toBe("21:00");
    expect(parseTimeInput("9 in the morning")).toBe("09:00");
    expect(parseTimeInput("9 bekal")).toBe("21:00");
    expect(parseTimeInput("9 sokal")).toBe("09:00");
    expect(parseTimeInput("12 in the afternoon")).toBe("12:00");
  });

  it("understands o'clock, Hh and compact times", () => {
    expect(parseTimeInput("9 o'clock")).toBe("09:00");
    expect(parseTimeInput("9 o'clock PM")).toBe("21:00");
    expect(parseTimeInput("9h30")).toBe("09:30");
    expect(parseTimeInput("9h")).toBe("09:00");
    expect(parseTimeInput("0900")).toBe("09:00");
    expect(parseTimeInput("09:00:00")).toBe("09:00");
  });
});

describe("addMinutes", () => {
  it("adds minutes within the day", () => {
    expect(addMinutes("09:00", 60)).toBe("10:00");
    expect(addMinutes("23:30", 60)).toBe("00:30");
  });
});
