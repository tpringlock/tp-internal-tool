import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "./video";

describe("parseVideoUrl — YouTube", () => {
  it("parses a standard watch URL", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("parses a youtu.be short link", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("ignores extra query params like a timestamp", () => {
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"),
    ).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("accepts the mobile host and an already-embed URL", () => {
    expect(parseVideoUrl("https://m.youtube.com/watch?v=abc123_-XYZ")?.embedUrl).toBe(
      "https://www.youtube.com/embed/abc123_-XYZ",
    );
    expect(parseVideoUrl("https://www.youtube.com/embed/abc123_-XYZ")?.provider).toBe(
      "youtube",
    );
  });

  it("accepts a shorts URL", () => {
    expect(parseVideoUrl("https://www.youtube.com/shorts/abc123_-XYZ")?.embedUrl).toBe(
      "https://www.youtube.com/embed/abc123_-XYZ",
    );
  });
});

describe("parseVideoUrl — Vimeo", () => {
  it("parses a standard vimeo URL", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });

  it("parses a channel-scoped vimeo URL (last numeric segment)", () => {
    expect(
      parseVideoUrl("https://vimeo.com/channels/staffpicks/123456789")?.embedUrl,
    ).toBe("https://player.vimeo.com/video/123456789");
  });

  it("accepts an already-player embed URL", () => {
    expect(parseVideoUrl("https://player.vimeo.com/video/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });
});

describe("parseVideoUrl — rejections", () => {
  it("rejects non-URL input", () => {
    expect(parseVideoUrl("not a url")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
  });

  it("rejects non-http(s) protocols", () => {
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects unknown hosts", () => {
    expect(parseVideoUrl("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://vimeo.com.evil.com/123456789")).toBeNull();
    expect(parseVideoUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("rejects a youtube URL with no video id", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch")).toBeNull();
    expect(parseVideoUrl("https://youtu.be/")).toBeNull();
  });

  it("rejects a vimeo URL with no numeric id", () => {
    expect(parseVideoUrl("https://vimeo.com/notanumber")).toBeNull();
  });
});
