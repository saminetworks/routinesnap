import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SNAP_HELPER_LABELS,
  deriveSnapReason,
  qualityFlagList,
  SnapHelper,
} from "@/components/scan/snap-helper";
import { UNKNOWN_PHOTO_QUALITY, type PhotoQuality } from "@/lib/photo-quality";

/**
 * Tests for the snap helper (Part C).
 *
 * Note: this repo's vitest runs in a node environment with no DOM
 * renderer (@testing-library / jsdom are not installed), so rendering
 * is tested by calling the function component directly — it returns
 * `null` when closed and a React element when open — plus the pure
 * reason/flag helpers it is built on. Buttons are tested by walking
 * the returned element tree to the element with the right
 * `data-testid` and invoking its onClick prop.
 */

const qualityWith = (over: Partial<PhotoQuality>): PhotoQuality => ({
  ...UNKNOWN_PHOTO_QUALITY,
  ok: true,
  unknown: false,
  ...over,
});

type El = { type?: unknown; props?: Record<string, unknown> };

/** Depth-first walk of a createElement tree, collecting every element. */
function walk(el: unknown, out: El[] = []): El[] {
  if (!el || typeof el !== "object") return out;
  if (Array.isArray(el)) {
    for (const child of el) walk(child, out);
    return out;
  }
  const node = el as El;
  out.push(node);
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, out);
  } else {
    walk(children, out);
  }
  return out;
}

function findByTestId(el: unknown, testId: string): El | undefined {
  return walk(el).find((n) => n.props?.["data-testid"] === testId);
}

function click(el: unknown, testId: string): void {
  const node = findByTestId(el, testId);
  expect(node, `expected a button with data-testid="${testId}"`).toBeDefined();
  (node?.props?.onClick as () => void)();
}

describe("deriveSnapReason", () => {
  it("returns the code's own reason for rate_limited / invalid_image / ai_unavailable", () => {
    const badPhoto = qualityWith({ dark: true, blurry: true, glare: true });
    expect(deriveSnapReason("rate_limited", badPhoto)).toBe("rate_limited");
    expect(deriveSnapReason("invalid_image", badPhoto)).toBe("invalid_image");
    expect(deriveSnapReason("ai_unavailable", badPhoto)).toBe("ai_unavailable");
    expect(deriveSnapReason("rate_limited")).toBe("rate_limited");
  });

  it("blames the photo when quality flags are set on a generic failure", () => {
    expect(deriveSnapReason("invalid_output", qualityWith({ blurry: true }))).toBe("photo_quality");
    expect(deriveSnapReason("extraction_failed", qualityWith({ dark: true }))).toBe("photo_quality");
    expect(deriveSnapReason("serverError", qualityWith({ glare: true }))).toBe("photo_quality");
    expect(deriveSnapReason("extractError", qualityWith({ dark: true, blurry: true }))).toBe(
      "photo_quality",
    );
    expect(deriveSnapReason(undefined, qualityWith({ dark: true }))).toBe("photo_quality");
    expect(deriveSnapReason(null, qualityWith({ glare: true }))).toBe("photo_quality");
  });

  it("stays on the code's reason when the photo looks fine", () => {
    const goodPhoto = qualityWith({ meanLuminance: 200, laplacianVariance: 500 });
    expect(deriveSnapReason("invalid_output", goodPhoto)).toBe("invalid_output");
    expect(deriveSnapReason("extraction_failed", goodPhoto)).toBe("unknown");
    expect(deriveSnapReason(undefined, goodPhoto)).toBe("unknown");
    expect(deriveSnapReason(undefined, undefined)).toBe("unknown");
  });

  it("never blames the photo when quality is unknown, and never claims 'cropped'", () => {
    expect(deriveSnapReason("extraction_failed", UNKNOWN_PHOTO_QUALITY)).toBe("unknown");
    expect(deriveSnapReason(undefined, UNKNOWN_PHOTO_QUALITY)).toBe("unknown");
    // No reason string anywhere mentions a crop.
    expect(Object.values(DEFAULT_SNAP_HELPER_LABELS).join(" ")).not.toMatch(/cropp/i);
  });
});

describe("qualityFlagList", () => {
  it("lists set flags in dark / blurry / glare order", () => {
    expect(qualityFlagList(qualityWith({ glare: true, dark: true }))).toEqual(["dark", "glare"]);
    expect(qualityFlagList(qualityWith({ blurry: true }))).toEqual(["blurry"]);
    expect(qualityFlagList(qualityWith({}))).toEqual([]);
    expect(qualityFlagList(UNKNOWN_PHOTO_QUALITY)).toEqual([]);
    expect(qualityFlagList(null)).toEqual([]);
    expect(qualityFlagList(undefined)).toEqual([]);
  });
});

describe("SnapHelper rendering", () => {
  it("renders nothing when closed", () => {
    expect(SnapHelper({})).toBeNull();
    expect(SnapHelper({ open: false, errorCode: "extraction_failed" })).toBeNull();
  });

  it("shows the right reason for each error code", () => {
    const cases: [string, string][] = [
      ["rate_limited", "free scans"],
      ["invalid_image", "couldn't be used"],
      ["ai_unavailable", "busy right now"],
      ["invalid_output", "couldn't make sense"],
      ["extraction_failed", "couldn't tell exactly"],
      ["serverError", "couldn't tell exactly"],
      ["extractError", "couldn't tell exactly"],
    ];
    for (const [code, fragment] of cases) {
      const rendered = JSON.stringify(SnapHelper({ open: true, errorCode: code }));
      expect(rendered).toContain(fragment);
    }
  });

  it("shows the photo-quality reason + the specific quality notes when the photo is suspect", () => {
    const rendered = JSON.stringify(
      SnapHelper({
        open: true,
        errorCode: "extraction_failed",
        quality: qualityWith({ dark: true, glare: true }),
      }),
    );
    expect(rendered).toContain("hard to read");
    expect(rendered).toContain("too dark");
    expect(rendered).toContain("bright glare");
    expect(rendered).not.toContain("blurry");
  });

  it("shows no quality notes for a good or unknown photo", () => {
    const good = JSON.stringify(SnapHelper({ open: true, errorCode: "invalid_output", quality: qualityWith({}) }));
    expect(good).not.toContain("snap-helper-quality");
    const unknown = JSON.stringify(
      SnapHelper({ open: true, errorCode: "invalid_output", quality: UNKNOWN_PHOTO_QUALITY }),
    );
    expect(unknown).not.toContain("snap-helper-quality");
  });

  it("shows the tips list only when tipsOpen", () => {
    const closed = JSON.stringify(SnapHelper({ open: true }));
    expect(closed).not.toContain("snap-helper-tips");
    const open = JSON.stringify(SnapHelper({ open: true, tipsOpen: true }));
    expect(open).toContain("How to take a good photo");
    expect(open).toContain("Fill the frame");
  });
});

describe("SnapHelper actions", () => {
  it("fires all four callbacks from their buttons", () => {
    const onRetake = vi.fn();
    const onShowTips = vi.fn();
    const onRetry = vi.fn();
    const onManualAdd = vi.fn();
    const onClose = vi.fn();
    const el = SnapHelper({ open: true, onRetake, onShowTips, onRetry, onManualAdd, onClose });
    click(el, "snap-retake");
    click(el, "snap-tips");
    click(el, "snap-retry");
    click(el, "snap-manual");
    click(el, "snap-close");
    expect(onRetake).toHaveBeenCalledTimes(1);
    expect(onShowTips).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onManualAdd).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits buttons whose callback was not passed", () => {
    const el = SnapHelper({ open: true, onRetry: vi.fn() });
    expect(findByTestId(el, "snap-retry")).toBeDefined();
    expect(findByTestId(el, "snap-retake")).toBeUndefined();
    expect(findByTestId(el, "snap-tips")).toBeUndefined();
    expect(findByTestId(el, "snap-manual")).toBeUndefined();
    expect(findByTestId(el, "snap-close")).toBeUndefined();
  });

  it("labels the tips button 'Hide tips' while tips are open", () => {
    const el = SnapHelper({ open: true, tipsOpen: true, onShowTips: vi.fn() });
    expect(JSON.stringify(findByTestId(el, "snap-tips"))).toContain("Hide tips");
    const el2 = SnapHelper({ open: true, tipsOpen: false, onShowTips: vi.fn() });
    expect(JSON.stringify(findByTestId(el2, "snap-tips"))).toContain("How to take a good photo");
  });
});
