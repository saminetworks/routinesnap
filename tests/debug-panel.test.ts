import { describe, expect, it } from "vitest";
import {
  ScanDebugPanel,
  formatBytes,
  formatImageSummary,
  formatLastExtract,
  isDebugPanelEnabled,
} from "@/components/scan/debug-panel";

/**
 * Tests for the scan debug panel (Part D).
 *
 * Note: this repo's vitest runs in a node environment with no DOM renderer
 * (@testing-library / jsdom are not installed), so rendering is tested by
 * calling the function component directly — it returns `null` when gated
 * off and a React element (root: <details>) when enabled — plus the pure
 * formatting helpers the component is built on. The component never
 * fetches and never receives image bytes or an API key.
 */

const image = {
  blob: { size: 1_258_291 } as Blob,
  width: 1600,
  height: 1284,
  type: "image/jpeg",
  dataUrl: "data:image/jpeg;base64,SECRET_IMAGE_BYTES",
  name: "routine.jpg",
  convertedFromHeic: false,
};

describe("isDebugPanelEnabled", () => {
  it("explicit enabled prop wins over the env flag", () => {
    process.env.NEXT_PUBLIC_DEBUG = "1";
    expect(isDebugPanelEnabled(false)).toBe(false);
    process.env.NEXT_PUBLIC_DEBUG = "0";
    expect(isDebugPanelEnabled(true)).toBe(true);
  });

  it("falls back to NEXT_PUBLIC_DEBUG === '1' when no prop is given", () => {
    process.env.NEXT_PUBLIC_DEBUG = "1";
    expect(isDebugPanelEnabled()).toBe(true);
    expect(isDebugPanelEnabled(undefined)).toBe(true);
    process.env.NEXT_PUBLIC_DEBUG = "0";
    expect(isDebugPanelEnabled()).toBe(false);
    delete process.env.NEXT_PUBLIC_DEBUG;
    expect(isDebugPanelEnabled()).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats B / KB / MB with one decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_258_291)).toBe("1.2 MB");
  });

  it("returns '—' for missing or invalid sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatImageSummary", () => {
  it("shows size and dimensions together", () => {
    expect(formatImageSummary(image)).toBe("1.2 MB · 1600×1284");
  });

  it("shows '—' with no image, and either half on its own", () => {
    expect(formatImageSummary(null)).toBe("—");
    expect(formatImageSummary(undefined)).toBe("—");
    expect(formatImageSummary({ width: 1600, height: 1284 })).toBe("1600×1284");
    expect(formatImageSummary({ sizeBytes: 2048 })).toBe("2.0 KB");
  });
});

describe("formatLastExtract", () => {
  it("shows '—' before any extraction has run", () => {
    expect(formatLastExtract(null)).toBe("—");
    expect(formatLastExtract(undefined)).toBe("—");
    expect(formatLastExtract({})).toBe("—");
  });

  it("shows status alone, or status + error code", () => {
    expect(formatLastExtract({ status: 200 })).toBe("200");
    expect(formatLastExtract({ status: 502, code: "extraction_failed" })).toBe(
      "502 · extraction_failed",
    );
    expect(formatLastExtract({ code: "ai_unavailable" })).toBe("ai_unavailable");
  });

  it("shows the raw error when the call never got a response", () => {
    expect(
      formatLastExtract({ status: null, code: "extractError", detail: "Failed to fetch" }),
    ).toBe("no response · extractError · Failed to fetch");
  });
});

describe("ScanDebugPanel gating", () => {
  it("renders nothing when disabled via prop or env", () => {
    expect(ScanDebugPanel({ enabled: false })).toBeNull();
    delete process.env.NEXT_PUBLIC_DEBUG;
    expect(ScanDebugPanel({})).toBeNull();
    process.env.NEXT_PUBLIC_DEBUG = "0";
    expect(ScanDebugPanel({})).toBeNull();
  });

  it("renders a <details> panel when enabled", () => {
    const el = ScanDebugPanel({ enabled: true });
    expect(el).not.toBeNull();
    expect((el as { type?: unknown }).type).toBe("details");
  });
});

describe("ScanDebugPanel content", () => {
  it("shows all supplied values when enabled", () => {
    const el = ScanDebugPanel({
      enabled: true,
      image,
      processing: "processed",
      lastExtract: { status: 502, code: "extraction_failed" },
      model: "claude-sonnet-5-5",
      extractor: "anthropic",
    });
    const rendered = JSON.stringify(el);
    expect(rendered).toContain("1.2 MB · 1600×1284");
    expect(rendered).toContain("image/jpeg");
    expect(rendered).toContain("Processed");
    expect(rendered).toContain("502 · extraction_failed");
    expect(rendered).toContain("claude-sonnet-5-5");
    expect(rendered).toContain("anthropic");
  });

  it("shows '—' for last extract before any run, 'unknown' model by default", () => {
    const el = ScanDebugPanel({ enabled: true, image, processing: "sent-as-is" });
    const rendered = JSON.stringify(el);
    expect(rendered).toContain("Sent as-is");
    expect(rendered).toContain("unknown");
    // The "—" placeholder appears for the missing last-extract / extractor rows.
    expect(rendered).toContain("—");
  });

  it("never exposes image content", () => {
    const el = ScanDebugPanel({ enabled: true, image });
    expect(JSON.stringify(el)).not.toContain("SECRET_IMAGE_BYTES");
    expect(JSON.stringify(el)).not.toContain("data:image/jpeg");
  });
});
